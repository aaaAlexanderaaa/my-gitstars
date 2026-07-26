"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { TagFilterPanel } from "@/components/tag-filter-panel"
import { RepositoryDetailsModal } from "@/components/repository-details-modal"
import { RepositoryCard } from "@/components/repository-card"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  AlertTriangle,
  Download,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { ApiError, apiGet, apiGetText, apiSend, errorMessage } from "@/lib/api"
import {
  type Repository,
  type SortField,
  type SortOrder,
  type Stats,
  type SyncStatus,
  type User,
  compactNumber,
} from "@/lib/types"
import { parseFilterExpression, validateFilterExpression, type FilterNode } from "@/lib/filter-expression"
import { filterRepositories, type QuickFilter } from "@/lib/filter-repositories"

interface AdvancedFilter {
  id: string
  expression: string
  node: FilterNode
}

const PAGE_SIZE = 60
const SYNC_POLL_MS = 5000

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "starredAt-desc", label: "Recently starred" },
  { value: "starredAt-asc", label: "Oldest starred" },
  { value: "pushedAt-desc", label: "Recently pushed" },
  { value: "stargazersCount-desc", label: "Most stars" },
  { value: "stargazersCount-asc", label: "Least stars" },
  { value: "forksCount-desc", label: "Most forks" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
]

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: "updates", label: "Updates available" },
  { key: "untagged", label: "Untagged" },
  { key: "archived", label: "Archived" },
  { key: "forks", label: "Forks" },
  { key: "unfollowed", label: "Unstarred" },
]

