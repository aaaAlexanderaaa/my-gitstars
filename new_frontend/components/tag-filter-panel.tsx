"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  ChevronDown,
  ChevronUp,
  Code,
  Filter,
  Hash,
  Pencil,
  Play,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import type { Repository } from "@/lib/types"

type TagKind = "language" | "topic" | "custom"

interface TagCount {
  tag: string
  count: number
  kind: TagKind
}

interface AdvancedFilter {
  id: string
  expression: string
}

interface TagFilterPanelProps {
  repositories: Repository[]
  allRepositories: Repository[]
  selectedTags: string[]
  customTags: string[]
  onTagToggle: (tag: string) => void
  onClearFilters: () => void
  activeAdvancedFilters: AdvancedFilter[]
  onAddAdvancedFilter: (expression: string) => void
  onRemoveAdvancedFilter: (filterId: string) => void
  onRenameTag: (from: string, to: string) => Promise<void>
  onDeleteTag: (tag: string) => Promise<void>
}

const COLLAPSED_LIMIT = 10

/**
 * Counts are keyed by lowercased tag while the label keeps the first spelling seen.
 * Filtering is case-insensitive, so counting case-sensitively used to make the badge
 * numbers disagree with the number of results.
 */
function calculateTagCounts(repositories: Repository[]): TagCount[] {
  const entries = new Map<string, { label: string; kind: TagKind; count: number }>()

  const bump = (raw: string, kind: TagKind) => {
    const key = `${kind}:${raw.toLowerCase()}`
    const existing = entries.get(key)
    if (existing) {
      existing.count += 1
    } else {
      entries.set(key, { label: raw, kind, count: 1 })
    }
  }

  for (const repo of repositories) {
    if (repo.language) bump(repo.language, "language")
    for (const tag of repo.customTags || []) bump(tag, "custom")
    for (const topic of repo.topics || []) bump(topic, "topic")
  }

  return Array.from(entries.values())
    .map(({ label, kind, count }) => ({ tag: label, kind, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function TagFilterPanel({
  repositories,
  allRepositories,
  selectedTags,
  customTags,
  onTagToggle,
  onClearFilters,
  activeAdvancedFilters,
  onAddAdvancedFilter,
  onRemoveAdvancedFilter,
  onRenameTag,
  onDeleteTag,
}: TagFilterPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [advancedFilterInput, setAdvancedFilterInput] = useState("")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [managingTags, setManagingTags] = useState(false)
  const [busyTag, setBusyTag] = useState<string | null>(null)

  const tagCounts = useMemo(() => calculateTagCounts(repositories), [repositories])

  const categories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const matching = query ? tagCounts.filter((item) => item.tag.toLowerCase().includes(query)) : tagCounts

    const pick = (kind: TagKind) => {
      const all = matching.filter((item) => item.kind === kind)
      return { all, visible: expanded[kind] ? all : all.slice(0, COLLAPSED_LIMIT) }
    }

    return { custom: pick("custom"), language: pick("language"), topic: pick("topic") }
  }, [tagCounts, searchQuery, expanded])

  const selectedLower = useMemo(
    () => new Set(selectedTags.map((tag) => tag.toLowerCase())),
    [selectedTags],
  )

  const applyAdvancedFilter = () => {
    if (!advancedFilterInput.trim()) return
    onAddAdvancedFilter(advancedFilterInput)
    setAdvancedFilterInput("")
  }

  const handleRename = async (tag: string) => {
    const next = window.prompt(`Rename "${tag}" across all repositories to:`, tag)
    if (!next || next.trim() === tag) return
    setBusyTag(tag)
    try {
      await onRenameTag(tag, next.trim())
    } finally {
      setBusyTag(null)
    }
  }

  const handleDelete = async (tag: string) => {
    const affected = allRepositories.filter((repo) => repo.customTags.includes(tag)).length
    if (!window.confirm(`Remove "${tag}" from ${affected} repositories?`)) return
    setBusyTag(tag)
    try {
      await onDeleteTag(tag)
    } finally {
      setBusyTag(null)
    }
  }

  const renderCategory = (
    title: string,
    kind: TagKind,
    icon: React.ReactNode,
    group: { all: TagCount[]; visible: TagCount[] },
  ) => {
    if (group.all.length === 0) return null
    const isExpanded = !!expanded[kind]

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{title}</span>
          <Badge variant="outline" className="text-xs">
            {group.all.length}
          </Badge>
        </div>

        <div>
          {group.visible.map(({ tag, count }) => {
            const isSelected = selectedLower.has(tag.toLowerCase())
            return (
              <div
                key={`${kind}-${tag}`}
                className={`group flex items-center gap-1 rounded-md px-1 transition-colors ${
                  isSelected ? "bg-primary/10" : "hover:bg-accent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onTagToggle(tag)}
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1 text-left text-sm"
                >
                  <span className={`truncate ${isSelected ? "font-medium text-primary" : "text-foreground"}`}>
                    {tag}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    {count}
                  </Badge>
                </button>

                {managingTags && kind === "custom" && (
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => handleRename(tag)}
                      disabled={busyTag === tag}
                      title={`Rename "${tag}" everywhere`}
                      aria-label={`Rename tag ${tag}`}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tag)}
                      disabled={busyTag === tag}
                      title={`Remove "${tag}" everywhere`}
                      aria-label={`Delete tag ${tag}`}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )
          })}

          {group.all.length > COLLAPSED_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((prev) => ({ ...prev, [kind]: !prev[kind] }))}
              className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="mr-1 h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3 w-3" />
                  Show all {group.all.length}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    )
  }

  const hasActiveFilters = selectedTags.length > 0 || activeAdvancedFilters.length > 0

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden border-b border-border bg-card md:w-64 md:border-b-0 md:border-r">
      <div className="border-b border-border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Filter className="h-4 w-4" />
            Filters
          </h2>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-7 px-2 text-xs">
              Clear all
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex gap-1">
            <Input
              placeholder='(react OR vue) AND NOT deprecated'
              value={advancedFilterInput}
              onChange={(event) => setAdvancedFilterInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyAdvancedFilter()
              }}
              className="h-8 flex-1 text-xs"
              aria-label="Advanced filter expression"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={applyAdvancedFilter}
              disabled={!advancedFilterInput.trim()}
              className="h-8 px-2"
              aria-label="Apply advanced filter"
            >
              <Play className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            AND, OR, NOT and parentheses. Quote tags containing spaces.
          </p>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="border-b border-border bg-muted/40 p-4">
          <div className="mb-2 text-xs text-muted-foreground">Active filters</div>
          <div className="flex flex-wrap gap-1">
            {selectedTags.map((tag) => (
              <button key={tag} type="button" onClick={() => onTagToggle(tag)}>
                <Badge className="cursor-pointer bg-primary/10 text-xs text-primary hover:bg-accent hover:text-accent-foreground">
                  {tag}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              </button>
            ))}
            {activeAdvancedFilters.map((filter) => (
              <button key={filter.id} type="button" onClick={() => onRemoveAdvancedFilter(filter.id)}>
                <Badge className="cursor-pointer bg-accent text-xs text-accent-foreground hover:bg-accent/80">
                  <Code className="mr-1 h-3 w-3" />
                  {filter.expression}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 pl-8 text-xs"
            aria-label="Search tags"
          />
        </div>
        {customTags.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setManagingTags((prev) => !prev)}
            className="mt-2 h-7 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
            aria-pressed={managingTags}
          >
            <Pencil className="mr-1 h-3 w-3" />
            {managingTags ? "Done managing tags" : "Manage custom tags"}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 p-4">
          {renderCategory("Custom tags", "custom", <Tag className="h-4 w-4 text-primary" />, categories.custom)}
          {categories.custom.all.length > 0 && categories.language.all.length > 0 && <Separator />}
          {renderCategory("Languages", "language", <Code className="h-4 w-4 text-primary" />, categories.language)}
          {(categories.custom.all.length > 0 || categories.language.all.length > 0) &&
            categories.topic.all.length > 0 && <Separator />}
          {renderCategory("Topics", "topic", <Hash className="h-4 w-4 text-primary" />, categories.topic)}
          {tagCounts.length === 0 && (
            <p className="text-xs text-muted-foreground">No tags to show for the current results.</p>
          )}
        </div>
      </div>
    </aside>
  )
}
