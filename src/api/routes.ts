import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { getContent, getContentById } from '../storage/repositories/content.js';
import { getAllAuthors, getAuthorById } from '../storage/repositories/authors.js';
import { getRemainingRequests, getRecentFetches } from '../fetcher/rate-limiter.js';
import { runFetchCycle } from '../scheduler/cron-jobs.js';
import type { ContentQuery, TopicConfig } from '../types/index.js';

export const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get content with filters
router.get('/content', (req: Request, res: Response) => {
  try {
    const query: ContentQuery = {
      topic: req.query.topic as string,
      region: req.query.region as string,
      subregion: req.query.subregion as string,
      type: req.query.type as 'article' | 'post' | 'all',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      since: req.query.since as string,
      authorId: req.query.authorId as string
    };

    const content = getContent(query);
    res.json({
      data: content,
      count: content.length,
      query
    });

  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// Get single content by ID
router.get('/content/:id', (req: Request, res: Response) => {
  try {
    const content = getContentById(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json(content);
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// Get all topics and regions
router.get('/topics', (_req: Request, res: Response) => {
  try {
    const configPath = process.env.TOPICS_CONFIG_PATH || './config/topics.json';
    const config: TopicConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    res.json(config);
  } catch (error) {
    console.error('Error loading topics:', error);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

// Get all authors
router.get('/authors', (_req: Request, res: Response) => {
  try {
    const authors = getAllAuthors();
    res.json({ data: authors, count: authors.length });
  } catch (error) {
    console.error('Error fetching authors:', error);
    res.status(500).json({ error: 'Failed to fetch authors' });
  }
});

// Get author by ID
router.get('/authors/:id', (req: Request, res: Response) => {
  try {
    const author = getAuthorById(req.params.id);
    if (!author) {
      return res.status(404).json({ error: 'Author not found' });
    }
    res.json(author);
  } catch (error) {
    console.error('Error fetching author:', error);
    res.status(500).json({ error: 'Failed to fetch author' });
  }
});

// Get content by author
router.get('/authors/:id/content', (req: Request, res: Response) => {
  try {
    const content = getContent({
      authorId: req.params.id,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
    });
    res.json({ data: content, count: content.length });
  } catch (error) {
    console.error('Error fetching author content:', error);
    res.status(500).json({ error: 'Failed to fetch author content' });
  }
});

// Get indexer status
router.get('/status', (_req: Request, res: Response) => {
  try {
    const recentFetches = getRecentFetches(10);
    res.json({
      remainingRequestsToday: getRemainingRequests(),
      recentFetches
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Trigger manual fetch (protected - add auth in production)
router.post('/fetch', async (_req: Request, res: Response) => {
  try {
    res.json({ message: 'Fetch cycle started' });
    // Run async - don't wait
    runFetchCycle().catch(console.error);
  } catch (error) {
    console.error('Error triggering fetch:', error);
    res.status(500).json({ error: 'Failed to trigger fetch' });
  }
});
