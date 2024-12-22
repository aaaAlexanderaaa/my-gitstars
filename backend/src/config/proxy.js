function getProxyConfig() {
  return {
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null
  };
}

module.exports = { getProxyConfig }; 