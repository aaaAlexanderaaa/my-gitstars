"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Markdown } from "@/components/markdown"
import { AlertTriangle, Check, Clock, Copy, ExternalLink, Package, RefreshCw, Star } from "lucide-react"
import { apiGet, apiSend, errorMessage } from "@/lib/api"
import { formatVersion, type Release, type Repository } from "@/lib/types"

interface VersionTrackerProps {
  repository: Repository
  onRepositoryUpdate: (repoId: number, patch: Partial<Repository>) => void
}

const NOT_USING = "__not_using__"

export function VersionTracker({ repository, onRepositoryUpdate }: VersionTrackerProps) {
  const [releases, setReleases] = useState<Release[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMoreStage, setShowMoreStage] = useState(0)
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)

  const repoId = repository.id
  // Guards against a slow response for a previously selected repository painting its
  // releases over the one now on screen.
  const requestRef = useRef(0)
  const onRepositoryUpdateRef = useRef(onRepositoryUpdate)
  onRepositoryUpdateRef.current = onRepositoryUpdate

  useEffect(() => {
    setExpandedNotes({})
    setShowMoreStage(0)
    setCopied(false)
    setReleases([])
    setError(null)
  }, [repoId])

  const loadReleases = useCallback(
    async (refresh = false) => {
      const requestId = ++requestRef.current
      setIsLoading(true)
      setError(null)
      try {
        const data = await apiGet<{ releases: Release[]; repo?: Partial<Repository> }>(
          `/api/releases/repo/${repoId}${refresh ? "?refresh=true" : ""}`,
        )
        if (requestId !== requestRef.current) return
        setReleases(data.releases || [])
        if (data.repo) onRepositoryUpdateRef.current(repoId, data.repo)
      } catch (err) {
        if (requestId !== requestRef.current) return
        setError(errorMessage(err, "Failed to load releases"))
      } finally {
        if (requestId === requestRef.current) setIsLoading(false)
      }
    },
    [repoId],
  )

  useEffect(() => {
    loadReleases()
  }, [loadReleases])

  const updateCurrentVersion = async (version: string | null) => {
    setIsUpdating(true)
    setError(null)
    try {
      const data = await apiSend<{ repo: Partial<Repository> }>(
        "PATCH",
        `/api/releases/repo/${repoId}/version`,
        { currentlyUsedVersion: version },
      )
      // Trust the server's computed flags rather than recomputing them here.
      onRepositoryUpdateRef.current(repoId, data.repo ?? { currentlyUsedVersion: version })
    } catch (err) {
      setError(errorMessage(err, "Failed to update version"))
    } finally {
      setIsUpdating(false)
    }
  }

  const currentVersion = repository.currentlyUsedVersion
  const latestVersion = repository.latestVersion

  const { initialDisplay, newerVersions, olderVersions } = useMemo(() => {
    const empty = { initialDisplay: releases, newerVersions: [] as Release[], olderVersions: [] as Release[] }
    if (!currentVersion || releases.length === 0) return empty

    const currentIndex = releases.findIndex((release) => release.tagName === currentVersion)
    if (currentIndex === -1) return empty

    const latestStableIndex = releases.findIndex((release) => !release.isPrerelease && !release.isDraft)
    if (latestStableIndex === -1) return empty

    if (currentIndex === latestStableIndex) {
      return {
        initialDisplay: [releases[currentIndex]],
        newerVersions: releases.slice(0, currentIndex),
        olderVersions: releases.slice(currentIndex + 1),
      }
    }

    // Releases arrive newest-first.
    if (currentIndex > latestStableIndex) {
      return {
        initialDisplay: releases.slice(latestStableIndex, currentIndex + 1).reverse(),
        newerVersions: releases.slice(0, latestStableIndex),
        olderVersions: releases.slice(currentIndex + 1),
      }
    }

    return {
      initialDisplay: releases.slice(currentIndex, latestStableIndex + 1),
      newerVersions: releases.slice(0, currentIndex),
      olderVersions: releases.slice(latestStableIndex + 1),
    }
  }, [releases, currentVersion])

  const displayedReleases = useMemo(() => {
    if (showMoreStage >= 2) return [...initialDisplay, ...newerVersions, ...olderVersions]
    if (showMoreStage === 1) return [...initialDisplay, ...newerVersions]
    return initialDisplay
  }, [showMoreStage, initialDisplay, newerVersions, olderVersions])

  const latestStable = useMemo(
    () => releases.find((release) => !release.isPrerelease && !release.isDraft),
    [releases],
  )

  const changelogReleases = useMemo(() => {
    if (!currentVersion || !latestVersion || currentVersion === latestVersion) return []
    const currentIndex = releases.findIndex((release) => release.tagName === currentVersion)
    const latestIndex = releases.findIndex((release) => release.tagName === latestVersion)
    if (currentIndex === -1 || latestIndex === -1) return []
    return releases.slice(latestIndex, currentIndex + 1).reverse()
  }, [releases, currentVersion, latestVersion])

  const copyChangelog = async () => {
    if (changelogReleases.length === 0) return

    const lines = [
      `# Changelog: ${formatVersion(currentVersion)} -> ${formatVersion(latestVersion)}`,
      "",
      `Repository: ${repository.owner}/${repository.name}`,
      "",
      "---",
      "",
    ]

    changelogReleases.forEach((release, index) => {
      const label =
        release.tagName === currentVersion ? " (Current)" : release.tagName === latestVersion ? " (Latest)" : ""
      lines.push(`## ${release.tagName}${label}`)
      if (release.name && release.name !== release.tagName) lines.push(`### ${release.name}`)
      lines.push("")
      lines.push(
        `*Published: ${release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : "unknown"}*${
          release.isPrerelease ? " | Pre-release" : ""
        }`,
      )
      lines.push("")
      lines.push(release.body || "*No release notes*")
      lines.push("")
      if (index < changelogReleases.length - 1) lines.push("---", "")
    })

    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Could not copy to the clipboard")
    }
  }

  const hiddenCount = newerVersions.length + olderVersions.length

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Package className="h-3 w-3" />
          Version tracking
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadReleases(true)}
          disabled={isLoading}
          className="h-6 w-6 p-0"
          aria-label="Refresh releases"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex flex-1 flex-col space-y-2 overflow-hidden p-3">
        {error && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Latest:</span>
              <Badge variant="outline" className="h-4 px-1 text-xs">
                {latestVersion ? formatVersion(latestVersion) : "Unknown"}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Current:</span>
              {currentVersion ? (
                <Badge variant="secondary" className="h-4 px-1 text-xs">
                  {formatVersion(currentVersion)}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Not set</span>
              )}
            </div>
          </div>

          {repository.updateAvailable && (
            <div className="flex items-center justify-between gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
              <span className="flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                Update available
              </span>
              {changelogReleases.length > 0 && (
                <Button variant="ghost" size="sm" onClick={copyChangelog} className="h-5 px-2 text-xs">
                  {copied ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      Copy changelog
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {releases.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="version-select" className="text-xs text-muted-foreground">
                Set current version
              </label>
              <Select
                value={currentVersion || NOT_USING}
                onValueChange={(value) => updateCurrentVersion(value === NOT_USING ? null : value)}
                disabled={isUpdating}
              >
                <SelectTrigger id="version-select" className="h-7 w-full text-xs">
                  <SelectValue placeholder="Select version..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_USING} className="text-xs">
                    Not using
                  </SelectItem>
                  {releases.map((release) => (
                    <SelectItem key={release.tagName} value={release.tagName} className="text-xs">
                      <span className="flex items-center gap-2">
                        {release.tagName}
                        {release.isPrerelease && (
                          <Badge variant="outline" className="text-xs">
                            Pre
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* One state at a time: the list used to render underneath a full-height
            spinner during a refresh. */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
              <p className="mt-2 text-sm text-muted-foreground">Loading releases...</p>
            </div>
          </div>
        ) : releases.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>{error ? "Releases unavailable" : "No releases found for this repository"}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <h4 className="text-sm font-medium">
                Releases ({displayedReleases.length}
                {showMoreStage === 0 && hiddenCount > 0 && (
                  <span className="text-muted-foreground"> + {hiddenCount} more</span>
                )}
                {showMoreStage === 1 && olderVersions.length > 0 && (
                  <span className="text-muted-foreground"> + {olderVersions.length} older</span>
                )}
                )
              </h4>
              {showMoreStage === 0 && newerVersions.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setShowMoreStage(1)} className="h-6 px-2 text-xs">
                  Show newer ({newerVersions.length})
                </Button>
              ) : showMoreStage === 1 && olderVersions.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setShowMoreStage(2)} className="h-6 px-2 text-xs">
                  Show older ({olderVersions.length})
                </Button>
              ) : showMoreStage > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setShowMoreStage(0)} className="h-6 px-2 text-xs">
                  Show less
                </Button>
              ) : null}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto rounded-md border border-border p-2 pr-1">
              {displayedReleases.map((release) => (
                <div key={release.tagName} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium">{release.tagName}</span>
                      {release.isPrerelease && (
                        <Badge variant="outline" className="text-xs">
                          Pre
                        </Badge>
                      )}
                      {release.tagName === currentVersion && (
                        <Badge className="bg-emerald-500/15 text-xs text-emerald-700 dark:text-emerald-300">
                          <Check className="mr-1 h-3 w-3" />
                          Current
                        </Badge>
                      )}
                      {latestStable &&
                        release.tagName === latestStable.tagName &&
                        release.tagName !== currentVersion && (
                          <Badge className="bg-primary/15 text-xs text-primary">
                            <Star className="mr-1 h-3 w-3" />
                            Latest
                          </Badge>
                        )}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : "unknown"}
                    </span>
                  </div>

                  {release.name && release.name !== release.tagName && (
                    <h5 className="text-lg font-semibold">{release.name}</h5>
                  )}

                  {release.body && (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          aria-expanded={!!expandedNotes[release.tagName]}
                          onClick={() =>
                            setExpandedNotes((prev) => ({ ...prev, [release.tagName]: !prev[release.tagName] }))
                          }
                        >
                          {expandedNotes[release.tagName] ? "Hide notes" : "Show notes"}
                        </Button>
                      </div>
                      {expandedNotes[release.tagName] && (
                        <Markdown
                          compact
                          repo={{ owner: repository.owner, name: repository.name, branch: release.tagName }}
                        >
                          {release.body}
                        </Markdown>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end border-t border-border pt-2">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" asChild>
                      <a
                        href={`https://github.com/${repository.owner}/${repository.name}/releases/tag/${encodeURIComponent(release.tagName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View release
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
