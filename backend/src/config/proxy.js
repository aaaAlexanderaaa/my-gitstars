const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

let cachedAgent = undefined;
let warnedAboutLoopback = false;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const HOST_GATEWAY = 'host.docker.internal';

/** True when this process is running inside a container. */
function inContainer() {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/** True when `host.docker.internal` resolves (docker-compose.yml maps it via extra_hosts). */
function hostGatewayResolvable() {
  try {
    return fs.readFileSync('/etc/hosts', 'utf8').includes(HOST_GATEWAY);
  } catch {
    return false;
  }
}

/**
 * A proxy on 127.0.0.1 is the *host's* loopback. Inside a container that address is
 * the container itself, so every GitHub request fails with ECONNREFUSED — the exact
 * symptom you get from `http_proxy=http://127.0.0.1:7890 docker compose up`, because
 * Compose forwards the variable from the calling shell.
 *
 * When the compose-provided host gateway is available we rewrite to it and say so;
 * otherwise we warn with the fix instead of failing silently.
 */
function adjustForContainer(rawUrl) {
  if (!rawUrl || !inContainer()) return rawUrl;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname) && !LOOPBACK_HOSTS.has(`[${parsed.hostname}]`)) {
    return rawUrl;
  }

  if (hostGatewayResolvable()) {
    parsed.hostname = HOST_GATEWAY;
    const rewritten = parsed.toString().replace(/\/$/, '');
    if (!warnedAboutLoopback) {
      warnedAboutLoopback = true;
      console.warn(
        `[proxy] ${rawUrl} points at the container's own loopback; using ${rewritten} instead. ` +
        `Set HTTPS_PROXY explicitly to silence this.`
      );
    }
    return rewritten;
  }

  if (!warnedAboutLoopback) {
    warnedAboutLoopback = true;
    console.warn(
      `[proxy] ${rawUrl} points at the container's own loopback, not your host, so GitHub ` +
      `requests will fail with ECONNREFUSED. Set HTTPS_PROXY to a reachable address ` +
      `(e.g. http://${HOST_GATEWAY}:${parsed.port || 8080}) or unset it.`
    );
  }
  return rawUrl;
}

/**
 * Returns the configured outbound proxy URL (HTTPS_PROXY preferred over HTTP_PROXY),
 * corrected for container networking where needed.
 * @returns {string|null}
 */
function getProxyUrl() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy || null;
  return raw ? adjustForContainer(raw) : null;
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
