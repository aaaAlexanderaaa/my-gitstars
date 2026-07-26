const { loadEnv } = require('./env');

loadEnv();

/**
 * Helper to find the first defined environment variable from a list of keys.
 * This provides case-insensitive fallback for DB_HOST/DB_PORT to handle
 * inconsistent environment variable naming across different deployment environments.
 * Note: Environment variables are case-sensitive on Linux but not on Windows.
 */
function getFirstEnvValue(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

const dbHost = getFirstEnvValue(['DB_HOST', 'DB_host', 'db_host']) || 'db';
const dbPortRaw = getFirstEnvValue(['DB_PORT', 'DB_port', 'db_port']);
const dbPort = dbPortRaw ? Number(dbPortRaw) : 5432;

const connection = {
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'gitstars',
  host: dbHost,
  port: Number.isFinite(dbPort) ? dbPort : 5432,
  dialect: 'postgres',
  logging: false
};

/**
 * Every environment shares the same connection settings, which all come from env vars.
 *
 * Only `development` and `production` used to be defined, so any other NODE_ENV
 * (`staging`, `test`, a stray typo) resolved to `undefined` and Sequelize failed with
 * an opaque "Dialect needs to be explicitly supplied". Callers should go through
 * `resolve()` so an unknown NODE_ENV degrades to the shared settings instead.
 *
 * Note this must stay a plain object: sequelize-cli probes keys such as
 * `use_env_variable` on it, and a Proxy that answers every lookup breaks that.
 */
module.exports = {
  development: connection,
  test: connection,
  staging: connection,
  production: connection,

  /** @returns {object} connection settings for `env`, falling back to the shared ones. */
  resolve(env) {
    return module.exports[env] && env !== 'resolve' ? module.exports[env] : connection;
  }
};

