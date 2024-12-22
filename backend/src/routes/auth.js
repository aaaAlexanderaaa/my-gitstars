const express = require('express');
const passport = require('passport');
const { ensureAuth } = require('../middleware/auth');

const router = express.Router();

// GitHub OAuth routes
router.get('/github', (req, res, next) => {
  console.log('Starting GitHub OAuth flow...');
  next();
}, passport.authenticate('github', { 
  scope: ['read:user', 'user:email', 'repo']
}));

router.get('/github/callback',
  (req, res, next) => {
    console.log('Received callback from GitHub');
    console.log('Query params:', req.query);
    next();
  },
  passport.authenticate('github', { 
    failureRedirect: '/',
    failureMessage: true,
    failWithError: true
  }),
  (req, res) => {
    console.log('Authentication successful, redirecting to dashboard');
    res.redirect('/dashboard');
  }
);

// Get current user
router.get('/user', ensureAuth, (req, res) => {
  res.json(req.user);
});

// Logout
router.post('/logout', (req, res) => {
  req.logout();
  res.sendStatus(200);
});

module.exports = router; 