"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VersionTracker } from "@/components/version-tracker"
import { BookOpen, ExternalLink, Star, AlertCircle, RefreshCw } from "lucide-react"

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

interface ReadmePreviewProps {
  repository: Repository | null
  isLoading: boolean
  content: string
  onRefresh?: () => void
  onVersionUpdate?: (repoId: number, version: string | null) => void
}

export function ReadmePreview({ repository, isLoading, content, onRefresh, onVersionUpdate }: ReadmePreviewProps) {
  const [processedContent, setProcessedContent] = useState<string>("")

  // Process markdown content to handle relative URLs
  useEffect(() => {
    if (!repository || !content) {
      setProcessedContent("")
      return
    }

    // Basic markdown processing - replace relative image and link URLs
    const baseUrl = `https://github.com/${repository.owner}/${repository.name}/raw/main/`
    const baseBlobUrl = `https://github.com/${repository.owner}/${repository.name}/blob/main/`

    const processed = content
      // Replace relative image URLs
      .replace(/!\[([^\]]*)\]$$(?!https?:\/\/)([^)]+)$$/g, `![$1](${baseUrl}$2)`)
      // Replace relative link URLs (but not anchors)
      .replace(/\[([^\]]+)\]$$(?!https?:\/\/|#)([^)]+)$$/g, `[$1](${baseBlobUrl}$2)`)

    setProcessedContent(processed)
  }, [repository, content])

  if (!repository) {
    return (
              <div className="w-96 border-l border-gray-200 bg-card">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Repository Details
          </h3>
        </div>
        <div className="p-4 h-[calc(100%-73px)] overflow-y-auto">
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2" />
            <p>Select a repository to view details</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-96 border-l border-gray-200 bg-card flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Repository Details
          </h3>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Repository Info */}
      <div className="p-4 border-b border-gray-200 bg-muted/30">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-lg">
              {repository.owner}/{repository.name}
            </h4>
            {repository.description && <p className="text-sm text-muted-foreground mt-1">{repository.description}</p>}
          </div>

          {/* Repository Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {repository.stargazersCount.toLocaleString()}
            </div>
            {repository.language && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary"></div>
                {repository.language}
              </div>
            )}
          </div>

          {/* Update Available Badge */}
          {repository.updateAvailable && (
            <Badge variant="destructive" className="text-xs">
              Update Available
            </Badge>
          )}

          {/* Tags */}
          {(repository.customTags.length > 0 || repository.topics.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {repository.customTags.slice(0, 3).map((tag) => (
                <Badge key={`custom-${tag}`} variant="default" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {repository.topics.slice(0, 2).map((topic) => (
                <Badge key={`topic-${topic}`} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
              {repository.customTags.length + repository.topics.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{repository.customTags.length + repository.topics.length - 5}
                </Badge>
              )}
            </div>
          )}

          {/* External Link */}
          <Button variant="outline" size="sm" className="w-full bg-transparent" asChild>
            <a
              href={`https://github.com/${repository.owner}/${repository.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-3 w-3" />
              View on GitHub
            </a>
          </Button>
        </div>
      </div>

      {/* Tabbed Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="readme" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="readme">README</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>

          <TabsContent value="readme" className="flex-1 overflow-y-auto mt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground">Loading README...</p>
                </div>
              </div>
            ) : content ? (
              <div className="p-4">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <MarkdownRenderer content={processedContent} />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p className="font-medium">No README found</p>
                  <p className="text-xs mt-1">This repository doesn&apos;t have a README file</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="versions" className="flex-1 overflow-y-auto mt-0 p-4">
            <VersionTracker repository={repository} onVersionUpdate={onVersionUpdate} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Simple markdown renderer component
function MarkdownRenderer({ content }: { content: string }) {
  const [renderedContent, setRenderedContent] = useState<string>("")

  useEffect(() => {
    // Basic markdown to HTML conversion
    const html = content
      // Headers
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      // Bold
      .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
      .replace(/__(.*?)__/gim, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*)\*/gim, "<em>$1</em>")
      .replace(/_(.*?)_/gim, "<em>$1</em>")
      // Code blocks
      .replace(/```([\s\S]*?)```/gim, "<pre><code>$1</code></pre>")
      // Inline code
      .replace(/`(.*?)`/gim, "<code>$1</code>")
      // Links
      .replace(/\[([^\]]+)\]$$([^)]+)$$/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Images
      .replace(/!\[([^\]]*)\]$$([^)]+)$$/gim, '<img src="$2" alt="$1" style="max-width: 100%; height: auto;" />')
      // Line breaks
      .replace(/\n/gim, "<br>")

    setRenderedContent(html)
  }, [content])

  return <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
}
