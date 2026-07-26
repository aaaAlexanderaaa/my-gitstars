const express = require('express');
const fs = require('fs');
const path = require('path');
const authRouter = require('../routes/auth');
const syncRouter = require('../routes/sync');
const reposRouter = require('../routes/repos');
const releasesRouter = require('../routes/releases');
const { sequelize } = require('../models');

/**
 * Where the exported Next.js build lives. The Docker image copies `new_frontend/out`
 * to `frontend/build`; running the built app straight from a checkout works too.
 */
function resolveFrontendDir() {
  const candidates = [
    process.env.FRONTEND_DIR,
    path.resolve(__dirname, '../../../frontend/build'),
    path.resolve(__dirname, '../../../new_frontend/out')
  ].filter(Boolean);

  return candidates.find(dir => fs.existsSync(path.join(dir, 'index.html'))) || candidates[1];
}

const FRONTEND_DIR = resolveFrontendDir();
const INDEX_HTML = path.join(FRONTEND_DIR, 'index.html');
const NOT_FOUND_HTML = path.join(FRONTEND_DIR, '404.html');

function configureRoutes(app) {
  app.get('/api/health', async (req, res) => {
    let database = 'ok';
    try {
      await sequelize.authenticate();
    } catch (error) {
      database = 'unavailable';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      frontend: fs.existsSync(INDEX_HTML) ? 'ok' : 'missing',
      uptime: Math.round(process.uptime())
    });
  });

  // API routes
  app.use('/auth', authRouter);
  app.use('/api', syncRouter);
  app.use('/api', reposRouter);
  app.use('/api/releases', releasesRouter);

  // Anything left under /api or /auth is a real 404. It must not fall through to the
  // SPA fallback, which used to answer unknown API calls with 200 + index.html.
  app.use(['/api', '/auth'], (req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
  });

  // Static assets from the exported Next.js build. `redirect: true` (the default)
  // turns /dashboard into /dashboard/, which resolves to dashboard/index.html.
  app.use(express.static(FRONTEND_DIR, {
    setHeaders: (res, filePath) => {
      // Hashed asset bundles can be cached hard; HTML must not be.
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}_next${path.sep}static${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  // Every real page is pre-rendered by `next build`, so anything reaching this point
  // is genuinely missing and must not be answered with 200 + the landing page.
  app.get('*', (req, res, next) => {
    if (!fs.existsSync(INDEX_HTML)) {
      return res.status(503).json({
        error: 'Frontend build not found',
        details: `Expected ${INDEX_HTML}. Run "npm run build" in new_frontend/, or use the Docker image.`
      });
    }
    const page = fs.existsSync(NOT_FOUND_HTML) ? NOT_FOUND_HTML : INDEX_HTML;
    res.status(404).sendFile(page, err => (err ? next(err) : undefined));
  });

  // Registered after every route so it can actually catch their errors.
  app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (res.headersSent) return next(err);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({
      error: status === 500 ? 'Internal Server Error' : err.message || 'Request failed',
      ...(process.env.NODE_ENV !== 'production' && { details: err.message })
    });
  });
}

module.exports = { configureRoutes };
