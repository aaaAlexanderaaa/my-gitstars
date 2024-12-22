require('dotenv').config();
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const { sequelize } = require('./models');
const { configurePassport } = require('./config/passport');
const { configureMiddleware } = require('./config/middleware');
const { configureRoutes } = require('./config/routes');

const app = express();
const port = process.env.PORT || 4000;

// Trust first proxy for secure cookies
app.set('trust proxy', 1);

// Configure middleware
configureMiddleware(app);

// Configure passport
configurePassport(passport);

// Configure routes
configureRoutes(app);

// Initialize database and start server
async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established');
    
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

start(); 