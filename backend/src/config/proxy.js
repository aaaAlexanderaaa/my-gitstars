const { HttpsProxyAgent } = require('https-proxy-agent');

let cachedAgent = undefined;

/**
 * Returns the configured outbound proxy URL (HTTPS_PROXY preferred over HTTP_PROXY).
 * @returns {string|null}
 */
function getProxyUrl() {
  return process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy || null;
}

/**
 * Lazily builds (and caches) a shared HttpsProxyAgent so all outbound
 * GitHub/HTTPS requests tunnel through the configured proxy.
 *
 * Returns null when no proxy is configured, so callers can pass the value
 * straight into axios/agent options without extra branching downstream.
 *
 * The cache is keyed by proxy URL so a change to HTTPS_PROXY at runtime is
 * picked up on the next call (the previous agent is discarded). Note this
 * only matters when callers invoke this function per-request; module-load
 * callers capture the result once at boot.
 *
 * @returns {HttpsProxyAgent|null}
 */
function getProxyConfig() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return null;

  if (!cachedAgent || cachedAgent.proxyUrl !== proxyUrl) {
    cachedAgent = new HttpsProxyAgent(proxyUrl);
    cachedAgent.proxyUrl = proxyUrl;
  }
  return cachedAgent;
}

module.exports = { getProxyConfig, getProxyUrl };
