/**
 * Tests for repository filtering, sorting and the version-label helper.
 *
 * TypeScript is transpiled on the fly with the installed compiler and imported as a
 * data URL, so no extra tooling and no writable temp directory are needed.
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'

function transpile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  // The three modules are concatenated into one, so their `@/lib/...` imports of each
  // other become plain in-scope references. Nothing else is imported.
  return outputText.replace(/^\s*import[^;]*from\s*["']@\/lib\/[^"']+["'];?\s*$/gm, '')
}

// Order matters: each file may reference the ones above it.
const bundle = [
  transpile('../lib/types.ts'),
  transpile('../lib/filter-expression.ts'),
  transpile('../lib/filter-repositories.ts'),
].join('\n')

const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`)

const {
  filterRepositories,
  matchesCriteria,
  compareRepositories,
  parseFilterExpression,
  formatVersion,
  compactNumber,
  repositoryTagSet,
} = lib

// Sanity check the loader itself: a silently-undefined import would make the tag tests
// pass for the wrong reason.
for (const [name, value] of Object.entries({
  filterRepositories, matchesCriteria, compareRepositories, parseFilterExpression,
  formatVersion, compactNumber, repositoryTagSet,
})) {
  if (typeof value !== 'function') throw new Error(`test loader failed to export ${name}`)
}

let nextId = 1
function repo(overrides = {}) {
  const id = overrides.id ?? nextId++
  return {
    id,
    githubId: String(1000 + id),
    name: `repo${id}`,
    fullName: `owner/repo${id}`,
    description: null,
    url: `https://github.com/owner/repo${id}`,
    customTags: [],
    notes: null,
    starredAt: '2024-01-01T00:00:00Z',
    language: null,
    owner: 'owner',
    topics: [],
    fork: false,
    forksCount: 0,
    stargazersCount: 0,
    watchersCount: 0,
    defaultBranch: 'main',
    isTemplate: false,
    archived: false,
    visibility: 'public',
    pushedAt: null,
    githubCreatedAt: null,
    githubUpdatedAt: null,
    isFollowed: true,
    latestVersion: null,
    currentlyUsedVersion: null,
    updateAvailable: false,
    hasReleases: false,
    releasesLastFetched: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    UserId: 1,
    effectiveVersion: null,
    ...overrides,
  }
}

const names = (list) => list.map((r) => r.fullName)

// ---------------------------------------------------------------------------
// visibility of un-starred repositories
// ---------------------------------------------------------------------------

test('un-starred repos are hidden by default', () => {
  const list = [repo({ fullName: 'a/kept' }), repo({ fullName: 'a/gone', isFollowed: false })]
  assert.deepEqual(names(filterRepositories(list, {})), ['a/kept'])
})

test('the unfollowed quick filter shows ONLY un-starred repos', () => {
  const list = [repo({ fullName: 'a/kept' }), repo({ fullName: 'a/gone', isFollowed: false })]
  assert.deepEqual(names(filterRepositories(list, { quickFilters: ['unfollowed'] })), ['a/gone'])
})

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

test('search matches the full name, description and notes', () => {
  const list = [
    repo({ fullName: 'facebook/react' }),
    repo({ fullName: 'a/b', description: 'A React renderer' }),
    repo({ fullName: 'c/d', notes: 'reminder: react migration' }),
    repo({ fullName: 'e/f' }),
  ]
  assert.equal(filterRepositories(list, { searchQuery: 'react' }).length, 3)
  assert.equal(filterRepositories(list, { searchQuery: 'REACT' }).length, 3, 'search must be case-insensitive')
  assert.equal(filterRepositories(list, { searchQuery: '  react  ' }).length, 3, 'query should be trimmed')
})

test('an empty search matches everything', () => {
  const list = [repo(), repo()]
  assert.equal(filterRepositories(list, { searchQuery: '   ' }).length, 2)
})

test('a null description or note never throws', () => {
  const list = [repo({ description: null, notes: null })]
  assert.equal(filterRepositories(list, { searchQuery: 'anything' }).length, 0)
})

// ---------------------------------------------------------------------------
// tag filters
// ---------------------------------------------------------------------------

test('selected tags are ANDed, not ORed', () => {
  const list = [
    repo({ fullName: 'a/both', customTags: ['cli', 'rust'] }),
    repo({ fullName: 'a/one', customTags: ['cli'] }),
  ]
  assert.deepEqual(names(filterRepositories(list, { selectedTags: ['cli', 'rust'] })), ['a/both'])
})

test('tag matching spans custom tags, topics and language, case-insensitively', () => {
  const list = [
    repo({ fullName: 'a/custom', customTags: ['Tools'] }),
    repo({ fullName: 'a/topic', topics: ['tools'] }),
    repo({ fullName: 'a/lang', language: 'TOOLS' }),
    repo({ fullName: 'a/none' }),
  ]
  assert.equal(filterRepositories(list, { selectedTags: ['tools'] }).length, 3)
})

test('advanced filters are applied on top of selected tags', () => {
  const list = [
    repo({ fullName: 'a/keep', customTags: ['cli'], topics: ['rust'] }),
    repo({ fullName: 'a/drop', customTags: ['cli'], topics: ['deprecated'] }),
  ]
  const node = parseFilterExpression('NOT deprecated')
  assert.deepEqual(
    names(filterRepositories(list, { selectedTags: ['cli'], advancedFilters: [{ node }] })),
    ['a/keep'],
  )
})

test('multiple advanced filters are ANDed', () => {
  const list = [
    repo({ fullName: 'a/both', topics: ['rust', 'cli'] }),
    repo({ fullName: 'a/one', topics: ['rust'] }),
  ]
  const filters = [
    { node: parseFilterExpression('rust') },
    { node: parseFilterExpression('cli') },
  ]
  assert.deepEqual(names(filterRepositories(list, { advancedFilters: filters })), ['a/both'])
})

// ---------------------------------------------------------------------------
// quick filters
// ---------------------------------------------------------------------------

test('quick filters select the right rows', () => {
  const list = [
    repo({ fullName: 'a/update', updateAvailable: true }),
    repo({ fullName: 'a/untagged' }),
    repo({ fullName: 'a/tagged', customTags: ['x'] }),
    repo({ fullName: 'a/archived', archived: true, customTags: ['x'] }),
    repo({ fullName: 'a/fork', fork: true, customTags: ['x'] }),
  ]
  assert.deepEqual(names(filterRepositories(list, { quickFilters: ['updates'] })), ['a/update'])
  assert.deepEqual(
    names(filterRepositories(list, { quickFilters: ['untagged'] })).sort(),
    ['a/untagged', 'a/update'],
  )
  assert.deepEqual(names(filterRepositories(list, { quickFilters: ['archived'] })), ['a/archived'])
  assert.deepEqual(names(filterRepositories(list, { quickFilters: ['forks'] })), ['a/fork'])
})

test('quick filters combine as AND', () => {
  const list = [
    repo({ fullName: 'a/both', updateAvailable: true, archived: true }),
    repo({ fullName: 'a/update', updateAvailable: true }),
  ]
  assert.deepEqual(
    names(filterRepositories(list, { quickFilters: ['updates', 'archived'] })),
    ['a/both'],
  )
})

// ---------------------------------------------------------------------------
// sorting
// ---------------------------------------------------------------------------

test('sorts by stars in both directions', () => {
  const list = [
    repo({ fullName: 'a/low', stargazersCount: 1 }),
    repo({ fullName: 'a/high', stargazersCount: 100 }),
  ]
  assert.deepEqual(names(filterRepositories(list, { sortBy: 'stargazersCount', sortOrder: 'desc' })), ['a/high', 'a/low'])
  assert.deepEqual(names(filterRepositories(list, { sortBy: 'stargazersCount', sortOrder: 'asc' })), ['a/low', 'a/high'])
})

test('sorts by name using locale comparison', () => {
  const list = [repo({ fullName: 'b/z' }), repo({ fullName: 'a/a' })]
  assert.deepEqual(names(filterRepositories(list, { sortBy: 'name', sortOrder: 'asc' })), ['a/a', 'b/z'])
})

test('a null pushedAt sorts last, not first, when descending', () => {
  const list = [
    repo({ fullName: 'a/never', pushedAt: null }),
    repo({ fullName: 'a/recent', pushedAt: '2025-01-01T00:00:00Z' }),
  ]
  assert.deepEqual(
    names(filterRepositories(list, { sortBy: 'pushedAt', sortOrder: 'desc' })),
    ['a/recent', 'a/never'],
  )
})

test('an unparseable date does not corrupt the ordering', () => {
  const list = [
    repo({ fullName: 'a/bad', starredAt: 'not-a-date' }),
    repo({ fullName: 'a/good', starredAt: '2025-01-01T00:00:00Z' }),
  ]
  assert.deepEqual(names(filterRepositories(list, { sortBy: 'starredAt', sortOrder: 'desc' })), ['a/good', 'a/bad'])
})

test('ties break on id so the order is stable across renders', () => {
  const list = [
    repo({ id: 3, fullName: 'a/three', stargazersCount: 5 }),
    repo({ id: 1, fullName: 'a/one', stargazersCount: 5 }),
    repo({ id: 2, fullName: 'a/two', stargazersCount: 5 }),
  ]
  const once = names(filterRepositories(list, { sortBy: 'stargazersCount', sortOrder: 'desc' }))
  const twice = names(filterRepositories([...list].reverse(), { sortBy: 'stargazersCount', sortOrder: 'desc' }))
  assert.deepEqual(once, twice, 'equal values must produce a deterministic order')
})

test('filtering does not mutate the input array', () => {
  const list = [repo({ fullName: 'a/b', stargazersCount: 1 }), repo({ fullName: 'a/a', stargazersCount: 9 })]
  const before = names(list)
  filterRepositories(list, { sortBy: 'stargazersCount' })
  assert.deepEqual(names(list), before, 'the caller\'s array must be left alone')
})

test('matchesCriteria and compareRepositories are usable on their own', () => {
  assert.equal(matchesCriteria(repo({ archived: true }), { quickFilters: ['archived'] }), true)
  assert.ok(compareRepositories(repo({ id: 1 }), repo({ id: 2 }), 'starredAt', 'asc') < 0)
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

test('formatVersion never produces a double v', () => {
  assert.equal(formatVersion('v0.189.5'), 'v0.189.5', 'this rendered as "vv0.189.5"')
  assert.equal(formatVersion('V1.2.3'), 'V1.2.3')
  assert.equal(formatVersion('1.34.1'), 'v1.34.1')
  assert.equal(formatVersion('2025.08.11'), 'v2025.08.11')
  assert.equal(formatVersion('release-9'), 'vrelease-9', 'non-numeric tags still get a prefix')
  assert.equal(formatVersion(null), '')
  assert.equal(formatVersion(undefined), '')
  assert.equal(formatVersion(''), '')
})

test('repositoryTagSet lowercases and merges every filterable value', () => {
  const tags = repositoryTagSet(repo({ customTags: ['Tools'], topics: ['CLI'], language: 'Rust' }))
  assert.deepEqual([...tags].sort(), ['cli', 'rust', 'tools'])
})

test('compactNumber abbreviates without lying', () => {
  assert.equal(compactNumber(0), '0')
  assert.equal(compactNumber(999), '999')
  assert.equal(compactNumber(1000), '1.0k')
  assert.equal(compactNumber(47783), '47.8k')
  assert.equal(compactNumber(1_500_000), '1.5M')
  assert.equal(compactNumber(Number.NaN), '0')
})
