import express from 'express';
import cors from 'cors';
import { router } from './api/routes.js';
import { startScheduler } from './scheduler/cron-jobs.js';
import { getDb, closeDb } from './storage/db.js';

const PORT = parseInt(process.env.PORT || '3100', 10);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', router);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'LinkedIn Content Indexer',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      content: '/api/content',
      topics: '/api/topics',
      authors: '/api/authors',
      status: '/api/status'
    }
  });
});

// Initialize database
getDb();

// Start scheduler
if (process.env.NODE_ENV !== 'test') {
  startScheduler();
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`LinkedIn Indexer running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

export { app };
