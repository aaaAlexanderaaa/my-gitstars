const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function loadEnv() {
  if (loaded) return;

  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env')
  ];

  for (const envPath of [...new Set(envPaths)]) {
    dotenv.config({ path: envPath });
  }

  loaded = true;
}

function requireEnv(keys) {
  const missing = keys.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  loadEnv,
  requireEnv
};
