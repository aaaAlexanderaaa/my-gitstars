const { loadEnv, requireEnv } = require('./config/env');
loadEnv();
const express = require('express');
const passport = require('passport');
const { sequelize } = require('./models');
const { configurePassport } = require('./config/passport');
const { configureMiddleware } = require('./config/middleware');
const { configureRoutes } = require('./config/routes');
const { startSchedulers } = require('./services/schedulerService');

const app = express();
const port = process.env.PORT || 4000;

requireEnv(['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET']);

// APP_URL defaults to the local server so existing deployments without it keep working,
// but a wrong value is baked into the OAuth callback URL, the CORS allow-list and the
// cookie `secure` decision - so make the effective value visible at boot instead of
// letting every login fail with an opaque GitHub error.
if (!process.env.APP_URL) {
  process.env.APP_URL = `http://localhost:${port}`;
  console.warn(`APP_URL is not set; defaulting to ${process.env.APP_URL}. GitHub OAuth will only work locally.`);
}
// A trailing slash produces "https://host//auth/github/callback", which GitHub treats
// as a different (unregistered) redirect URI.
process.env.APP_URL = process.env.APP_URL.trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/i.test(process.env.APP_URL)) {
  throw new Error(`APP_URL must be an absolute http(s) origin with no path, got "${process.env.APP_URL}"`);
}
console.log(`OAuth callback URL: ${process.env.APP_URL}/auth/github/callback`);

// Trust first proxy for secure cookies
app.set('trust proxy', 1);
app.disable('x-powered-by');

const { sessionStore } = configureMiddleware(app);

configurePassport(passport);
configureRoutes(app);

// Initialize database and start server
async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established');

    // Creates the Sessions table on first boot.
    await sessionStore.sync();

    const schedulers = startSchedulers();

    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    // Graceful shutdown handling
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n${signal} received. Shutting down gracefully...`);
      schedulers.stop();
      if (typeof sessionStore.stopExpiringSessions === 'function') {
        sessionStore.stopExpiringSessions();
      }

      // Don't hang forever if a connection refuses to drain.
      const forceExit = setTimeout(() => {
        console.warn('Shutdown timed out, exiting.');
        process.exit(1);
      }, 10000);
      forceExit.unref();

      server.close(async () => {
        console.log('HTTP server closed');
        try {
          await sequelize.close();
          console.log('Database connection closed');
        } catch (err) {
          console.error('Error closing database connection:', err);
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled promise rejection:', reason);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

start();
