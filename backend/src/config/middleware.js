const session = require('express-session');
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('passport');

function configureMiddleware(app) {
  // CORS configuration
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // Basic middleware
  app.use(express.json());
  
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    },
    proxy: true
  }));

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Serve static files from frontend build
  app.use(express.static(path.join(__dirname, '../../../frontend/build')));

  // Handle SPA routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../../../frontend/build/index.html'));
  });
}

module.exports = { configureMiddleware }; 