"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Filter, Search, X, Tag, Code, Hash, ChevronDown, ChevronUp, Play } from "lucide-react"

interface TagCount {
  tag: string
  count: number
  type: "language" | "topic" | "custom"
}

interface AdvancedFilter {
  id: string
  expression: string
}

interface TagFilterPanelProps {
  repositories: any[]
  allRepositories: any[]
  selectedTags: string[]
  onTagToggle: (tag: string) => void
  onClearFilters: () => void
  activeAdvancedFilters: AdvancedFilter[]
  onAddAdvancedFilter: (expression: string) => void
  onRemoveAdvancedFilter: (filterId: string) => void
}

class TagCalculator {
  static calculateFromRepositories(repositories: any[]): TagCount[] {
    const tagCountMap = new Map<string, { count: number; type: "language" | "topic" | "custom" }>()

    repositories.forEach((repo) => {
      // Language tags
      if (repo.language) {
        const existing = tagCountMap.get(repo.language) || { count: 0, type: "language" as const }
        tagCountMap.set(repo.language, { ...existing, count: existing.count + 1 })
      }

      // Topic tags
      repo.topics?.forEach((topic: string) => {
        const existing = tagCountMap.get(topic) || { count: 0, type: "topic" as const }
        tagCountMap.set(topic, { ...existing, count: existing.count + 1 })
      })

      // Custom tags
      repo.customTags?.forEach((tag: string) => {
        const existing = tagCountMap.get(tag) || { count: 0, type: "custom" as const }
        tagCountMap.set(tag, { ...existing, count: existing.count + 1 })
      })
    })

    return Array.from(tagCountMap.entries())
      .map(([tag, { count, type }]) => ({ tag, count, type }))
      .sort((a, b) => b.count - a.count) // Sort by count descending
  }

  static categorizeAndLimit(tagCounts: TagCount[], searchQuery: string, limits: { [key: string]: number }) {
    const filtered = tagCounts.filter((item) => item.tag.toLowerCase().includes(searchQuery.toLowerCase()))

    const languages = filtered.filter((item) => item.type === "language").slice(0, limits.languages || 10)
    const topics = filtered.filter((item) => item.type === "topic").slice(0, limits.topics || 10)
    const custom = filtered.filter((item) => item.type === "custom").slice(0, limits.custom || 10)

    const totalLanguages = Array.from(
      new Set(filtered.filter((item) => item.type === "language").map((item) => item.tag)),
    ).length
    const totalTopics = Array.from(
      new Set(filtered.filter((item) => item.type === "topic").map((item) => item.tag)),
    ).length
    const totalCustom = Array.from(
      new Set(filtered.filter((item) => item.type === "custom").map((item) => item.tag)),
    ).length

    return {
      languages,
      topics,
      custom,
      totals: {
        languages: totalLanguages,
        topics: totalTopics,
        custom: totalCustom,
      },
    }
  }
}

