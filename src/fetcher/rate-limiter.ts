import { getDb } from '../storage/db.js';

const MAX_REQUESTS_PER_DAY = parseInt(process.env.MAX_REQUESTS_PER_DAY || '50', 10);

export function canFetch(): boolean {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM fetch_log
    WHERE fetched_at >= ? AND status != 'rate_limited'
  `).get(today + 'T00:00:00.000Z') as { count: number };

  return result.count < MAX_REQUESTS_PER_DAY;
}

export function getRemainingRequests(): number {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM fetch_log
    WHERE fetched_at >= ? AND status != 'rate_limited'
  `).get(today + 'T00:00:00.000Z') as { count: number };

  return Math.max(0, MAX_REQUESTS_PER_DAY - result.count);
}

export function logFetch(
  topic: string,
  region: string,
  itemsFound: number,
  status: 'success' | 'error' | 'rate_limited',
  errorMessage?: string
): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO fetch_log (topic, region, fetched_at, items_found, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(topic, region, new Date().toISOString(), itemsFound, status, errorMessage || null);
}

export function getRecentFetches(limit = 20): any[] {
  const db = getDb();

  return db.prepare(`
    SELECT * FROM fetch_log
    ORDER BY fetched_at DESC
    LIMIT ?
  `).all(limit);
}
