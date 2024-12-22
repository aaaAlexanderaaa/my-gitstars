const authRouter = require('../routes/auth');
const syncRouter = require('../routes/sync');
const reposRouter = require('../routes/repos');
const path = require('path');

function configureRoutes(app) {
  // API routes
  app.use('/auth', authRouter);
  app.use('/api', syncRouter);
  app.use('/api', reposRouter);

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
  });

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../frontend/build/index.html'));
  });
}

module.exports = { configureRoutes }; 