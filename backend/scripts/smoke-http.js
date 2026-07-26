/**
 * Smoke test: boots the real Express app with the database layer stubbed out and
 * exercises the whole HTTP surface - status codes, content types, auth guards, CORS,
 * static/SPA routing and the OAuth redirect.
 *
 * No database or GitHub credentials required, so it runs anywhere:
 *   npm test
 */
process.env.NODE_ENV = 'development';
process.env.GITHUB_CLIENT_ID = 'test-id';
process.env.GITHUB_CLIENT_SECRET = 'test-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.APP_URL = 'http://localhost:4111';
process.env.PORT = '4111';

const http = require('http');
const { sequelize } = require('../src/models');

// --- stub the database -------------------------------------------------------
sequelize.authenticate = async () => true;
const seenSql = [];
sequelize.query = async function (sql, options) {
  const text = typeof sql === 'string' ? sql : sql.query;
  seenSql.push(text);
  return [[], 0];
};

const express = require('express');
const passport = require('passport');
const { configurePassport } = require('../src/config/passport');
const { configureMiddleware } = require('../src/config/middleware');
const { configureRoutes } = require('../src/config/routes');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const { sessionStore, allowedOrigins } = configureMiddleware(app);

// The store object is already wired into express-session; swap its persistence for an
// in-memory map so the harness does not need a real Postgres. Construction, wiring and
// `sync()` (table creation) are still exercised against the stubbed dialect.
const memory = new Map();
sessionStore.get = (sid, cb) => process.nextTick(() => cb(null, memory.get(sid) || null));
sessionStore.set = (sid, data, cb) => { memory.set(sid, data); process.nextTick(() => cb(null)); };
sessionStore.touch = (sid, data, cb) => process.nextTick(() => cb(null));
sessionStore.destroy = (sid, cb) => { memory.delete(sid); process.nextTick(() => cb(null)); };

configurePassport(passport);
configureRoutes(app);

function request(method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port: 4111,
      method,
      path,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data.slice(0, 300)
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: !!condition, detail });
}

(async () => {
  await sessionStore.sync();
  const server = app.listen(4111);
  await new Promise(r => server.once('listening', r));

  console.log('allowedOrigins:', allowedOrigins);

  const health = await request('GET', '/api/health');
  check('GET /api/health -> 200 JSON', health.status === 200 && health.headers['content-type'].includes('json'), `${health.status} ${health.body}`);
  check('health reports frontend present', health.body.includes('"frontend":"ok"'), health.body);

  const user = await request('GET', '/auth/user');
  check('GET /auth/user unauthenticated -> 401 JSON', user.status === 401 && user.body.includes('Unauthorized'), `${user.status} ${user.body}`);

  const repos = await request('GET', '/api/repos');
  check('GET /api/repos unauthenticated -> 401 JSON', repos.status === 401, `${repos.status} ${repos.body}`);

  const unknownApi = await request('GET', '/api/does-not-exist');
  check('unknown /api path -> 404 JSON, not HTML', unknownApi.status === 404 && unknownApi.headers['content-type'].includes('json'), `${unknownApi.status} ${unknownApi.headers['content-type']} ${unknownApi.body}`);

  const unknownAuth = await request('GET', '/auth/nope');
  check('unknown /auth path -> 404 JSON', unknownAuth.status === 404 && unknownAuth.headers['content-type'].includes('json'), `${unknownAuth.status} ${unknownAuth.body}`);

  const root = await request('GET', '/');
  check('GET / -> 200 html', root.status === 200 && root.headers['content-type'].includes('html'), `${root.status} ${root.headers['content-type']}`);

  const dash = await request('GET', '/dashboard');
  check('GET /dashboard -> 301 redirect to /dashboard/', dash.status === 301 && dash.headers.location === '/dashboard/', `${dash.status} ${dash.headers.location}`);

  const dashSlash = await request('GET', '/dashboard/');
  check('GET /dashboard/ -> 200 html', dashSlash.status === 200 && dashSlash.headers['content-type'].includes('html'), `${dashSlash.status} ${dashSlash.headers['content-type']}`);

  const bogusPage = await request('GET', '/totally/unknown/page');
  check('unknown page -> 404 (not 200 landing page)', bogusPage.status === 404, `${bogusPage.status}`);

  const evilCors = await request('GET', '/api/health', { Origin: 'https://evil.example' });
  check('CORS: foreign origin gets no ACAO header', !evilCors.headers['access-control-allow-origin'], String(evilCors.headers['access-control-allow-origin']));

  const goodCors = await request('GET', '/api/health', { Origin: 'http://localhost:3000' });
  check('CORS: dev frontend origin allowed', goodCors.headers['access-control-allow-origin'] === 'http://localhost:3000', String(goodCors.headers['access-control-allow-origin']));

  const oauth = await request('GET', '/auth/github');
  const location = oauth.headers.location || '';
  check('GET /auth/github -> 302 to github', oauth.status === 302 && location.startsWith('https://github.com/login/oauth/authorize'), `${oauth.status} ${location.slice(0, 90)}`);
  check('OAuth redirect carries a state nonce', /[?&]state=[^&]+/.test(location), location.slice(0, 160));

  const logout = await request('POST', '/auth/logout');
  check('POST /auth/logout -> 200', logout.status === 200, `${logout.status} ${logout.body}`);

  const securityHeader = health.headers['x-content-type-options'];
  check('security headers present', securityHeader === 'nosniff', String(securityHeader));

  check('Sessions table created by store.sync()', seenSql.some(sql => /Sessions/i.test(sql)), seenSql.filter(s => /Sessions/i.test(s))[0] || 'none');

  // Every route added in this pass must exist and be guarded by authentication.
  const guarded = [
    ['GET', '/api/stats'],
    ['GET', '/api/export'],
    ['POST', '/api/import'],
    ['GET', '/api/tags/counts'],
    ['GET', '/api/custom-tags'],
    ['POST', '/api/repos/bulk-tags'],
    ['PATCH', '/api/tags/foo'],
    ['DELETE', '/api/tags/foo'],
    ['PUT', '/api/repos/1/notes'],
    ['DELETE', '/api/repos/unfollowed'],
    ['POST', '/api/repos/1/tags'],
    ['DELETE', '/api/repos/1/tags'],
    ['GET', '/api/repos/owner/name/readme'],
    ['GET', '/api/sync/status'],
    ['POST', '/api/sync'],
    ['GET', '/api/releases/repo/1']
  ];

  for (const [method, path] of guarded) {
    const res = await request(method, path, {}, method === 'GET' || method === 'DELETE' ? undefined : {});
    const ok = res.status === 401 && (res.headers['content-type'] || '').includes('json');
    check(`${method} ${path} requires auth (401 JSON, route exists)`, ok, `${res.status} ${res.headers['content-type']} ${res.body}`);
  }

  // The SPA fallback must not shadow a genuinely missing API route.
  const missing = await request('POST', '/api/not-a-route', {}, {});
  check('POST /api/not-a-route -> 404 JSON', missing.status === 404 && (missing.headers['content-type'] || '').includes('json'), `${missing.status} ${missing.body}`);

  server.close();
  await sequelize.close().catch(() => {});

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  <-- ${r.detail}`}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
  console.error('HARNESS ERROR', err);
  process.exit(1);
});
