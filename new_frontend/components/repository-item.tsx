"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Star, Calendar, Tag, Plus, X } from "lucide-react"

interface Repository {
  id: number
  githubId: number
  name: string
  owner: string
  description: string
  language: string
  stargazersCount: number
  topics: string[]
  customTags: string[]
  starredAt: string
  isFollowed: boolean
  latestVersion?: string
  currentlyUsedVersion?: string
  updateAvailable?: boolean
}

interface RepositoryItemProps {
  repository: Repository
  isSelected: boolean
  onSelect: (repo: Repository) => void
  onTagAdd: (repoId: number, tag: string) => Promise<void>
  onTagRemove: (repoId: number, tag: string) => Promise<void>
  onTagClick?: (tag: string) => void
  isUpdatingTags?: boolean
}

export function RepositoryItem({
  repository,
  isSelected,
  onSelect,
  onTagAdd,
  onTagRemove,
  onTagClick,
  isUpdatingTags = false,
}: RepositoryItemProps) {
  const [isEditingTags, setIsEditingTags] = useState(false)
  const [newTag, setNewTag] = useState("")

  const handleAddTag = async () => {
    if (!newTag.trim()) return

    await onTagAdd(repository.id, newTag.trim())
    setNewTag("")
    setIsEditingTags(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddTag()
    } else if (e.key === "Escape") {
      setNewTag("")
      setIsEditingTags(false)
    }
  }

  const handleTagRemoveClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation()
    onTagRemove(repository.id, tag)
  }

  const handleAddTagClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleAddTag()
  }

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNewTag("")
    setIsEditingTags(false)
  }

  const handleEditTagsClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingTags(true)
  }

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation()
    onTagClick?.(tag)
  }

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <Card className={`transition-colors hover:bg-accent/50 ${isSelected ? "ring-2 ring-primary" : ""}`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div
              className="space-y-1 cursor-pointer flex-1"
              onClick={() => {
                console.log("[v0] Repository card clicked:", repository.name)
                onSelect(repository)
              }}
            >
              <h3 className="font-semibold text-lg hover:text-primary transition-colors">
                {repository.owner}/{repository.name}
              </h3>
              {repository.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{repository.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-4 w-4" />
              {repository.stargazersCount.toLocaleString()}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {repository.language && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-primary"></div>
                {repository.language}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(repository.starredAt).toLocaleDateString()}
            </div>
            {repository.updateAvailable && (
              <Badge variant="destructive" className="text-xs">
                Update Available
              </Badge>
            )}
          </div>

          {/* Tags Section */}
          <div className="space-y-2">
            {/* Existing Tags */}
            {(repository.topics.length > 0 || repository.customTags.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {repository.customTags.map((tag) => (
                  <Badge
                    key={`custom-${tag}`}
                    variant="default"
                    className="text-xs group cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={(e) => {
                      // Don't apply filter when clicking the X button area
                      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).tagName === 'svg') {
                        return
                      }
                      handleTagClick(e, tag)
                    }}
                    title="Click to filter by tag, or click X to remove"
                  >
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                    <button
                      onClick={(e) => handleTagRemoveClick(e, tag)}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive rounded p-0.5"
                      title="Remove custom tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {repository.topics.map((topic) => (
                  <Badge 
                    key={`topic-${topic}`} 
                    variant="secondary" 
                    className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={(e) => handleTagClick(e, topic)}
                    title="Click to filter by this topic"
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
            )}

            {/* Tag Management Controls */}
            <div className="flex items-center gap-2">
              {isEditingTags ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    placeholder="Enter custom tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onClick={handleInputClick}
                    className="text-xs h-7"
                    disabled={isUpdatingTags}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleAddTagClick}
                    disabled={isUpdatingTags || !newTag.trim()}
                    className="h-7 px-2 text-xs"
                  >
                    {isUpdatingTags ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-primary-foreground"></div>
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelClick}
                    className="h-7 px-2 text-xs bg-transparent"
                    disabled={isUpdatingTags}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEditTagsClick}
                  className="h-7 px-2 text-xs bg-transparent"
                  disabled={isUpdatingTags}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Tag
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
