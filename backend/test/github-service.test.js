/**
 * Retry classification and star pagination.
 *
 * No network and no database: the octokit call is replaced with a stub, so these tests
 * describe exactly which HTTP statuses are worth retrying and when pagination stops.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const GitHubService = require('../src/services/githubService');

/** Builds an error shaped like the ones @octokit/request throws. */
function httpError(status, message = 'boom', headers = {}) {
  const error = new Error(message);
  error.status = status;
  error.response = { status, headers };
  return error;
}

/** A service whose sleeps are captured instead of awaited, so tests run instantly. */
function fastService() {
  const service = new GitHubService('token');
  const waits = [];
  // withRetry and the pager both delay via setTimeout; short-circuit the clock.
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => {
    waits.push(ms);
    return realSetTimeout(fn, 0);
  };
  service.restore = () => { global.setTimeout = realSetTimeout; };
  service.waits = waits;
  return service;
}

test('withRetry does not retry a 401', async () => {
  const service = fastService();
  try {
    let calls = 0;
    await assert.rejects(
      () => service.withRetry(async () => { calls++; throw httpError(401, 'Bad credentials'); }),
      /Bad credentials/
    );
    assert.equal(calls, 1, 'a revoked token must fail immediately, not three times');
  } finally {
    service.restore();
  }
});

test('withRetry does not retry a 404', async () => {
  const service = fastService();
  try {
    let calls = 0;
    await assert.rejects(() => service.withRetry(async () => { calls++; throw httpError(404); }));
    assert.equal(calls, 1);
  } finally {
    service.restore();
  }
});

test('withRetry does not retry a permission 403', async () => {
  const service = fastService();
  try {
    let calls = 0;
    await assert.rejects(
      () => service.withRetry(async () => { calls++; throw httpError(403, 'Resource not accessible'); })
    );
    assert.equal(calls, 1, 'a permissions 403 is not going to succeed on retry');
  } finally {
    service.restore();
  }
});

test('withRetry DOES retry a secondary rate-limit 403', async () => {
  const service = fastService();
  try {
    let calls = 0;
    await assert.rejects(
      () => service.withRetry(async () => {
        calls++;
        throw httpError(403, 'You have exceeded a secondary rate limit');
      })
    );
    assert.equal(calls, 3, 'a secondary rate limit should be retried');
  } finally {
    service.restore();
  }
});

test('withRetry treats a 403 with x-ratelimit-remaining: 0 as retryable', async () => {
  const service = fastService();
  try {
    let calls = 0;
    await assert.rejects(
      () => service.withRetry(async () => {
        calls++;
        throw httpError(403, 'Forbidden', { 'x-ratelimit-remaining': '0' });
      })
    );
    assert.equal(calls, 3);
  } finally {
    service.restore();
  }
});

test('withRetry retries a 429 and honours Retry-After', async () => {
  const service = fastService();
  try {
    let calls = 0;
    const result = await service.withRetry(async () => {
      calls++;
      if (calls < 2) throw httpError(429, 'Too many requests', { 'retry-after': '5' });
      return { data: 'ok', headers: {} };
    });
    assert.equal(result.data, 'ok');
    assert.equal(calls, 2);
    assert.ok(service.waits.includes(5000), `expected a 5000ms wait, got ${JSON.stringify(service.waits)}`);
  } finally {
    service.restore();
  }
});

test('withRetry caps a hostile Retry-After', async () => {
  const service = fastService();
  try {
    let calls = 0;
    await service.withRetry(async () => {
      calls++;
      if (calls < 2) throw httpError(429, 'slow down', { 'retry-after': '99999' });
      return { data: 'ok', headers: {} };
    });
    assert.ok(
      service.waits.every(ms => ms <= 60000),
      `Retry-After must be capped; waits were ${JSON.stringify(service.waits)}`
    );
  } finally {
    service.restore();
  }
});

test('withRetry retries 5xx and network errors, then rethrows the last one', async () => {
  for (const error of [httpError(500), httpError(504), Object.assign(new Error('ECONNRESET'), {})]) {
    const service = fastService();
    try {
      let calls = 0;
      await assert.rejects(() => service.withRetry(async () => { calls++; throw error; }));
      assert.equal(calls, 3, `expected 3 attempts for ${error.status || 'network error'}`);
    } finally {
      service.restore();
    }
  }
});

