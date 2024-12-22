const setupProxy = (app) => {
  if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
    app.set('trust proxy', true);
  }
};

module.exports = { setupProxy }; 