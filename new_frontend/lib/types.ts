/**
 * Shared shapes for the dashboard.
 *
 * page.tsx, repository-details-modal.tsx and version-tracker.tsx each declared their
 * own `Repository` interface. They had drifted apart (the modal's version was missing
 * `defaultBranch`, which is why README images were rewritten against a hard-coded
 * "main" branch), and `typescript.ignoreBuildErrors` hid the mismatch.
 */

export interface User {
  id: number
  githubId: string
  username: string
  email?: string | null
  avatarUrl: string
}

export interface Release {
  tagName: string
  name: string | null
  body: string | null
  publishedAt: string
  isPrerelease: boolean
  isDraft?: boolean
}

export interface Repository {
  id: number
  githubId: string
  name: string
  fullName: string
  description: string | null
  url: string
  customTags: string[]
  notes?: string | null
  starredAt: string
  language: string | null
  owner: string
  topics: string[]
  fork: boolean
  forksCount: number
  stargazersCount: number
  watchersCount: number
  defaultBranch: string | null
  isTemplate: boolean
  archived: boolean
  visibility: string
  pushedAt: string | null
  githubCreatedAt: string | null
  githubUpdatedAt: string | null
  isFollowed: boolean
  latestVersion: string | null
  currentlyUsedVersion: string | null
  updateAvailable: boolean
  hasReleases: boolean
  releasesLastFetched: string | null
  releasesFetchError?: string | null
  createdAt: string
  updatedAt: string
  UserId: number
  effectiveVersion: string | null
}

export interface SyncStatus {
  id: number | null
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  progress: number
  error: string | null
  startedAt: string | null
  updatedAt: string | null
  lastCompletedAt: string | null
}

export interface Stats {
  total: number
  followed: number
  unfollowed: number
  updatesAvailable: number
  archived: number
  untagged: number
  totalStars: number
}

export type SortField = 'starredAt' | 'stargazersCount' | 'name' | 'forksCount' | 'pushedAt'
export type SortOrder = 'asc' | 'desc'

/** Repos carry version tags with and without a leading "v"; never add a second one. */
export function formatVersion(version: string | null | undefined): string {
  if (!version) return ''
  return /^v\d/i.test(version) ? version : `v${version}`
}

/** Lowercased set of every value a repo can be filtered by. */
export function repositoryTagSet(repo: Repository): Set<string> {
  const tags = new Set<string>()
  for (const tag of repo.customTags || []) tags.add(tag.toLowerCase())
  for (const topic of repo.topics || []) tags.add(topic.toLowerCase())
  if (repo.language) tags.add(repo.language.toLowerCase())
  return tags
}

export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString()
}
