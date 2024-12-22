import { Sequelize } from 'sequelize';

async function waitForDb() {
  const sequelize = new Sequelize(
    process.env.POSTGRES_DB,
    process.env.POSTGRES_USER,
    process.env.POSTGRES_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
      logging: false,
      retry: {
        max: 10,
        timeout: 3000
      }
    }
  );

  let retries = 5;
  while (retries) {
    try {
      await sequelize.authenticate();
      console.log('Database connection established');
      return true;
    } catch (err) {
      console.log('Waiting for database...', retries, 'retries left');
      retries -= 1;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  throw new Error('Unable to connect to database');
}

waitForDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  }); 