const path = require('path');

module.exports = {
  'config': path.resolve('src/config', 'database.js'),
  'models-path': path.resolve('src', 'models'),
  'migrations-path': path.resolve('migrations'),
  'seeders-path': path.resolve('seeders')
}; 