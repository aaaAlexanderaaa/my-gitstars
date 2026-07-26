"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"

/**
 * One markdown renderer for READMEs and release notes.
 *
 * The modal and the version tracker each carried their own ~150-line copy of this
 * component map, which is how they drifted apart (only one of them handled images).
 */

interface MarkdownProps {
  children: string
  /** Owner/name/branch used to resolve relative image and link targets. */
  repo?: { owner: string; name: string; branch?: string | null }
  className?: string
  compact?: boolean
}

// `style` is deliberately NOT allowed: a starred repository's README is untrusted
// content, and arbitrary CSS can be used to cover or fake parts of the app UI.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "img",
    "a",
    "hr",
    "div",
    "span",
    "center",
    "br",
    "sup",
    "sub",
    "details",
    "summary",
    "picture",
    "source",
  ],
  attributes: {
    ...defaultSchema.attributes,
    img: ["src", "srcSet", "alt", "title", "width", "height", "align", "loading"],
    source: ["srcSet", "media", "type"],
    a: ["href", "title"],
    div: ["align"],
    span: [],
    details: ["open"],
    "*": ["className"],
  },
}

function absoluteAssetUrl(src: string, repo: MarkdownProps["repo"]): string {
  if (!repo) return src
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("#")) return src

  // The branch used to be hard-coded to "main", which broke every repository whose
  // default branch is "master" (or anything else).
  const branch = repo.branch || "HEAD"
  const path = src.replace(/^\.\//, "").replace(/^\//, "")
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${branch}/${path}`
}

function absoluteLinkUrl(href: string, repo: MarkdownProps["repo"]): string {
  if (!repo) return href
  if (/^(https?:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("#")) return href
  const branch = repo.branch || "HEAD"
  const path = href.replace(/^\.\//, "").replace(/^\//, "")
  return `https://github.com/${repo.owner}/${repo.name}/blob/${branch}/${path}`
}

export function Markdown({ children, repo, className, compact }: MarkdownProps) {
  const components = useMemo(
    () => ({
      // `node` is react-markdown's AST entry and must not reach the DOM.
      a({ node, href, children: linkChildren, ...props }: any) {
        const target = absoluteLinkUrl(String(href ?? ""), repo)
        return (
          // Relative links used to render with target="_self", which navigated the
          // whole SPA away and threw away all dashboard state.
          <a
            {...props}
            href={target}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
          >
            {linkChildren}
          </a>
        )
      },
      img({ node, src, alt, ...props }: any) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...props}
            src={absoluteAssetUrl(String(src ?? ""), repo)}
            alt={alt || ""}
            loading="lazy"
            className="my-3 h-auto max-w-full rounded border border-border"
            onError={(event) => {
              ;(event.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        )
      },
      table({ node, children: tableChildren, ...props }: any) {
        return (
          <div className="my-4 overflow-x-auto">
            <table {...props}>{tableChildren}</table>
          </div>
        )
      },
      pre({ node, children: preChildren, ...props }: any) {
        return (
          <pre {...props} className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-sm">
            {preChildren}
          </pre>
        )
      },
      code({ node, inline, className: codeClassName, children: codeChildren, ...props }: any) {
        // `inline` is what react-markdown actually reports; the previous check
        // (`!className`) styled unlabelled fenced blocks as inline chips.
        if (inline) {
          return (
            <code
              {...props}
              className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
            >
              {codeChildren}
            </code>
          )
        }
        return (
          <code {...props} className={`font-mono ${codeClassName ?? ""}`}>
            {codeChildren}
          </code>
        )
      },
    }),
    [repo],
  )

  return (
    <div
      className={`prose max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-a:text-primary prose-img:my-3 ${
        compact ? "prose-sm" : ""
      } ${className ?? ""}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
