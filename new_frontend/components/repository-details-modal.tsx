"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VersionTracker } from "@/components/version-tracker"
import { Markdown } from "@/components/markdown"
import { AlertTriangle, BookOpen, ExternalLink, Plus, RefreshCw, Save, StickyNote, X } from "lucide-react"
import { errorMessage } from "@/lib/api"
import type { Repository } from "@/lib/types"

interface RepositoryDetailsModalProps {
  repository: Repository | null
  isOpen: boolean
  onClose: () => void
  readmeContent: string
  readmeError: string | null
  isLoadingReadme: boolean
  onRefreshReadme: () => void
  onRepositoryUpdate: (repoId: number, patch: Partial<Repository>) => void
  onSaveNotes: (repoId: number, notes: string | null) => Promise<void>
  onRemoveTag: (repoId: number, tag: string) => Promise<void>
  onAddTag: (repoId: number, tag: string) => Promise<void>
}

type TabValue = "readme" | "versions" | "notes"

export function RepositoryDetailsModal({
  repository,
  isOpen,
  onClose,
  readmeContent,
  readmeError,
  isLoadingReadme,
  onRefreshReadme,
  onRepositoryUpdate,
  onSaveNotes,
  onRemoveTag,
  onAddTag,
}: RepositoryDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("readme")
  const [newTag, setNewTag] = useState("")
  const [isUpdatingTags, setIsUpdatingTags] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteSaved, setNoteSaved] = useState(false)

  const previousRepoId = useRef<number | null>(null)
  const repoId = repository?.id ?? null

  // Reset per-repository UI only when the repository actually changes, not on every
  // prop update (a version refresh, for example).
  useEffect(() => {
    if (previousRepoId.current !== repoId) {
      previousRepoId.current = repoId
      setActiveTab("readme")
      setNewTag("")
      setNoteError(null)
      setNoteSaved(false)
      setNoteDraft(repository?.notes ?? "")
    }
  }, [repoId, repository?.notes])

  const handleAddTag = useCallback(async () => {
    if (!repository || !newTag.trim()) return
    setIsUpdatingTags(true)
    try {
      await onAddTag(repository.id, newTag.trim())
      setNewTag("")
    } finally {
      setIsUpdatingTags(false)
    }
  }, [newTag, onAddTag, repository])

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!repository) return
      setIsUpdatingTags(true)
      try {
        await onRemoveTag(repository.id, tag)
      } finally {
        setIsUpdatingTags(false)
      }
    },
    [onRemoveTag, repository],
  )

  const handleSaveNote = useCallback(async () => {
    if (!repository) return
    setIsSavingNote(true)
    setNoteError(null)
    try {
      await onSaveNotes(repository.id, noteDraft.trim() === "" ? null : noteDraft)
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
    } catch (error) {
      setNoteError(errorMessage(error, "Failed to save note"))
    } finally {
      setIsSavingNote(false)
    }
  }, [noteDraft, onSaveNotes, repository])

  if (!repository) return null

  const repoRef = {
    owner: repository.owner,
    name: repository.name,
    branch: repository.defaultBranch,
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden"
        aria-describedby="repository-details-description"
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <a
              href={repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:underline"
            >
              {repository.owner}/{repository.name}
            </a>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            {repository.updateAvailable && (
              <Badge className="bg-amber-500/15 text-xs text-amber-700 hover:bg-amber-500/25 dark:text-amber-300">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Update available
              </Badge>
            )}
            {repository.archived && (
              <Badge variant="outline" className="text-xs">
                Archived
              </Badge>
            )}
          </DialogTitle>
          <div id="repository-details-description" className="sr-only">
            Repository details for {repository.owner}/{repository.name}
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-3">
          {repository.customTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                disabled={isUpdatingTags}
                aria-label={`Remove tag ${tag}`}
                className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <Input
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleAddTag()
                }
              }}
              placeholder="Add tag..."
              className="h-7 w-36 text-xs"
              aria-label="Add a custom tag"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={handleAddTag}
              disabled={isUpdatingTags || !newTag.trim()}
              aria-label="Add tag"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TabValue)}
            className="flex h-full flex-col"
          >
            <TabsList className="grid w-full shrink-0 grid-cols-3">
              <TabsTrigger value="readme">README</TabsTrigger>
              <TabsTrigger value="versions">Changelog</TabsTrigger>
              <TabsTrigger value="notes">
                Notes
                {repository.notes ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" /> : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="readme" className="mt-0 flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              <div className="flex h-full flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="h-4 w-4" />
                    README.md
                  </h3>
                  <Button onClick={onRefreshReadme} disabled={isLoadingReadme} variant="outline" size="sm">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingReadme ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {isLoadingReadme ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                  </div>
                ) : readmeError ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p>{readmeError}</p>
                  </div>
                ) : readmeContent ? (
                  <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
                    <div className="flex-1 overflow-y-auto p-6">
                      <Markdown repo={repoRef}>{readmeContent}</Markdown>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p>No README found for this repository</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="versions" className="mt-0 flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {/* Mounted lazily so opening the modal does not hit the releases API. */}
              {activeTab === "versions" && (
                <VersionTracker repository={repository} onRepositoryUpdate={onRepositoryUpdate} />
              )}
            </TabsContent>

            <TabsContent value="notes" className="mt-0 flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              <div className="flex h-full flex-col gap-3">
                <div className="flex shrink-0 items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <StickyNote className="h-4 w-4" />
                    Your notes
                  </h3>
                  <div className="flex items-center gap-2">
                    {noteSaved && <span className="text-xs text-muted-foreground">Saved</span>}
                    <Button size="sm" onClick={handleSaveNote} disabled={isSavingNote}>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </div>
                {noteError && (
                  <p role="alert" className="text-xs text-destructive">
                    {noteError}
                  </p>
                )}
                <Textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Why did you star this? Markdown is supported, and notes are searchable from the dashboard."
                  className="min-h-[8rem] flex-1 font-mono text-sm"
                  aria-label="Repository notes"
                />
                {noteDraft.trim() && (
                  <div className="max-h-52 shrink-0 overflow-y-auto rounded-md border border-border p-3">
                    <Markdown compact repo={repoRef}>
                      {noteDraft}
                    </Markdown>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
