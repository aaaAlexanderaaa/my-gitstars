const { Octokit } = require('@octokit/rest');

// Configuration for API requests
const API_TIMEOUT_MS = 30000; // 30 seconds (increased from 5s)
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds between retries
const PAGE_DELAY_MS = 500; // 500ms delay between paginated requests
const RATE_LIMIT_BUFFER = 100; // Stop when remaining requests fall below this

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class GitHubService {
  constructor(accessToken) {
    this.octokit = new Octokit({
      auth: accessToken,
      baseUrl: 'https://api.github.com',
      request: {
        timeout: API_TIMEOUT_MS
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

        // Don't retry on auth errors or not found
        if (status === 401 || status === 403 || status === 404) {
          throw error;
        }

        // Retry on timeout (504), server errors (5xx), or network errors
        const isRetryable = status === 504 || status >= 500 || !status;

        if (isRetryable && attempt < RETRY_ATTEMPTS) {
          const waitTime = RETRY_DELAY_MS * attempt; // Exponential backoff
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
    let page = 1;

    while (true) {
      const response = await this.withRetry(
        () => this.octokit.activity.listReposStarredByAuthenticatedUser({
          per_page: 100,
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

      stars.push(...mappedRepos);
      page++;

      // Add delay between pages to avoid hitting secondary rate limits
      if (response.data.length === 100) {
        await delay(PAGE_DELAY_MS);
      }
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