export function TagFilterPanel({
  repositories,
  allRepositories,
  selectedTags,
  onTagToggle,
  onClearFilters,
  activeAdvancedFilters,
  onAddAdvancedFilter,
  onRemoveAdvancedFilter,
}: TagFilterPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [advancedFilterInput, setAdvancedFilterInput] = useState("")
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    languages: false,
    topics: false,
    custom: false,
  })

  const handleApplyAdvancedFilter = () => {
    if (advancedFilterInput.trim()) {
      onAddAdvancedFilter(advancedFilterInput.trim())
      setAdvancedFilterInput("")
    }
  }

  const handleAdvancedFilterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleApplyAdvancedFilter()
    }
  }

  const { languages, topics, custom, totals } = useMemo(() => {
    console.log("[TagFilterPanel] Recalculating tags for", repositories.length, "repositories (filtered)")
    // Use filtered repositories for tag counts to show dynamic counts based on current filters
    const tagCounts = repositories.length > 0 ? TagCalculator.calculateFromRepositories(repositories) : []
    console.log("[TagFilterPanel] Calculated", tagCounts.length, "tag counts")

    const limits = {
      languages: expandedSections.languages ? 1000 : 10,
      topics: expandedSections.topics ? 1000 : 10,
      custom: expandedSections.custom ? 1000 : 10,
    }

    const result = TagCalculator.categorizeAndLimit(tagCounts, searchQuery, limits)

    return {
      languages: result.languages,
      topics: result.topics,
      custom: result.custom,
      totals: result.totals,
    }
  }, [repositories, searchQuery, expandedSections, repositories.map(r => r.customTags).flat().join(',')])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const renderTagCategory = (
    title: string,
    tags: TagCount[],
    icon: React.ReactNode,
    sectionKey: string,
    totalCount: number,
  ) => {
    if (totalCount === 0) return null

    const isExpanded = expandedSections[sectionKey]
    const hasMore = totalCount > 10 // Always check if there are more than 10 items total

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {icon}
            <span>{title}</span>
            <Badge variant="outline" className="text-xs bg-muted border-gray-200 text-gray-600">
              {totalCount}
            </Badge>
          </div>
        </div>

        <div className="space-y-0">
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`w-full text-left px-3 py-1 rounded-md text-sm transition-all hover:bg-accent border border-gray-100 ${
                selectedTags.includes(tag) ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-accent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-normal text-gray-700">{tag}</span>
                <Badge variant="outline" className="text-xs bg-muted/50 border-gray-200 text-gray-500">
                  {count}
                </Badge>
              </div>
            </button>
          ))}

          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSection(sectionKey)}
              className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show more
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-64 shrink-0 border-r border-gray-200 bg-card overflow-hidden flex flex-col">

      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </h3>
          {(selectedTags.length > 0 || activeAdvancedFilters.length > 0) && (
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-7 px-2 text-xs">
              Clear All
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex gap-1">
            <Input
              placeholder="Advanced: (react OR vue) AND typescript"
              value={advancedFilterInput}
              onChange={(e) => setAdvancedFilterInput(e.target.value)}
              onKeyDown={handleAdvancedFilterKeyDown}
              className="text-xs h-8 flex-1 border-gray-200"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyAdvancedFilter}
              disabled={!advancedFilterInput.trim()}
              className="h-8 px-2 bg-transparent border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Play className="h-3 w-3" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Use: AND, OR, NOT, parentheses. Press Enter or click apply.
          </div>
        </div>
      </div>

      {(selectedTags.length > 0 || activeAdvancedFilters.length > 0) && (
        <div className="p-4 border-b border-gray-200 bg-muted/20">
          <div className="text-xs text-muted-foreground mb-2">Active filters:</div>
          <div className="space-y-2">
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <Badge
                    key={tag}
                    className="text-xs cursor-pointer bg-primary/10 text-primary hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => onTagToggle(tag)}
                  >
                    {tag}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
            {activeAdvancedFilters.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {activeAdvancedFilters.map((filter) => (
                  <Badge
                    key={filter.id}
                    className="text-xs cursor-pointer bg-accent/80 text-accent-foreground hover:bg-accent hover:text-accent-foreground/80 transition-colors"
                    onClick={() => onRemoveAdvancedFilter(filter.id)}
                  >
                    <Code className="h-3 w-3 mr-1" />
                    {filter.expression}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs border-gray-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {renderTagCategory("Custom Tags", custom, <Tag className="h-4 w-4 text-blue-600" />, "custom", totals.custom)}

          {custom.length > 0 && languages.length > 0 && <Separator />}

          {renderTagCategory(
            "Languages",
            languages,
            <Code className="h-4 w-4 text-green-600" />,
            "languages",
            totals.languages,
          )}

          {(custom.length > 0 || languages.length > 0) && topics.length > 0 && <Separator />}

          {renderTagCategory("Topics", topics, <Hash className="h-4 w-4 text-purple-600" />, "topics", totals.topics)}
        </div>
      </div>
    </div>
  )
}
