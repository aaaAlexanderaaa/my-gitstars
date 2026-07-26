const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const { sequelize } = require('../models');

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Origins allowed to make credentialed cross-origin requests.
 *
 * The previous `origin: true` reflected whatever Origin the browser sent while also
 * sending `Access-Control-Allow-Credentials: true`, which let any website read a
 * logged-in user's repositories through their browser. In the packaged app the
 * frontend is served from the same origin, so this list is normally just APP_URL.
 */
function resolveAllowedOrigins() {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured.map(origin => origin.replace(/\/$/, ''));

  const origins = new Set();
  if (process.env.APP_URL) origins.add(process.env.APP_URL.replace(/\/$/, ''));
  if (process.env.NODE_ENV !== 'production') {
    // `next dev` proxies /api and /auth, but keep direct access working too.
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  return Array.from(origins);
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

function configureMiddleware(app) {
  const allowedOrigins = resolveAllowedOrigins();

  app.use(securityHeaders);

  app.use(cors({
    origin: (origin, callback) => {
      // Same-origin and non-browser requests send no Origin header.
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.includes(origin.replace(/\/$/, '')));
    },
    credentials: true
  }));

  // Generous enough for a full /api/import payload from a large account.
  app.use(express.json({ limit: '4mb' }));

  // Persist sessions in Postgres. connect-session-sequelize was already a declared
  // dependency but was never wired up, so express-session fell back to its in-memory
  // store: every restart logged everyone out, and it leaks memory under load.
  const sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: 'Sessions',
    expiration: SESSION_MAX_AGE_MS,
    checkExpirationInterval: 15 * 60 * 1000
  });

  // `secure` cookies require HTTPS; allow deployments that terminate TLS elsewhere
  // (or run plain HTTP on a LAN) to opt out instead of silently failing to log in.
  const secureCookie = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production' && (process.env.APP_URL || '').startsWith('https://');

  app.use(session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'gitstars.sid',
    cookie: {
      secure: secureCookie,
      httpOnly: true,
      // Lax still sends the cookie on the top-level GitHub OAuth redirect back to us,
      // while blocking it on cross-site POSTs, which is our CSRF defence.
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS
    },
    proxy: true
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  return { sessionStore, allowedOrigins };
}

module.exports = { configureMiddleware };
