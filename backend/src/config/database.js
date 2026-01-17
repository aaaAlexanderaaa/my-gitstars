require('dotenv').config();

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

module.exports = {
  development: {
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'gitstars',
    host: dbHost,
    port: Number.isFinite(dbPort) ? dbPort : 5432,
    dialect: 'postgres',
    logging: false
  },
  production: {
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'gitstars',
    host: dbHost,
    port: Number.isFinite(dbPort) ? dbPort : 5432,
    dialect: 'postgres',
    logging: false
  }
}; 
