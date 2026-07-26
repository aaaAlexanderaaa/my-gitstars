const { Octokit } = require('@octokit/rest');
const { getProxyConfig } = require('../config/proxy');

// Configuration for API requests
const API_TIMEOUT_MS = 30000; // 30 seconds (increased from 5s)
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds between retries
const PAGE_DELAY_MS = 500; // 500ms delay between paginated requests
const RATE_LIMIT_BUFFER = 100; // Stop when remaining requests fall below this
const MAX_RETRY_WAIT_MS = 60000; // Cap on an honoured Retry-After
const MAX_STAR_PAGES = 200; // 20k stars; a guard against an endless pagination loop
const PER_PAGE = 100;

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GitHub answers a secondary ("abuse detection") rate limit with 403 and a message,
 * which is retryable - unlike a 403 for missing permissions, which is not.
 */
function isSecondaryRateLimit(error) {
  const status = error.status || error.response?.status;
  if (status !== 403) return false;
  const message = String(error.message || '').toLowerCase();
  if (message.includes('rate limit') || message.includes('abuse') || message.includes('secondary')) return true;
  return error.response?.headers?.['x-ratelimit-remaining'] === '0';
}

// Shared outbound proxy agent (null when no proxy is configured).
const proxyAgent = getProxyConfig();

/**
 * @octokit/request 6.x resolves its fetch as
 *   requestOptions.request.fetch || globalThis.fetch || node-fetch
 * so on Node 18+ it uses undici, which ignores the `agent` option entirely (undici
 * wants a `dispatcher`). The `timeout` option is not implemented by that version at
 * all. The result was that HTTP_PROXY silently did nothing for the star sync and
 * release fetches - only the axios calls in routes/repos.js honoured it - and no
 * request ever timed out.
 *
 * This wrapper restores both: node-fetch (which does support `agent`) whenever a
 * proxy is configured, and an AbortSignal-based timeout in every case.
 */
function buildFetch() {
  const nodeFetch = proxyAgent ? require('node-fetch') : null;

  return function timedFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const impl = nodeFetch || globalThis.fetch;
    const requestOptions = {
      ...options,
      signal: options.signal || controller.signal,
      ...(proxyAgent ? { agent: proxyAgent } : {})
    };

    return impl(url, requestOptions).finally(() => clearTimeout(timer));
  };
}

const octokitFetch = buildFetch();

class GitHubService {
  constructor(accessToken) {
    this.octokit = new Octokit({
      auth: accessToken,
      baseUrl: 'https://api.github.com',
      request: {
        fetch: octokitFetch
      }
    });
    this.rateLimitRemaining = null;
    this.rateLimitReset = null;
  }

  // Update rate limit info from response headers
  updateRateLimitInfo(response) {
    if (response.headers) {
      const remaining = response.headers['x-ratelimit-remaining'];
      const reset = response.headers['x-ratelimit-reset'];
      if (remaining !== undefined) {
        this.rateLimitRemaining = parseInt(remaining, 10);
      }
      if (reset !== undefined) {
        this.rateLimitReset = parseInt(reset, 10) * 1000; // Convert to ms
      }
    }
  }

  // Check if we should pause due to rate limiting
  async checkRateLimit() {
    if (this.rateLimitRemaining !== null && this.rateLimitRemaining < RATE_LIMIT_BUFFER) {
      const now = Date.now();
      if (this.rateLimitReset && this.rateLimitReset > now) {
        const waitTime = Math.min(this.rateLimitReset - now + 1000, 60000); // Max 60s wait
        console.log(`[github-api] Rate limit low (${this.rateLimitRemaining} remaining), waiting ${Math.round(waitTime / 1000)}s`);
        await delay(waitTime);
      }
    }
  }

