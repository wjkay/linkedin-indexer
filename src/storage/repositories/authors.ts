import { getDb } from '../db.js';
import type { Author } from '../../types/index.js';

export function insertAuthor(author: Author): void {
  const db = getDb();

  db.prepare(`
    INSERT OR REPLACE INTO authors (id, name, headline, profile_url, avatar_url, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    author.id,
    author.name,
    author.headline || null,
    author.profileUrl,
    author.avatarUrl || null,
    author.fetchedAt
  );
}

export function getAuthorById(id: string): Author | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM authors WHERE id = ?`).get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    profileUrl: row.profile_url,
    avatarUrl: row.avatar_url,
    fetchedAt: row.fetched_at
  };
}

export function getAllAuthors(): Author[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM authors ORDER BY name`).all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    headline: row.headline,
    profileUrl: row.profile_url,
    avatarUrl: row.avatar_url,
    fetchedAt: row.fetched_at
  }));
}

export function getAuthorByProfileUrl(profileUrl: string): Author | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM authors WHERE profile_url = ?`).get(profileUrl) as any;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    profileUrl: row.profile_url,
    avatarUrl: row.avatar_url,
    fetchedAt: row.fetched_at
  };
}

export function generateAuthorId(profileUrl: string): string {
  // Extract username from LinkedIn URL
  const match = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
  return match ? match[1] : Buffer.from(profileUrl).toString('base64url').slice(0, 16);
}
