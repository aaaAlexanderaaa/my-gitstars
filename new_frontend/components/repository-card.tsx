"use client"

import type React from "react"
import { memo, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Star, Plus, X, GitFork, Archive, StickyNote } from "lucide-react"
import { compactNumber, formatVersion, type Repository } from "@/lib/types"

interface RepositoryCardProps {
  repo: Repository
  suggestions: string[]
  tagError?: string
  isUpdating: boolean
  onOpen: (repo: Repository) => void
  onTagToggle: (tag: string) => void
  onAddTag: (repoId: number, tag: string) => void
  onRemoveTag: (repoId: number, tag: string) => void
  onClearTagError: (repoId: number) => void
}

function RepositoryCardImpl({
  repo,
  suggestions,
  tagError,
  isUpdating,
  onOpen,
  onTagToggle,
  onAddTag,
  onRemoveTag,
  onClearTagError,
}: RepositoryCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTag, setDraftTag] = useState("")

  const matchingSuggestions = useMemo(() => {
    const query = draftTag.trim().toLowerCase()
    if (!query) return []
    const owned = new Set(repo.customTags.map((tag) => tag.toLowerCase()))
    return suggestions
      .filter((tag) => {
        const lower = tag.toLowerCase()
        return lower.includes(query) && !owned.has(lower) && lower !== query
      })
      .slice(0, 8)
  }, [draftTag, suggestions, repo.customTags])

  const submit = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed) return
    onAddTag(repo.id, trimmed)
    setDraftTag("")
    setIsEditing(false)
  }

  const open = () => onOpen(repo)

  return (
    <Card className="border-border shadow-sm transition-shadow hover:shadow-lg">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-base font-semibold text-primary transition-colors hover:underline"
              >
                {repo.fullName}
              </a>
              {repo.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{repo.description}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="text-xs text-muted-foreground">
                {repo.starredAt
                  ? new Date(repo.starredAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </span>
              {repo.updateAvailable && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                  Update
                </span>
              )}
              {!repo.isFollowed && (
                <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                  Unstarred
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {repo.customTags.map((tag) => (
                <span
                  key={`custom-${tag}`}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary"
                >
                  <button
                    type="button"
                    onClick={() => onTagToggle(tag)}
                    title={`Filter by ${tag}`}
                    className="hover:underline"
                  >
                    {tag}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveTag(repo.id, tag)}
                    disabled={isUpdating}
                    title={`Remove tag ${tag}`}
                    aria-label={`Remove tag ${tag}`}
                    className="rounded-full p-0.5 transition-colors hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}

              {repo.topics
                .filter((topic) => !repo.customTags.includes(topic))
                .map((topic) => (
                  <button
                    key={`topic-${topic}`}
                    type="button"
                    onClick={() => onTagToggle(topic)}
                    title={`Filter by ${topic}`}
                    className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground transition-colors hover:bg-accent"
                  >
                    {topic}
                  </button>
                ))}
            </div>

            <div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={draftTag}
                      onChange={(event) => {
                        setDraftTag(event.target.value)
                        if (tagError) onClearTagError(repo.id)
                      }}
                      placeholder="Add custom tag..."
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          submit(draftTag)
                        } else if (event.key === "Escape") {
                          setDraftTag("")
                          setIsEditing(false)
                        }
                      }}
                    />
                    {matchingSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
                        {matchingSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="w-full px-2 py-1 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                            onClick={() => submit(suggestion)}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                    {tagError && (
                      <div
                        role="alert"
                        className="absolute left-0 right-0 top-full z-30 mt-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                      >
                        {tagError}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    onClick={() => submit(draftTag)}
                    disabled={isUpdating || !draftTag.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    aria-label="Cancel adding tag"
                    onClick={() => {
                      setDraftTag("")
                      setIsEditing(false)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 rounded-full p-0"
                  onClick={() => setIsEditing(true)}
                  title="Add custom tag"
                  aria-label={`Add custom tag to ${repo.fullName}`}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1" title={`${repo.stargazersCount} stars`}>
                <Star className="h-3 w-3" />
                {compactNumber(repo.stargazersCount)}
              </span>
              <span className="flex items-center gap-1" title={`${repo.forksCount} forks`}>
                <GitFork className="h-3 w-3" />
                {compactNumber(repo.forksCount)}
              </span>
              {repo.hasReleases && repo.currentlyUsedVersion && (
                <Badge variant="outline" className="border-border text-xs">
                  {formatVersion(repo.currentlyUsedVersion)}
                </Badge>
              )}
              {repo.notes && (
                <span title="Has a note" aria-label="Has a note">
                  <StickyNote className="h-3 w-3" />
                </span>
              )}
              {repo.archived && (
                <span title="Archived on GitHub" aria-label="Archived on GitHub">
                  <Archive className="h-3 w-3" />
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {repo.language && (
                <Badge variant="secondary" className="text-xs">
                  {repo.language}
                </Badge>
              )}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={open}>
                Details
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const RepositoryCard = memo(RepositoryCardImpl)