  // Retry wrapper for API calls
  async withRetry(operation, context = 'API call') {
    let lastError;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await this.checkRateLimit();
        const response = await operation();
        this.updateRateLimitInfo(response);
        return response;
      } catch (error) {
        lastError = error;
        const status = error.status || error.response?.status;
        // Rate-limit headers also come back on failures; record them so the next
        // request waits instead of hammering a limit we already know we hit.
        this.updateRateLimitInfo(error.response || {});

        const secondaryRateLimit = isSecondaryRateLimit(error);

        // Don't retry on auth errors or not found. A 403 is only worth retrying when
        // GitHub says it is an abuse/secondary rate limit rather than a permission
        // problem, and 429 is always a rate limit.
        if (status === 401 || status === 404 || (status === 403 && !secondaryRateLimit)) {
          throw error;
        }

        // Retry on rate limits, server errors, timeouts and network failures.
        const isRetryable = status === 429 || secondaryRateLimit || status === 504 || status >= 500 || !status;

        if (isRetryable && attempt < RETRY_ATTEMPTS) {
          // Honour Retry-After when GitHub supplies it; otherwise back off linearly.
          const retryAfter = Number(error.response?.headers?.['retry-after']);
          const waitTime = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, MAX_RETRY_WAIT_MS)
            : RETRY_DELAY_MS * attempt;
          console.log(`[github-api] ${context} failed (attempt ${attempt}/${RETRY_ATTEMPTS}, status=${status}), retrying in ${waitTime}ms...`);
          await delay(waitTime);
        } else if (!isRetryable) {
          throw error;
        }
      }
    }
    console.error(`[github-api] ${context} failed after ${RETRY_ATTEMPTS} attempts`);
    throw lastError;
  }

  async getAllStarredRepos() {
    const stars = [];
    const seenIds = new Set();
    let page = 1;

    while (page <= MAX_STAR_PAGES) {
      const response = await this.withRetry(
        () => this.octokit.activity.listReposStarredByAuthenticatedUser({
          per_page: PER_PAGE,
          page: page,
          headers: {
            Accept: 'application/vnd.github.v3.star+json'
          }
        }),
        `fetch starred repos page ${page}`
      );

      if (response.data.length === 0) break;

      const mappedRepos = response.data.map(item => ({
        githubId: item.repo.id.toString(),
        name: item.repo.name,
        fullName: item.repo.full_name,
        description: item.repo.description,
        url: item.repo.html_url,
        language: item.repo.language,
        owner: item.repo.owner.login,
        topics: item.repo.topics || [],
        fork: item.repo.fork,
        forksCount: item.repo.forks_count,
        stargazersCount: item.repo.stargazers_count,
        watchersCount: item.repo.watchers_count,
        defaultBranch: item.repo.default_branch,
        isTemplate: item.repo.is_template,
        archived: item.repo.archived,
        visibility: item.repo.visibility,
        pushedAt: item.repo.pushed_at ? new Date(item.repo.pushed_at) : null,
        githubCreatedAt: item.repo.created_at ? new Date(item.repo.created_at) : null,
        githubUpdatedAt: item.repo.updated_at ? new Date(item.repo.updated_at) : null,
        starredAt: item.starred_at ? new Date(item.starred_at) : null
      }));

      // A page that repeats what we already have means pagination is not advancing;
      // stop rather than loop forever. It also guarantees the upsert loop downstream
      // never sees the same githubId twice within one transaction.
      let added = 0;
      for (const repo of mappedRepos) {
        if (seenIds.has(repo.githubId)) continue;
        seenIds.add(repo.githubId);
        stars.push(repo);
        added++;
      }
      if (added === 0) break;

      // The last page is short; only pause when a full page suggests more to come.
      if (response.data.length < PER_PAGE) break;

      page++;
      // Add delay between pages to avoid hitting secondary rate limits
      await delay(PAGE_DELAY_MS);
    }

    if (page > MAX_STAR_PAGES) {
      console.warn(`[github-api] stopped paginating starred repos at ${MAX_STAR_PAGES} pages (${stars.length} repos)`);
    }

    return stars;
  }

  async getUserProfile() {
    const response = await this.withRetry(
      () => this.octokit.users.getAuthenticated(),
      'fetch user profile'
    );
    return response.data;
  }

  async getRepositoryReleases(owner, repo, perPage = 30) {
    try {
      const response = await this.withRetry(
        () => this.octokit.repos.listReleases({
          owner,
          repo,
          per_page: perPage,
          page: 1
        }),
        `fetch releases for ${owner}/${repo}`
      );

      return response.data.map(release => ({
        githubReleaseId: release.id.toString(),
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        publishedAt: release.published_at ? new Date(release.published_at) : null,
        isPrerelease: release.prerelease,
        isDraft: release.draft
      }));
    } catch (error) {
      // If repo has no releases or releases are not accessible, return empty array
      if (error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async getLatestRelease(owner, repo) {
    try {
      const response = await this.withRetry(
        () => this.octokit.repos.getLatestRelease({
          owner,
          repo
        }),
        `fetch latest release for ${owner}/${repo}`
      );

      return {
        githubReleaseId: response.data.id.toString(),
        tagName: response.data.tag_name,
        name: response.data.name,
        body: response.data.body,
        publishedAt: response.data.published_at ? new Date(response.data.published_at) : null,
        isPrerelease: response.data.prerelease,
        isDraft: response.data.draft
      };
    } catch (error) {
      // If no releases exist, return null
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}

module.exports = GitHubService; 