const { Octokit } = require('@octokit/rest');

class GitHubService {
  constructor(accessToken) {
    this.octokit = new Octokit({ 
      auth: accessToken,
      baseUrl: 'https://api.github.com',
      request: {
        timeout: 5000
      }
    });
  }

  async getAllStarredRepos() {
    const stars = [];
    let page = 1;
    
    while (true) {
      const response = await this.octokit.activity.listReposStarredByAuthenticatedUser({
        per_page: 100,
        page: page,
        headers: {
          Accept: 'application/vnd.github.v3.star+json'
        }
      });
      
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
    }
    
    return stars;
  }

  async getUserProfile() {
    const { data } = await this.octokit.users.getAuthenticated();
    return data;
  }

  async getRepositoryReleases(owner, repo, perPage = 30) {
    try {
      const { data } = await this.octokit.repos.listReleases({
        owner,
        repo,
        per_page: perPage,
        page: 1
      });

      return data.map(release => ({
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
      const { data } = await this.octokit.repos.getLatestRelease({
        owner,
        repo
      });

      return {
        githubReleaseId: data.id.toString(),
        tagName: data.tag_name,
        name: data.name,
        body: data.body,
        publishedAt: data.published_at ? new Date(data.published_at) : null,
        isPrerelease: data.prerelease,
        isDraft: data.draft
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