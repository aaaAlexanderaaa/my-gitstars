const GitHubStrategy = require('passport-github2').Strategy;
const { User } = require('../models');
const GitHubService = require('../services/githubService');

function configurePassport(passport) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.APP_URL}/auth/github/callback`,
    scope: ['read:user', 'user:email', 'repo'],
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const githubService = new GitHubService(accessToken);
      const githubProfile = await githubService.getUserProfile();

      const [user] = await User.findOrCreate({
        where: { githubId: profile.id },
        defaults: {
          username: profile.username,
          email: githubProfile.email,
          avatarUrl: githubProfile.avatar_url,
          accessToken
        }
      });

      if (user.accessToken !== accessToken) {
        user.accessToken = accessToken;
        await user.save();
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
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}

module.exports = { configurePassport }; 