export default function DashboardPage() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [banner, setBanner] = useState<{ kind: "error" | "info"; text: string } | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilter[]>([])
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([])
  const [sortBy, setSortBy] = useState<SortField>("starredAt")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const previousSyncStatusRef = useRef<string | null>(null)

  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [readmeContent, setReadmeContent] = useState("")
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const [isLoadingReadme, setIsLoadingReadme] = useState(false)
  const readmeRequestRef = useRef(0)

  const [tagErrors, setTagErrors] = useState<Record<number, string>>({})
  const [updatingTags, setUpdatingTags] = useState<Record<number, boolean>>({})

  const [batchTagInput, setBatchTagInput] = useState("")
  const [isBatchTagging, setIsBatchTagging] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleUnauthorized = useCallback(() => {
    router.replace("/")
  }, [router])

  const reportError = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiError && error.isUnauthorized) {
        handleUnauthorized()
        return
      }
      setBanner({ kind: "error", text: errorMessage(error, fallback) })
    },
    [handleUnauthorized],
  )

  // --- data loading ----------------------------------------------------------

  const loadRepositories = useCallback(async () => {
    const data = await apiGet<{ repos: Repository[] }>("/api/repos?includeUnfollowed=true")
    setRepositories(data.repos || [])
  }, [])

  const loadStats = useCallback(async () => {
    try {
      setStats(await apiGet<Stats>("/api/stats"))
    } catch {
      // Stats are decoration; a failure here must not blank the dashboard.
    }
  }, [])

  // Kept in a ref so the polling effect below never has to be torn down and
  // recreated when the repository list changes.
  const refreshRef = useRef(async () => {})
  refreshRef.current = async () => {
    try {
      await Promise.all([loadRepositories(), loadStats()])
    } catch (error) {
      reportError(error, "Failed to refresh repositories")
    }
  }

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      try {
        const currentUser = await apiGet<User>("/auth/user")
        if (cancelled) return
        setUser(currentUser)
        await Promise.all([loadRepositories(), loadStats()])
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.isUnauthorized) {
          handleUnauthorized()
          return
        }
        reportError(error, "Failed to load your repositories")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    initialize()
    return () => {
      cancelled = true
    }
  }, [handleUnauthorized, loadRepositories, loadStats, reportError])

  const fetchSyncStatus = useCallback(async () => {
    try {
      const data = await apiGet<SyncStatus>("/api/sync/status")
      setSyncStatus(data)
      setIsSyncing(data?.status === "in_progress")

      const previous = previousSyncStatusRef.current
      previousSyncStatusRef.current = data?.status ?? null

      if (previous === "in_progress" && data?.status === "completed") {
        await refreshRef.current()
      }
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) handleUnauthorized()
    }
  }, [handleUnauthorized])

  useEffect(() => {
    fetchSyncStatus()
    const intervalId = setInterval(fetchSyncStatus, SYNC_POLL_MS)
    return () => clearInterval(intervalId)
  }, [fetchSyncStatus])

  // --- filtering -------------------------------------------------------------

  const filteredRepositories = useMemo(
    () =>
      filterRepositories(repositories, {
        searchQuery,
        selectedTags,
        advancedFilters,
        quickFilters,
        sortBy,
        sortOrder,
      }),
    [repositories, searchQuery, selectedTags, advancedFilters, quickFilters, sortBy, sortOrder],
  )

  const followedRepositories = useMemo(
    () => repositories.filter((repo) => repo.isFollowed),
    [repositories],
  )

  const tagSuggestions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const repo of repositories) {
      for (const tag of repo.customTags) counts.set(tag, (counts.get(tag) || 0) + 1)
      for (const topic of repo.topics) counts.set(topic, (counts.get(topic) || 0) + 1)
      if (repo.language) counts.set(repo.language, (counts.get(repo.language) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag)
  }, [repositories])

  const knownCustomTags = useMemo(() => {
    const tags = new Set<string>()
    for (const repo of repositories) for (const tag of repo.customTags) tags.add(tag)
    return Array.from(tags).sort((a, b) => a.localeCompare(b))
  }, [repositories])

  // Reset the render window whenever the result set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, selectedTags, advancedFilters, quickFilters, sortBy, sortOrder])

  const visibleRepositories = useMemo(
    () => filteredRepositories.slice(0, visibleCount),
    [filteredRepositories, visibleCount],
  )

  // Grow the window as the sentinel scrolls into view, so a 5000-star account does
  // not mount 5000 cards up front.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= filteredRepositories.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredRepositories.length))
        }
      },
      { rootMargin: "400px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, filteredRepositories.length])

  // --- keyboard shortcuts ----------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // --- mutations -------------------------------------------------------------

  const applyTagsLocally = useCallback((repoId: number, tags: string[]) => {
    setRepositories((prev) => prev.map((repo) => (repo.id === repoId ? { ...repo, customTags: tags } : repo)))
    setSelectedRepo((prev) => (prev && prev.id === repoId ? { ...prev, customTags: tags } : prev))
  }, [])

  const showTagError = useCallback((repoId: number, message: string) => {
    setTagErrors((prev) => ({ ...prev, [repoId]: message }))
    setTimeout(() => {
      setTagErrors((prev) => {
        const next = { ...prev }
        delete next[repoId]
        return next
      })
    }, 4000)
  }, [])

  const mutateTags = useCallback(
    async (repoId: number, tag: string, action: "add" | "delete") => {
      setUpdatingTags((prev) => ({ ...prev, [repoId]: true }))
      try {
        // The server is the source of truth for the resulting tag list, so state is
        // only updated once the write has actually succeeded.
        const result = await apiSend<{ tags: string[] }>("POST", `/api/repos/${repoId}/tags`, {
          tags: tag,
          action,
        })
        applyTagsLocally(repoId, result.tags)
      } catch (error) {
        if (error instanceof ApiError && error.isUnauthorized) {
          handleUnauthorized()
          return
        }
        showTagError(repoId, errorMessage(error, "Failed to update tags"))
      } finally {
        setUpdatingTags((prev) => {
          const next = { ...prev }
          delete next[repoId]
          return next
        })
      }
    },
    [applyTagsLocally, handleUnauthorized, showTagError],
  )

  const handleAddTag = useCallback(
    async (repoId: number, tag: string) => {
      const repo = repositories.find((candidate) => candidate.id === repoId)
      if (repo?.customTags.some((existing) => existing.toLowerCase() === tag.trim().toLowerCase())) {
        showTagError(repoId, "That tag is already on this repository")
        return
      }
      await mutateTags(repoId, tag, "add")
    },
    [mutateTags, repositories, showTagError],
  )

  const handleRemoveTag = useCallback(
    async (repoId: number, tag: string) => {
      await mutateTags(repoId, tag, "delete")
    },
    [mutateTags],
  )

  const clearTagError = useCallback((repoId: number) => {
    setTagErrors((prev) => {
      const next = { ...prev }
      delete next[repoId]
      return next
    })
  }, [])

  const runBulkTag = useCallback(
    async (action: "add" | "delete") => {
      const tag = batchTagInput.trim()
      if (!tag) return

      const targets = filteredRepositories.filter((repo) =>
        action === "add" ? !repo.customTags.includes(tag) : repo.customTags.includes(tag),
      )

      if (targets.length === 0) {
        setBanner({
          kind: "info",
          text:
            action === "add"
              ? "Every repository in view already has that tag"
              : "No repository in view has that tag",
        })
        return
      }

      const verb = action === "add" ? "Add" : "Remove"
      if (!window.confirm(`${verb} "${tag}" ${action === "add" ? "to" : "from"} ${targets.length} repositories?`)) {
        return
      }

      setIsBatchTagging(true)
      try {
        // One request instead of one per repository: the old loop fired hundreds of
        // round-trips and left a half-applied result if the tab was closed.
        const result = await apiSend<{ updated: Array<{ id: number; tags: string[] }>; updatedCount: number }>(
          "POST",
          "/api/repos/bulk-tags",
          { repoIds: targets.map((repo) => repo.id), tags: tag, action },
        )

        const updates = new Map(result.updated.map((entry) => [entry.id, entry.tags]))
        setRepositories((prev) =>
          prev.map((repo) => (updates.has(repo.id) ? { ...repo, customTags: updates.get(repo.id)! } : repo)),
        )
        setBatchTagInput("")
        setBanner({
          kind: "info",
          text: `${action === "add" ? "Tagged" : "Untagged"} ${result.updatedCount} repositories`,
        })
      } catch (error) {
        reportError(error, "Bulk tagging failed")
      } finally {
        setIsBatchTagging(false)
      }
    },
    [batchTagInput, filteredRepositories, reportError],
  )

  const handleSync = useCallback(async () => {
    setIsSyncing(true)
    try {
      await apiSend("POST", "/api/sync")
      await fetchSyncStatus()
    } catch (error) {
      setIsSyncing(false)
      reportError(error, "Failed to start sync")
    }
  }, [fetchSyncStatus, reportError])

  const handleLogout = useCallback(async () => {
    try {
      await apiSend("POST", "/auth/logout")
    } catch {
      // Navigate away regardless; the session is unusable either way.
    }
    router.replace("/")
  }, [router])

  const openRepository = useCallback(async (repo: Repository, options?: { refresh?: boolean }) => {
    setSelectedRepo(repo)
    setIsLoadingReadme(true)
    setReadmeContent("")
    setReadmeError(null)

    const requestId = ++readmeRequestRef.current
    try {
      const query = options?.refresh ? "?refresh=true" : ""
      const text = await apiGetText(`/api/repos/${repo.owner}/${repo.name}/readme${query}`)
      // Ignore a slow response for a repository the user has already navigated past.
      if (requestId !== readmeRequestRef.current) return
      setReadmeContent(text)
    } catch (error) {
      if (requestId !== readmeRequestRef.current) return
      setReadmeError(
        error instanceof ApiError && error.status === 404
          ? "No README found for this repository"
          : errorMessage(error, "Failed to load README"),
      )
    } finally {
      if (requestId === readmeRequestRef.current) setIsLoadingReadme(false)
    }
  }, [])

  const handleRepositoryUpdate = useCallback((repoId: number, patch: Partial<Repository>) => {
    const merge = (repo: Repository): Repository => {
      const merged = { ...repo, ...patch }
      return {
        ...merged,
        updateAvailable:
          patch.updateAvailable ??
          !!(
            merged.latestVersion &&
            merged.currentlyUsedVersion &&
            merged.currentlyUsedVersion !== merged.latestVersion
          ),
      }
    }
    setRepositories((prev) => prev.map((repo) => (repo.id === repoId ? merge(repo) : repo)))
    setSelectedRepo((prev) => (prev && prev.id === repoId ? merge(prev) : prev))
  }, [])

  const handleSaveNotes = useCallback(
    async (repoId: number, notes: string | null) => {
      const result = await apiSend<{ notes: string | null }>("PUT", `/api/repos/${repoId}/notes`, { notes })
      handleRepositoryUpdate(repoId, { notes: result.notes })
    },
    [handleRepositoryUpdate],
  )

  const handleRenameTag = useCallback(
    async (from: string, to: string) => {
      await apiSend("PATCH", `/api/tags/${encodeURIComponent(from)}`, { tag: to })
      setSelectedTags((prev) => prev.map((tag) => (tag === from ? to : tag)))
      await refreshRef.current()
      setBanner({ kind: "info", text: `Renamed "${from}" to "${to}"` })
    },
    [],
  )

  const handleDeleteTag = useCallback(async (tag: string) => {
    await apiSend("DELETE", `/api/tags/${encodeURIComponent(tag)}`)
    setSelectedTags((prev) => prev.filter((selected) => selected !== tag))
    await refreshRef.current()
    setBanner({ kind: "info", text: `Removed "${tag}" everywhere` })
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const payload = await apiGet<unknown>("/api/export")
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `gitstars-${user?.username || "export"}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      reportError(error, "Export failed")
    }
  }, [reportError, user?.username])

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const parsed = JSON.parse(await file.text())
        const result = await apiSend<{ updated: number; notFound: string[] }>("POST", "/api/import", {
          repositories: parsed.repositories ?? parsed,
          mode: "merge",
        })
        await refreshRef.current()
        setBanner({
          kind: "info",
          text: `Imported ${result.updated} repositories${
            result.notFound.length ? ` (${result.notFound.length} not in your stars)` : ""
          }`,
        })
      } catch (error) {
        reportError(error, "Import failed - is this a gitstars export file?")
      }
    },
    [reportError],
  )

  const handlePruneUnfollowed = useCallback(async () => {
    const count = repositories.filter((repo) => !repo.isFollowed).length
    if (count === 0) {
      setBanner({ kind: "info", text: "Nothing to prune" })
      return
    }
    if (!window.confirm(`Permanently delete ${count} unstarred repositories, including their tags and notes?`)) {
      return
    }
    try {
      const result = await apiSend<{ deleted: number }>("DELETE", "/api/repos/unfollowed")
      await refreshRef.current()
      setBanner({ kind: "info", text: `Deleted ${result.deleted} unstarred repositories` })
    } catch (error) {
      reportError(error, "Prune failed")
    }
  }, [repositories, reportError])

  const addAdvancedFilter = useCallback((expression: string) => {
    const trimmed = expression.trim()
    if (!trimmed) return
    const problem = validateFilterExpression(trimmed)
    if (problem) {
      setBanner({ kind: "error", text: `Invalid filter: ${problem}` })
      return
    }
    const node = parseFilterExpression(trimmed)
    if (!node) return
    setAdvancedFilters((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, expression: trimmed, node }])
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((current) => current !== tag) : [...prev, tag]))
  }, [])

  const toggleQuickFilter = useCallback((key: QuickFilter) => {
    setQuickFilters((prev) => (prev.includes(key) ? prev.filter((current) => current !== key) : [...prev, key]))
  }, [])

  // --- render ----------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  const syncWarning = syncStatus?.status === "completed" && syncStatus.error ? syncStatus.error : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/my-gitstars-logo.svg" alt="" className="h-8 w-8" />
              <h1 className="text-xl font-semibold">my-gitstars</h1>
            </div>

            <div className="flex flex-col gap-1">
              <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? `Syncing ${Math.round(syncStatus?.progress ?? 0)}%` : "Sync"}
              </Button>
              <div className="text-xs text-muted-foreground">
                {syncStatus?.status === "failed" && syncStatus.error ? (
                  <span className="text-destructive">Sync failed: {syncStatus.error}</span>
                ) : syncStatus?.lastCompletedAt ? (
                  <span>
                    Last sync:{" "}
                    {new Date(syncStatus.lastCompletedAt).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : (
                  <span>Last sync: —</span>
                )}
              </div>
              {isSyncing && <Progress value={Math.round(syncStatus?.progress ?? 0)} className="h-1" />}
            </div>

            {stats && (
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline">Starred </dt>
                  <dd className="inline font-medium text-foreground">{compactNumber(stats.followed)}</dd>
                </div>
                <div>
                  <dt className="inline">Updates </dt>
                  <dd className="inline font-medium text-foreground">{stats.updatesAvailable}</dd>
                </div>
                <div>
                  <dt className="inline">Untagged </dt>
                  <dd className="inline font-medium text-foreground">{stats.untagged}</dd>
                </div>
                {stats.unfollowed > 0 && (
                  <div>
                    <dt className="inline">Unstarred </dt>
                    <dd className="inline font-medium text-foreground">{stats.unfollowed}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleExport} title="Download tags and notes as JSON">
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => importInputRef.current?.click()}
              title="Restore tags and notes from a JSON export"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) handleImportFile(file)
              }}
            />
            {(stats?.unfollowed ?? 0) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePruneUnfollowed}
                title="Delete repositories you no longer star"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatarUrl || "/placeholder-user.jpg"} alt="" />
                  <AvatarFallback>{user.username?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user.username}</span>
              </div>
            )}
            <Button onClick={handleLogout} variant="ghost" size="sm" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {(banner || syncWarning) && (
          <div
            role={banner?.kind === "error" ? "alert" : "status"}
            className={`flex items-start justify-between gap-3 border-t border-border px-4 py-2 text-sm ${
              banner?.kind === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {banner?.text ?? syncWarning}
            </span>
            {banner && (
              <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-w-0 flex-col md:h-[calc(100vh-73px)] md:flex-row">
        <TagFilterPanel
          repositories={filteredRepositories}
          allRepositories={followedRepositories}
          selectedTags={selectedTags}
          customTags={knownCustomTags}
          onTagToggle={toggleTag}
          onClearFilters={() => {
            setSelectedTags([])
            setAdvancedFilters([])
            setQuickFilters([])
          }}
          activeAdvancedFilters={advancedFilters}
          onAddAdvancedFilter={addAdvancedFilter}
          onRemoveAdvancedFilter={(id) => setAdvancedFilters((prev) => prev.filter((f) => f.id !== id))}
          onRenameTag={handleRenameTag}
          onDeleteTag={handleDeleteTag}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-card p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search name, description or notes...  (/)"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-10"
                  aria-label="Search repositories"
                />
              </div>

              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(event) => {
                  const [field, order] = event.target.value.split("-")
                  setSortBy(field as SortField)
                  setSortOrder(order as SortOrder)
                }}
                aria-label="Sort repositories"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <Input
                  placeholder={`Tag ${filteredRepositories.length} shown...`}
                  value={batchTagInput}
                  onChange={(event) => setBatchTagInput(event.target.value)}
                  className="h-9 w-44 text-sm"
                  disabled={isBatchTagging}
                  aria-label="Tag to apply to all shown repositories"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isBatchTagging) runBulkTag("add")
                  }}
                />
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => runBulkTag("add")}
                  disabled={!batchTagInput.trim() || isBatchTagging || filteredRepositories.length === 0}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add to all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => runBulkTag("delete")}
                  disabled={!batchTagInput.trim() || isBatchTagging || filteredRepositories.length === 0}
                  title="Remove this tag from every shown repository"
                >
                  <X className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {QUICK_FILTERS.map((filter) => {
                const active = quickFilters.includes(filter.key)
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => toggleQuickFilter(filter.key)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {filter.label}
                  </button>
                )
              })}
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredRepositories.length} of {repositories.length}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto">
            {filteredRepositories.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <p className="text-sm">
                  {repositories.length === 0
                    ? "No repositories yet - press Sync to import your GitHub stars."
                    : "No repositories match the current filters."}
                </p>
                {repositories.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("")
                      setSelectedTags([])
                      setAdvancedFilters([])
                      setQuickFilters([])
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div
                  className="grid gap-4 p-4"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", alignItems: "start" }}
                >
                  {visibleRepositories.map((repo) => (
                    <RepositoryCard
                      key={repo.id}
                      repo={repo}
                      suggestions={tagSuggestions}
                      tagError={tagErrors[repo.id]}
                      isUpdating={!!updatingTags[repo.id]}
                      onOpen={openRepository}
                      onTagToggle={toggleTag}
                      onAddTag={handleAddTag}
                      onRemoveTag={handleRemoveTag}
                      onClearTagError={clearTagError}
                    />
                  ))}
                </div>
                <div ref={sentinelRef} className="pb-6 text-center text-xs text-muted-foreground">
                  {visibleCount < filteredRepositories.length && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleCount((current) =>
                          Math.min(current + PAGE_SIZE, filteredRepositories.length),
                        )
                      }
                    >
                      Load {Math.min(PAGE_SIZE, filteredRepositories.length - visibleCount)} more
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <RepositoryDetailsModal
        repository={selectedRepo}
        isOpen={!!selectedRepo}
        onClose={() => setSelectedRepo(null)}
        readmeContent={readmeContent}
        readmeError={readmeError}
        isLoadingReadme={isLoadingReadme}
        onRefreshReadme={() => selectedRepo && openRepository(selectedRepo, { refresh: true })}
        onRepositoryUpdate={handleRepositoryUpdate}
        onSaveNotes={handleSaveNotes}
        onRemoveTag={handleRemoveTag}
        onAddTag={handleAddTag}
      />
    </div>
  )
}
