# Frontend

A Next.js 14 App Router application that builds to a **static export**. There is no
server-side rendering, no API routes, and no Node.js process in production — Express
serves the exported HTML and JS.

- [Stack](#stack)
- [Structure](#structure)
- [Data flow](#data-flow)
- [The API client](#the-api-client)
- [Filtering](#filtering)
- [Markdown rendering](#markdown-rendering)
- [Theming](#theming)
- [Build configuration](#build-configuration)
- [Testing](#testing)

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router, `output: 'export'`) |
| Language | TypeScript 5, strict |
| Styling | Tailwind CSS 3.4 + `@tailwindcss/typography` |
| Components | shadcn/ui over Radix primitives |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| Theme | next-themes |
| Package manager | npm (with `--legacy-peer-deps`) |

## Structure

```
app/
  layout.tsx              root layout, fonts, ThemeProvider
  page.tsx                landing page — session check, "Sign in with GitHub"
  globals.css             Tailwind layers and the CSS custom properties both themes use
  dashboard/
    page.tsx              the application (~900 lines): state, data loading, layout
    loading.tsx           route-level loading state

components/
  repository-card.tsx     one repository: metadata, tags, inline tag editing
  repository-details-modal.tsx   README + changelog tabs, notes editor
  tag-filter-panel.tsx    sidebar: tag/language/topic lists, boolean filter input
  version-tracker.tsx     release list, version selection, copyable changelog
  markdown.tsx            the single markdown renderer, shared by both consumers
  theme-provider.tsx      next-themes wrapper
  theme-toggle.tsx        light/dark switch
  ui/                     shadcn/ui primitives — generated, not hand-edited

lib/
  api.ts                  fetch wrapper, ApiError, error message extraction
  types.ts                shared interfaces + formatVersion / repositoryTagSet / compactNumber
  filter-expression.ts    tokenizer + recursive-descent parser for boolean filters
  filter-repositories.ts  matchesCriteria / compareRepositories / filterRepositories
  utils.ts                cn() class merger

hooks/                    use-toast, use-mobile
scripts/                  node --test suites for lib/
```

Only two routes exist: `/` and `/dashboard/`. Both are pre-rendered at build time, which
is why the backend's catch-all returns a real 404 instead of serving the landing page for
unknown paths.

## Data flow

State is local React state in `app/dashboard/page.tsx`, passed down as props. There is
no Redux/Zustand/context store, and for a single screen with one data source that is the
right amount of machinery.

```
DashboardPage
├── user, stats, syncStatus                  ← /auth/user, /api/stats, /api/sync/status
├── repositories: Repository[]               ← /api/repos?includeUnfollowed=true  (once)
├── filter state
│     searchQuery, selectedTags, advancedFilters, quickFilters, sortBy, sortOrder
├── visibleCount                             infinite scroll, 60 at a time
└── selectedRepo + readmeContent             ← /api/repos/:owner/:repo/readme
```

**The whole list is fetched once and filtered in the browser.** Tag filtering, boolean
expressions, search and sorting are all `useMemo` over the in-memory array, so they are
instant and offline-tolerant. Rendering is bounded by `visibleCount` (60 per page,
extended by an `IntersectionObserver` sentinel) so a 5000-star account does not mount
5000 cards.

**Writes are optimistic-free but immediate**: a tag change POSTs, and the response's
authoritative tag list replaces the local one. A rejected tag surfaces as an inline
error on that card rather than silently reverting.

**Sync is polled** every 5 seconds while one is in progress; the repository list and
stats reload when the status transitions to `completed`.

**A `401` from any call** routes back to `/` — the session expired or was destroyed.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` or `⌘`/`Ctrl` + `K` | Focus search |
| `Enter` in a tag box | Save the tag |
| `Esc` | Cancel tag editing |

`/` is ignored while you are typing in an input, so it does not hijack the search box
itself.

## The API client

`lib/api.ts` is a thin wrapper with one job: **never let a failure look like a success.**

```ts
const data = await apiGet<{ repos: Repository[] }>("/api/repos")   // throws ApiError
await apiSend("POST", `/api/repos/${id}/tags`, { tags })           // throws ApiError
const text = await apiGetText(`/api/repos/${owner}/${name}/readme`)
```

- Every call sends `credentials: 'include'`.
- A non-2xx response throws an `ApiError` carrying the status and the server's own error
  message (`error` or `message` from the JSON body, or the trimmed text body).
- `ApiError.isUnauthorized` distinguishes an expired session from a real failure.
- `errorMessage(error, fallback)` is what components display.

The dashboard used to swallow non-ok responses — a rejected tag looked like a success —
and fell back to hard-coded demo data when a request failed. Both are gone; there is no
mock data anywhere in the tree.

## Filtering

Two layers, both pure and both directly tested.

**`lib/filter-expression.ts`** parses boolean expressions like
`(react OR vue) AND NOT deprecated` into an AST, then evaluates it against a repository's
tag set.

```
expression := term (OR term)*
term       := factor (AND? factor)*      -- adjacent factors imply AND
factor     := NOT factor | '(' expression ')' | tag
```

- Word operators (`AND`, `OR`, `NOT`) and symbolic ones (`&`, `&&`, `|`, `||`, `!`).
- Quoted tags (`"my tag"`) match values containing spaces or parentheses.
- `-` is deliberately **not** negation: it is an ordinary character in tags like
  `web-tools`, and treating a leading hyphen as NOT would make them unmatchable.
- `validateFilterExpression` returns a human-readable reason so the input can show why
  an expression was rejected before it is applied.

> The previous implementation string-replaced tag names with `true`/`false` and handed
> the result to `Function()`. It executed arbitrary user text as JavaScript, could not
> match a tag containing a dot (`node.js`), and corrupted tags that were prefixes of
> other tags. This parser tokenizes first and never evaluates code.

**`lib/filter-repositories.ts`** combines everything else:

- Un-starred repositories are hidden unless the `unfollowed` quick filter is on — and
  when it is on, *only* they are shown.
- Quick filters: `updates`, `untagged`, `archived`, `forks`, `unfollowed`.
- Search matches `fullName`, `description` and `notes`.
- Selected sidebar tags are ANDed; each advanced expression must also pass.
- A repository's "tags" for filtering are its custom tags **plus** its GitHub topics
  **plus** its language, all lowercased (`repositoryTagSet`).
- Sorting ties break on `id`, so the order is stable across renders.

Both modules were extracted from the dashboard component specifically so they could be
tested — inside the component the logic was a closure over ten pieces of state and
unreachable from a test.

## Markdown rendering

`components/markdown.tsx` is the single renderer for READMEs and release notes. The
modal and the version tracker each used to carry their own ~150-line copy, which is how
they drifted apart — only one of them handled images.

**A starred repository's README is untrusted content**, so:

- `rehype-sanitize` runs with an extended schema that permits the tags READMEs actually
  use (`img`, `picture`, `details`, `summary`, `sup`, `center`, …) but **not** `style`.
  Arbitrary CSS can cover or fake parts of the app UI.
- Attributes are allow-listed per tag.
- Links open in a new tab with `rel="noopener noreferrer nofollow"`. Relative links used
  to render with `target="_self"`, which navigated the SPA away and discarded all
  dashboard state.

**Relative URLs are resolved against the repository's real default branch:**

```
./docs/logo.png  →  https://raw.githubusercontent.com/<owner>/<name>/<branch>/docs/logo.png
./CONTRIBUTING   →  https://github.com/<owner>/<name>/blob/<branch>/CONTRIBUTING
```

The branch was hard-coded to `main` at one point, which broke every repository whose
default branch is `master`. It now comes from `repo.defaultBranch`, falling back to
`HEAD`. Broken images hide themselves rather than showing a broken-image icon.

## Theming

`next-themes` sets `class="dark"` on `<html>`; Tailwind is configured with
`darkMode: 'class'`. Every colour in the app is a CSS custom property defined for both
themes in `globals.css` and referenced through Tailwind's semantic names
(`bg-background`, `text-muted-foreground`, `border-border`).

This means **no component should ever hard-code a colour**. A literal `text-gray-900`
looks correct in light mode and disappears in dark mode; that is exactly how the theme
pipeline broke before.

## Build configuration

`next.config.mjs` behaves differently by phase:

| Phase | Configuration |
| --- | --- |
| `next dev` | `rewrites()` proxies `/api/*` and `/auth/*` to `NEXT_PUBLIC_API_URL` |
| `next build` | `output: 'export'`, `distDir: 'out'` |

Also set in both: `images.unoptimized` (no Next image server exists in an export) and
`trailingSlash: true` (which is why `/dashboard/` resolves to `dashboard/index.html`).

### Why type checking is on

`eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` are both **false**, and
they should stay that way. When they were on, `page.tsx`, the details modal and the
version tracker each declared their own `Repository` interface and drifted apart — the
modal's copy was missing `defaultBranch`, which is how README images ended up resolved
against a hard-coded `main`. The shared types in `lib/types.ts` exist so there is one
definition, and the type checker is what keeps it that way.

## Testing

`node --test` over the pure modules in `lib/`, run from `.mjs` files in `scripts/`:

```bash
cd new_frontend && npm test    # 33 tests
```

There is no component test runner. The design compensates: everything with real logic
(filtering, parsing, version formatting, number compaction) lives in `lib/` as pure
functions, and the components are thin enough to review by reading. If you add logic to
a component that is worth testing, extract it to `lib/` first — that is what
`filter-repositories.ts` is.
