"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Package, RefreshCw, Clock, ExternalLink, Copy, Check, Star } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"

interface Release {
  tagName: string
  name: string
  body: string
  publishedAt: string
  isPrerelease: boolean
  isDraft?: boolean
}

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
  hasReleases?: boolean
  releasesLastFetched?: string
}

interface VersionTrackerProps {
  repository: Repository
  onVersionUpdate?: (repoId: number, version: string | null) => void
  onRepositoryMetaUpdate?: (repoId: number, patch: Partial<Repository>) => void
}

export function VersionTracker({ repository, onVersionUpdate, onRepositoryMetaUpdate }: VersionTrackerProps) {
  const [releases, setReleases] = useState<Release[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMoreStage, setShowMoreStage] = useState(0) // 0: initial, 1: show newer, 2: show all
  const [expandedNotes, setExpandedNotes] = useState<{ [tagName: string]: boolean }>({})
  const [copiedChangelog, setCopiedChangelog] = useState(false)

  const onRepositoryMetaUpdateRef = useRef(onRepositoryMetaUpdate)
  useEffect(() => {
    onRepositoryMetaUpdateRef.current = onRepositoryMetaUpdate
  }, [onRepositoryMetaUpdate])

  useEffect(() => {
    setExpandedNotes({})
    setShowMoreStage(0)
    setCopiedChangelog(false)
  }, [repository.id])

  // Load releases for the repository
  const loadReleases = useCallback(async (refresh = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (refresh) params.set("refresh", "true")

      const response = await fetch(`/api/releases/repo/${repository.id}?${params}`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setReleases(data.releases || [])
        if (data.repo) {
          onRepositoryMetaUpdateRef.current?.(repository.id, data.repo)
        }
      } else {
        setError("Failed to load releases")
      }
    } catch (error) {
      setError("Failed to load releases")
      console.error("Failed to load releases:", error)
    } finally {
      setIsLoading(false)
    }
  }, [repository.id])

  // Update the currently used version
  const updateCurrentVersion = async (version: string | null) => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/releases/repo/${repository.id}/version`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          currentlyUsedVersion: version,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        onVersionUpdate?.(repository.id, version)
        // The parent component should handle the update
      } else {
        setError("Failed to update version")
      }
    } catch (error) {
      setError("Failed to update version")
      console.error("Failed to update version:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  // Smart ordering: current → latest stable → newer than latest → older than current
  const getOrderedReleases = (releases: Release[]) => {
    const currentVersion = repository.currentlyUsedVersion
    if (!currentVersion) return { initialDisplay: releases, newerVersions: [], olderVersions: [] }

    const currentIndex = releases.findIndex(r => r.tagName === currentVersion)
    if (currentIndex === -1) return { initialDisplay: releases, newerVersions: [], olderVersions: [] }

    // Find latest stable release (not pre-release AND not draft) - matches backend logic
    const latestStableIndex = releases.findIndex(r => !r.isPrerelease && !r.isDraft)
    if (latestStableIndex === -1) {
      // No stable releases, fall back to showing all
      return { initialDisplay: releases, newerVersions: [], olderVersions: [] }
    }
    
    // If current IS the latest stable, show current only initially (since there's no range to display)
    if (currentIndex === latestStableIndex) {
      // Show newer releases (pre-releases) and older releases separately
      const newerReleases = releases.slice(0, currentIndex) // Everything newer than current (keep newest first order for newer versions)
      const olderReleases = releases.slice(currentIndex + 1) // Everything older than current (keep oldest first order for older versions)
      return {
        initialDisplay: [releases[currentIndex]], // Just current (which is latest stable)
        newerVersions: newerReleases,
        olderVersions: olderReleases
      }
    }
    
    // If current is NOT latest stable, show ALL versions from current to latest stable
    const currentRelease = releases[currentIndex]
    const latestStableRelease = releases[latestStableIndex]

    // Handle both cases: current older than latest (normal) or current newer than latest (prerelease)
    let currentToLatest: Release[]
    let newerThanRange: Release[]
    let olderThanRange: Release[]

    if (currentIndex > latestStableIndex) {
      // Current is OLDER than latest stable (normal case)
      // Releases are newest-first, so slice from latestStable to current, then reverse for display
      currentToLatest = releases.slice(latestStableIndex, currentIndex + 1).reverse()
      newerThanRange = releases.slice(0, latestStableIndex) // Everything newer than latest stable
      olderThanRange = releases.slice(currentIndex + 1) // Everything older than current
    } else {
      // Current is NEWER than latest stable (prerelease case)
      // Releases are newest-first, so slice from current to latestStable (already in display order)
      currentToLatest = releases.slice(currentIndex, latestStableIndex + 1)
      newerThanRange = releases.slice(0, currentIndex) // Everything newer than current
      olderThanRange = releases.slice(latestStableIndex + 1) // Everything older than latest stable
    }

    return {
      initialDisplay: currentToLatest,
      newerVersions: newerThanRange,
      olderVersions: olderThanRange
    }
  }

  // Load releases when component mounts
  useEffect(() => {
    loadReleases()
  }, [loadReleases])

  const releaseGroups = getOrderedReleases(releases)
  const { initialDisplay = releases, newerVersions = [], olderVersions = [] } = releaseGroups

  const displayedReleases = (() => {
    switch (showMoreStage) {
      case 0: return initialDisplay // Just current + latest stable
      case 1: return [...initialDisplay, ...newerVersions] // Add newer releases
      case 2: return [...initialDisplay, ...newerVersions, ...olderVersions] // Add all
      default: return initialDisplay
    }
  })()

  // Get releases between current version and latest version for copy functionality
  const getChangelogReleases = useCallback(() => {
    const currentVersion = repository.currentlyUsedVersion
    const latestVersion = repository.latestVersion

    if (!currentVersion || !latestVersion || currentVersion === latestVersion) {
      return []
    }

    const currentIndex = releases.findIndex(r => r.tagName === currentVersion)
    const latestIndex = releases.findIndex(r => r.tagName === latestVersion)

    if (currentIndex === -1 || latestIndex === -1) {
      return []
    }

    // Releases are ordered newest first, so latest has lower index
    // Return releases from latest (exclusive) to current (inclusive), ordered from current to latest
    return releases.slice(latestIndex, currentIndex + 1).reverse()
  }, [releases, repository.currentlyUsedVersion, repository.latestVersion])

  // Generate markdown for changelog copy
  const generateChangelogMarkdown = useCallback(() => {
    const changelogReleases = getChangelogReleases()
    if (changelogReleases.length === 0) return ""

    const lines: string[] = []
    lines.push(`# Changelog: ${repository.currentlyUsedVersion} → ${repository.latestVersion}`)
    lines.push("")
    lines.push(`Repository: ${repository.owner}/${repository.name}`)
    lines.push("")
    lines.push("---")
    lines.push("")

    changelogReleases.forEach((release, index) => {
      const isCurrent = release.tagName === repository.currentlyUsedVersion
      const isLatest = release.tagName === repository.latestVersion

      let label = ""
      if (isCurrent) label = " (Current)"
      else if (isLatest) label = " (Latest)"

      lines.push(`## ${release.tagName}${label}`)
      if (release.name && release.name !== release.tagName) {
        lines.push(`### ${release.name}`)
      }
      lines.push("")
      lines.push(`*Published: ${new Date(release.publishedAt).toLocaleDateString()}*${release.isPrerelease ? " | Pre-release" : ""}`)
      lines.push("")

      if (release.body) {
        lines.push(release.body)
      } else {
        lines.push("*No release notes*")
      }

      lines.push("")
      if (index < changelogReleases.length - 1) {
        lines.push("---")
        lines.push("")
      }
    })

    return lines.join("\n")
  }, [getChangelogReleases, repository.currentlyUsedVersion, repository.latestVersion, repository.owner, repository.name])

  // Copy changelog to clipboard
  const copyChangelog = useCallback(async () => {
    const markdown = generateChangelogMarkdown()
    if (!markdown) return

    try {
      await navigator.clipboard.writeText(markdown)
      setCopiedChangelog(true)
      setTimeout(() => setCopiedChangelog(false), 2000)
    } catch (err) {
      console.error("Failed to copy changelog:", err)
    }
  }, [generateChangelogMarkdown])

  const hasChangelogToCopy = repository.currentlyUsedVersion &&
    repository.latestVersion &&
    repository.currentlyUsedVersion !== repository.latestVersion &&
    getChangelogReleases().length > 0

  return (
    <div className="w-full h-full flex flex-col">
      {/* Minimal Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Package className="h-3 w-3" />
          Version Tracking
        </h3>
        <Button variant="ghost" size="sm" onClick={() => loadReleases(true)} disabled={isLoading} className="h-6 w-6 p-0" aria-label="Refresh releases">
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-3 space-y-2">
        {error && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Ultra Compact Version Status & Selection */}
        <div className="space-y-2 shrink-0">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Latest:</span>
              <Badge variant="outline" className="text-xs h-4 px-1">{repository.latestVersion || "Unknown"}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Current:</span>
              {repository.currentlyUsedVersion ? (
                <Badge variant="secondary" className="text-xs h-4 px-1">{repository.currentlyUsedVersion}</Badge>
              ) : (
                <span className="text-muted-foreground text-xs">Not set</span>
              )}
            </div>
          </div>

          {repository.updateAvailable && (
            <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-xs">Update available</span>
              </div>
              {hasChangelogToCopy && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyChangelog}
                  className="h-5 px-2 text-xs text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800/30"
                >
                  {copiedChangelog ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Changelog
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Version Selection */}
          {releases.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="version-select" className="text-xs text-muted-foreground">Set Current Version:</label>
              <Select
                value={repository.currentlyUsedVersion || ""}
                onValueChange={(value) => updateCurrentVersion(value === "none" ? null : value)}
                disabled={isUpdating}
              >
                <SelectTrigger id="version-select" className="w-full h-7 text-xs">
                  <SelectValue placeholder="Select version..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">Not using</SelectItem>
                  {releases.map((release) => (
                    <SelectItem key={release.tagName} value={release.tagName} className="text-xs">
                      <div className="flex items-center gap-2">
                        {release.tagName}
                        {release.isPrerelease && (
                          <Badge variant="outline" className="text-xs">
                            Pre
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Releases List - Takes remaining space */}
        {releases.length > 0 && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h4 className="text-sm font-medium">
                Releases ({displayedReleases.length}
                {(() => {
                  const totalHidden = newerVersions.length + olderVersions.length
                  if (showMoreStage === 0 && totalHidden > 0) {
                    return <span className="text-muted-foreground"> + {totalHidden} more</span>
                  } else if (showMoreStage === 1 && olderVersions.length > 0) {
                    return <span className="text-muted-foreground"> + {olderVersions.length} older</span>
                  }
                  return null
                })()}
                )
              </h4>
              {(() => {
                if (showMoreStage === 0 && newerVersions.length > 0) {
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMoreStage(1)}
                      className="text-xs h-6 px-2"
                    >
                      Show Newer ({newerVersions.length})
                    </Button>
                  )
                } else if (showMoreStage === 1 && olderVersions.length > 0) {
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMoreStage(2)}
                      className="text-xs h-6 px-2"
                    >
                      Show Older ({olderVersions.length})
                    </Button>
                  )
                } else if (showMoreStage > 0) {
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMoreStage(0)}
                      className="text-xs h-6 px-2"
                    >
                      Show Less
                    </Button>
                  )
                }
                return null
              })()}
            </div>

            <div
              className="flex-1 overflow-y-auto space-y-3 pr-1 border border-gray-200 dark:border-gray-700 rounded-md p-2"
              style={{
                minHeight: '200px',
                scrollbarWidth: 'auto' as const,
                scrollBehavior: 'smooth' as const
              }}
            >
                {displayedReleases.map((release) => (
                  <div key={release.tagName} className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-base">{release.tagName}</span>
                        {release.isPrerelease && (
                          <Badge variant="outline" className="text-xs">
                            Pre
                          </Badge>
                        )}
                        {release.tagName === repository.currentlyUsedVersion && (
                          <Badge variant="default" className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700">
                            <Check className="h-3 w-3 mr-1" />
                            Current
                          </Badge>
                        )}
                        {(() => {
                          // Find latest stable release (not pre-release AND not draft) - matches backend logic
                          const latestStable = releases.find(r => !r.isPrerelease && !r.isDraft)
                          return latestStable && release.tagName === latestStable.tagName && release.tagName !== repository.currentlyUsedVersion && (
                            <Badge variant="default" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700">
                              <Star className="h-3 w-3 mr-1" />
                              Latest
                            </Badge>
                          )
                        })()}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(release.publishedAt).toLocaleDateString()}
                      </div>
                    </div>

                    {release.name && release.name !== release.tagName && (
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{release.name}</h3>
                    )}

                    {release.body && (
                      <div className="space-y-2">
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-2"
                            onClick={() => setExpandedNotes((prev) => ({ ...prev, [release.tagName]: !prev[release.tagName] }))}
                          >
                            {expandedNotes[release.tagName] ? "Hide notes" : "Show notes"}
                          </Button>
                        </div>
                        {expandedNotes[release.tagName] && (
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[
                                rehypeRaw,
                                [rehypeSanitize, {
                                  ...defaultSchema,
                                  tagNames: [
                                    ...(defaultSchema.tagNames || []),
                                    'img', 'a', 'hr', 'div', 'span', 'center', 'br', 'sup', 'sub'
                                  ],
                                  attributes: {
                                    ...defaultSchema.attributes,
                                    img: ['src', 'alt', 'title', 'width', 'height', 'align'],
                                    a: ['href', 'title', 'target', 'rel'],
                                    div: ['align', 'style'],
                                    span: ['style'],
                                    '*': ['className']
                                  }
                                }]
                              ]}
                              components={{
                                h1: ({ children, ...props }) => (
                                  <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1" {...props}>
                                    {children}
                                  </h1>
                                ),
                                h2: ({ children, ...props }) => (
                                  <h2 className="text-lg font-semibold mb-2 mt-3 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1" {...props}>
                                    {children}
                                  </h2>
                                ),
                                h3: ({ children, ...props }) => (
                                  <h3 className="text-base font-semibold mb-2 mt-3 text-gray-900 dark:text-gray-100" {...props}>
                                    {children}
                                  </h3>
                                ),
                                p: ({ children, ...props }) => (
                                  <p className="mb-2 text-sm text-gray-800 dark:text-gray-200 leading-relaxed" {...props}>
                                    {children}
                                  </p>
                                ),
                                a: ({ href, children, ...props }) => {
                                  const isExternal = href && (href.startsWith('http') || href.startsWith('https'))
                                  return (
                                    <a
                                      href={href}
                                      target={isExternal ? "_blank" : "_self"}
                                      rel={isExternal ? "noopener noreferrer" : undefined}
                                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline decoration-1 underline-offset-2 hover:decoration-2 transition-all"
                                      {...props}
                                    >
                                      {children}
                                    </a>
                                  )
                                },
                                code: ({ children, className, ...props }) => {
                                  const isInline = !className
                                  return isInline ? (
                                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono text-gray-900 dark:text-gray-100" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <code className="text-xs font-mono text-gray-900 dark:text-gray-100" {...props}>
                                      {children}
                                    </code>
                                  )
                                },
                                ul: ({ children, ...props }) => (
                                  <ul className="mb-2 ml-4 list-disc space-y-1 text-sm" {...props}>
                                    {children}
                                  </ul>
                                ),
                                li: ({ children, ...props }) => (
                                  <li className="text-gray-800 dark:text-gray-200" {...props}>
                                    {children}
                                  </li>
                                ),
                                strong: ({ children, ...props }) => (
                                  <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props}>
                                    {children}
                                  </strong>
                                ),
                              }}
                            >
                              {release.body}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" asChild>
                        <a
                          href={`https://github.com/${repository.owner}/${repository.name}/releases/tag/${release.tagName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Release
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
        )}

        {releases.length === 0 && !isLoading && !error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No releases found for this repository</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading releases...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
