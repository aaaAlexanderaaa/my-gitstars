const { Sequelize } = require('sequelize');
const config = require('./src/config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config.resolve(env);

const TIMEOUT_MS = Number.parseInt(process.env.DB_WAIT_TIMEOUT_MS || '', 10) || 120000;
const RETRY_DELAY_MS = Number.parseInt(process.env.DB_WAIT_RETRY_MS || '', 10) || 2000;

const sequelize = new Sequelize({ ...dbConfig, logging: false });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Blocks container start-up until Postgres accepts connections.
 *
 * Previously this gave up after 5 attempts (~20s), which is not long enough for a
 * cold Postgres volume, and it never closed its own connection pool - so even on
 * success the process lingered until Node force-exited it.
 */
async function waitForDb() {
  const deadline = Date.now() + TIMEOUT_MS;
  let attempt = 0;

  for (;;) {
    attempt++;
    try {
      await sequelize.authenticate();
      console.log(`Database connection established (attempt ${attempt}).`);
      return true;
    } catch (error) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        console.error(`Could not reach the database at ${dbConfig.host}:${dbConfig.port} within ${TIMEOUT_MS}ms: ${error.message}`);
        return false;
      }
      console.log(`Waiting for the database at ${dbConfig.host}:${dbConfig.port}... (${Math.round(remaining / 1000)}s left): ${error.message}`);
      await sleep(Math.min(RETRY_DELAY_MS, remaining));
    }
  }
}

waitForDb()
  .then(async (ok) => {
    // Release the pool explicitly; an open Sequelize pool keeps the event loop alive.
    await sequelize.close().catch(() => {});
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error('Unexpected error while waiting for the database:', error);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
