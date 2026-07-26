const GitHubStrategy = require('passport-github2').Strategy;
const { User } = require('../models');
const GitHubService = require('../services/githubService');

const OAUTH_SCOPE = (process.env.GITHUB_OAUTH_SCOPE || 'read:user,user:email,repo')
  .split(',')
  .map(scope => scope.trim())
  .filter(Boolean);

function configurePassport(passport) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.APP_URL}/auth/github/callback`,
    scope: OAUTH_SCOPE,
    // Makes passport-oauth2 use its session-backed nonce store for the `state`
    // parameter. Without it the store is a NullStore and the callback is replayable.
    state: true
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const githubService = new GitHubService(accessToken);
      const githubProfile = await githubService.getUserProfile();

      const [user] = await User.findOrCreate({
        where: { githubId: String(profile.id) },
        defaults: {
          username: profile.username,
          email: githubProfile.email,
          avatarUrl: githubProfile.avatar_url,
          accessToken
        }
      });

      // `defaults` only apply on insert, so returning users never picked up a renamed
      // account or a new avatar - and a re-issued token was the only thing refreshed.
      const changes = {};
      if (user.accessToken !== accessToken) changes.accessToken = accessToken;
      if (profile.username && user.username !== profile.username) changes.username = profile.username;
      if (githubProfile.email && user.email !== githubProfile.email) changes.email = githubProfile.email;
      if (githubProfile.avatar_url && user.avatarUrl !== githubProfile.avatar_url) {
        changes.avatarUrl = githubProfile.avatar_url;
      }
      if (Object.keys(changes).length > 0) {
        await user.update(changes);
      }

      return done(null, user);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      return done(error);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      // A deleted user must not resolve to a live session.
      done(null, user || false);
    } catch (error) {
      done(error);
    }
  });
}

module.exports = { configurePassport };
