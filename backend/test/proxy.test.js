/**
 * Container-networking correction for loopback proxy URLs.
 *
 * `http_proxy=http://127.0.0.1:7890 docker compose up` forwards the variable into the
 * container, where 127.0.0.1 is the container itself - every GitHub request then fails
 * with ECONNREFUSED.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

/**
 * Runs `fn(proxyModule)` with a faked container environment. The stubs must stay in
 * place for the duration of the call, not just the require: the detection happens
 * inside getProxyUrl(), not at module load.
 */
function withContainerEnv({ container, hostsFile }, fn) {
  const realExists = fs.existsSync;
  const realRead = fs.readFileSync;
  fs.existsSync = (p) => (p === '/.dockerenv' ? container : realExists(p));
  fs.readFileSync = (p, ...rest) => (p === '/etc/hosts' ? hostsFile : realRead(p, ...rest));
  delete require.cache[require.resolve('../src/config/proxy')];
  try {
    return fn(require('../src/config/proxy'));
  } finally {
    fs.existsSync = realExists;
    fs.readFileSync = realRead;
    delete require.cache[require.resolve('../src/config/proxy')];
  }
}

function withEnv(vars, fn) {
  const keys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const WITH_GATEWAY = '192.168.65.2\thost.docker.internal\n';
test('no proxy configured -> null', () => {
  withContainerEnv({ container: false, hostsFile: '' }, ({ getProxyUrl }) => {
    withEnv({}, () => assert.equal(getProxyUrl(), null));
  });
});

test('outside a container the URL is left alone', () => {
  withContainerEnv({ container: false, hostsFile: '' }, ({ getProxyUrl }) => {
    withEnv({ HTTPS_PROXY: 'http://127.0.0.1:7897' }, () =>
      assert.equal(getProxyUrl(), 'http://127.0.0.1:7897'));
  });
});

test('in a container a loopback proxy is rewritten to the host gateway', () => {
  withContainerEnv({ container: true, hostsFile: WITH_GATEWAY }, ({ getProxyUrl }) => {
    withEnv({ HTTPS_PROXY: 'http://127.0.0.1:7897' }, () =>
      assert.equal(getProxyUrl(), 'http://host.docker.internal:7897'));
    withEnv({ http_proxy: 'http://localhost:8080' }, () =>
      assert.equal(getProxyUrl(), 'http://host.docker.internal:8080'));
  });
});

test('in a container without the gateway mapping the URL is kept (and warned about)', () => {
  withContainerEnv({ container: true, hostsFile: '127.0.0.1 localhost\n' }, ({ getProxyUrl }) => {
    withEnv({ HTTPS_PROXY: 'http://127.0.0.1:7897' }, () =>
      assert.equal(getProxyUrl(), 'http://127.0.0.1:7897'));
  });
});

test('a non-loopback proxy is never rewritten', () => {
  withContainerEnv({ container: true, hostsFile: WITH_GATEWAY }, ({ getProxyUrl }) => {
    withEnv({ HTTPS_PROXY: 'http://proxy.corp.example:3128' }, () =>
      assert.equal(getProxyUrl(), 'http://proxy.corp.example:3128'));
  });
});

test('HTTPS_PROXY wins over HTTP_PROXY', () => {
  withContainerEnv({ container: false, hostsFile: '' }, ({ getProxyUrl }) => {
    withEnv({ HTTPS_PROXY: 'http://a:1', HTTP_PROXY: 'http://b:2' }, () =>
      assert.equal(getProxyUrl(), 'http://a:1'));
  });
});

test('a malformed proxy URL is passed through unchanged', () => {
  withContainerEnv({ container: true, hostsFile: WITH_GATEWAY }, ({ getProxyUrl }) => {
    withEnv({ HTTPS_PROXY: 'not a url' }, () => assert.equal(getProxyUrl(), 'not a url'));
  });
});

test('getProxyConfig returns an agent pointed at the corrected URL', () => {
  withContainerEnv({ container: true, hostsFile: WITH_GATEWAY }, ({ getProxyConfig }) => {
    withEnv({ HTTPS_PROXY: 'http://127.0.0.1:7897' }, () => {
      const agent = getProxyConfig();
      assert.ok(agent, 'expected an agent');
      assert.equal(agent.proxyUrl, 'http://host.docker.internal:7897');
    });
  });
});

test('getProxyConfig returns null with no proxy set', () => {
  withContainerEnv({ container: false, hostsFile: '' }, ({ getProxyConfig }) => {
    withEnv({}, () => assert.equal(getProxyConfig(), null));
  });
});