test('withRetry returns the first successful response', async () => {
  const service = fastService();
  try {
    let calls = 0;
    const result = await service.withRetry(async () => {
      calls++;
      return { data: [1, 2], headers: { 'x-ratelimit-remaining': '4321' } };
    });
    assert.deepEqual(result.data, [1, 2]);
    assert.equal(calls, 1);
    assert.equal(service.rateLimitRemaining, 4321, 'rate limit headers should be recorded');
  } finally {
    service.restore();
  }
});

test('withRetry records rate-limit headers from a FAILED response', async () => {
  const service = fastService();
  try {
    await assert.rejects(() => service.withRetry(async () => {
      throw httpError(403, 'Resource not accessible', { 'x-ratelimit-remaining': '7' });
    }));
    assert.equal(service.rateLimitRemaining, 7,
      'headers on an error response must still update the budget');
  } finally {
    service.restore();
  }
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Replaces the octokit pager with pages built from the given id ranges. */
function stubStarPages(service, pages) {
  let index = 0;
  service.octokit = {
    activity: {
      listReposStarredByAuthenticatedUser: async () => {
        const page = pages[index] || [];
        index++;
        return { data: page, headers: {} };
      }
    }
  };
  return () => index;
}

const starItem = (id) => ({
  starred_at: '2024-01-01T00:00:00Z',
  repo: {
    id,
    name: `r${id}`,
    full_name: `owner/r${id}`,
    description: null,
    html_url: `https://github.com/owner/r${id}`,
    language: null,
    owner: { login: 'owner' },
    topics: [],
    fork: false,
    forks_count: 0,
    stargazers_count: 0,
    watchers_count: 0,
    default_branch: 'main',
    is_template: false,
    archived: false,
    visibility: 'public',
    pushed_at: null,
    created_at: null,
    updated_at: null
  }
});

const fullPage = (start) => Array.from({ length: 100 }, (_, i) => starItem(start + i));

test('pagination stops on a short page without requesting another', async () => {
  const service = fastService();
  try {
    const calls = stubStarPages(service, [fullPage(1), [starItem(999)]]);
    const stars = await service.getAllStarredRepos();
    assert.equal(stars.length, 101);
    assert.equal(calls(), 2, 'a page shorter than 100 means there is nothing more to fetch');
  } finally {
    service.restore();
  }
});

test('pagination stops on an empty page', async () => {
  const service = fastService();
  try {
    const calls = stubStarPages(service, [fullPage(1), []]);
    const stars = await service.getAllStarredRepos();
    assert.equal(stars.length, 100);
    assert.equal(calls(), 2);
  } finally {
    service.restore();
  }
});

test('pagination does not loop forever when the API keeps returning the same page', async () => {
  const service = fastService();
  try {
    // A broken/proxied API that ignores `page` would previously spin until the
    // 200-page cap, duplicating ids into the upsert loop.
    const repeated = fullPage(1);
    service.octokit = {
      activity: {
        listReposStarredByAuthenticatedUser: async () => ({ data: repeated, headers: {} })
      }
    };
    const stars = await service.getAllStarredRepos();
    assert.equal(stars.length, 100, 'a non-advancing pager must stop, not accumulate duplicates');
    const ids = new Set(stars.map(s => s.githubId));
    assert.equal(ids.size, stars.length, 'duplicate githubIds would break the batch upsert');
  } finally {
    service.restore();
  }
});

test('pagination maps GitHub fields onto the model shape', async () => {
  const service = fastService();
  try {
    stubStarPages(service, [[starItem(4242)]]);
    const [star] = await service.getAllStarredRepos();
    assert.equal(star.githubId, '4242', 'githubId must be a string to match the column type');
    assert.equal(star.fullName, 'owner/r4242');
    assert.equal(star.defaultBranch, 'main');
    assert.ok(star.starredAt instanceof Date);
    assert.equal(star.pushedAt, null, 'a null upstream timestamp must stay null');
  } finally {
    service.restore();
  }
});

test('an auth failure during pagination propagates instead of returning a partial list', async () => {
  const service = fastService();
  try {
    let page = 0;
    service.octokit = {
      activity: {
        listReposStarredByAuthenticatedUser: async () => {
          page++;
          if (page === 1) return { data: fullPage(1), headers: {} };
          throw httpError(401, 'Bad credentials');
        }
      }
    };
    // A partial list would make the unfollow sweep mark real stars as un-starred.
    await assert.rejects(() => service.getAllStarredRepos(), /Bad credentials/);
  } finally {
    service.restore();
  }
});
