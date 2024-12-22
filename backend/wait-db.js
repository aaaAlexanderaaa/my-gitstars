const { Sequelize } = require('sequelize');
const config = require('./src/config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(dbConfig);

async function waitForDb(retries = 5, delay = 5000) {
  while (retries > 0) {
    try {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');
      return true;
    } catch (error) {
      console.log(`Unable to connect to the database. Retries left: ${retries}`);
      retries--;
      if (retries === 0) {
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

waitForDb(); 