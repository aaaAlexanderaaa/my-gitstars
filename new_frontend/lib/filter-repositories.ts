/**
 * Filtering and sorting for the repository list.
 *
 * Extracted from app/dashboard/page.tsx so it can be tested directly — inside the
 * component it was a closure over ten pieces of state and unreachable from a test.
 */
import { evaluateFilterNode, type FilterNode } from '@/lib/filter-expression'
import { repositoryTagSet, type Repository, type SortField, type SortOrder } from '@/lib/types'

export type QuickFilter = 'updates' | 'untagged' | 'archived' | 'forks' | 'unfollowed'

export interface FilterCriteria {
  searchQuery?: string
  selectedTags?: string[]
  advancedFilters?: Array<{ node: FilterNode }>
  quickFilters?: QuickFilter[]
  sortBy?: SortField
  sortOrder?: SortOrder
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function matchesCriteria(repo: Repository, criteria: FilterCriteria): boolean {
  const quickFilters = criteria.quickFilters ?? []
  const wantsUnfollowed = quickFilters.includes('unfollowed')

  // Un-starred repos are retained so their tags and notes survive, but they stay
  // hidden unless explicitly asked for.
  if (wantsUnfollowed ? repo.isFollowed : !repo.isFollowed) return false

  if (quickFilters.includes('updates') && !repo.updateAvailable) return false
  if (quickFilters.includes('untagged') && repo.customTags.length > 0) return false
  if (quickFilters.includes('archived') && !repo.archived) return false
  if (quickFilters.includes('forks') && !repo.fork) return false

  const query = (criteria.searchQuery ?? '').trim().toLowerCase()
  if (query) {
    const haystack = `${repo.fullName} ${repo.description ?? ''} ${repo.notes ?? ''}`.toLowerCase()
    if (!haystack.includes(query)) return false
  }

  const selected = criteria.selectedTags ?? []
  const advanced = criteria.advancedFilters ?? []
  if (selected.length > 0 || advanced.length > 0) {
    const tags = repositoryTagSet(repo)
    // Selected tags are ANDed together.
    for (const tag of selected) {
      if (!tags.has(tag.toLowerCase())) return false
    }
    for (const filter of advanced) {
      if (!evaluateFilterNode(filter.node, tags)) return false
    }
  }

  return true
}

export function compareRepositories(
  a: Repository,
  b: Repository,
  sortBy: SortField = 'starredAt',
  sortOrder: SortOrder = 'desc',
): number {
  let result: number
  switch (sortBy) {
    case 'stargazersCount':
      result = a.stargazersCount - b.stargazersCount
      break
    case 'forksCount':
      result = a.forksCount - b.forksCount
      break
    case 'pushedAt':
      result = timestamp(a.pushedAt) - timestamp(b.pushedAt)
      break
    case 'name':
      result = a.fullName.localeCompare(b.fullName)
      break
    case 'starredAt':
    default:
      result = timestamp(a.starredAt) - timestamp(b.starredAt)
      break
  }
  // Tie-break on id so the order is stable across renders.
  return (result || a.id - b.id) * (sortOrder === 'asc' ? 1 : -1)
}

export function filterRepositories(
  repositories: Repository[],
  criteria: FilterCriteria,
): Repository[] {
  return repositories
    .filter((repo) => matchesCriteria(repo, criteria))
    .sort((a, b) => compareRepositories(a, b, criteria.sortBy, criteria.sortOrder))
}
