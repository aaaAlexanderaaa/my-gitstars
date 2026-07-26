const express = require('express');
const passport = require('passport');
const { ensureAuth } = require('../middleware/auth');

const router = express.Router();

// `repo` is needed to see stars on private repositories. Deployments that only care
// about public stars can narrow this to `public_repo` without a code change.
const OAUTH_SCOPE = (process.env.GITHUB_OAUTH_SCOPE || 'read:user,user:email,repo')
  .split(',')
  .map(scope => scope.trim())
  .filter(Boolean);

// The OAuth `state` nonce is configured on the strategy itself (see config/passport.js);
// it has no effect when passed here.
router.get('/github', passport.authenticate('github', { scope: OAUTH_SCOPE }));

router.get('/github/callback',
  passport.authenticate('github', {
    scope: OAUTH_SCOPE,
    failureRedirect: '/?error=auth_failed',
    failureMessage: true
  }),
  (req, res) => {
    res.redirect('/dashboard/');
  }
);

/**
 * Never serialise the whole User row: it holds the GitHub OAuth access token, and
 * this endpoint's response is readable by any script running on the page.
 */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    githubId: user.githubId,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl
  };
}

// Get current user
router.get('/user', ensureAuth, (req, res) => {
  res.json(publicUser(req.user));
});

// Logout. Clears the passport session, destroys the session record and drops the
// cookie, so the old session id cannot be replayed.
router.post('/logout', (req, res, next) => {
  const finish = () => {
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('gitstars.sid');
      res.sendStatus(200);
    });
  };

  // passport >= 0.6 requires a callback; keep working if an older one is installed.
  if (req.logout.length > 0) {
    req.logout(err => (err ? next(err) : finish()));
  } else {
    req.logout();
    finish();
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
