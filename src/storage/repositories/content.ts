import { getDb } from '../db.js';
import type { Content, ContentWithTopics, ContentTopic, ContentQuery } from '../../types/index.js';

export function insertContent(content: Omit<Content, 'id'>, topics: Omit<ContentTopic, 'contentId'>[]): string {
  const db = getDb();
  const id = generateId(content.url);

  const insertContent = db.prepare(`
    INSERT OR REPLACE INTO content (id, url, title, excerpt, full_text, author_id, content_type, published_at, fetched_at, likes, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO content_topics (content_id, topic, region, subregion)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertContent.run(
      id,
      content.url,
      content.title,
      content.excerpt,
      content.fullText || null,
      content.authorId,
      content.contentType,
      content.publishedAt,
      content.fetchedAt,
      content.likes || 0,
      content.comments || 0
    );

    for (const topic of topics) {
      insertTopic.run(id, topic.topic, topic.region, topic.subregion || null);
    }
  });

  transaction();
  return id;
}

export function getContent(query: ContentQuery): ContentWithTopics[] {
  const db = getDb();

  let sql = `
    SELECT DISTINCT c.*, a.name as author_name, a.headline as author_headline,
           a.profile_url as author_profile_url, a.avatar_url as author_avatar_url
    FROM content c
    LEFT JOIN authors a ON c.author_id = a.id
    LEFT JOIN content_topics ct ON c.id = ct.content_id
    WHERE 1=1
  `;

  const params: (string | number)[] = [];

  if (query.topic) {
    sql += ` AND ct.topic = ?`;
    params.push(query.topic);
  }

  if (query.region) {
    sql += ` AND ct.region = ?`;
    params.push(query.region);
  }

  if (query.subregion) {
    sql += ` AND ct.subregion = ?`;
    params.push(query.subregion);
  }

  if (query.type && query.type !== 'all') {
    sql += ` AND c.content_type = ?`;
    params.push(query.type);
  }

  if (query.since) {
    sql += ` AND c.published_at >= ?`;
    params.push(query.since);
  }

  if (query.authorId) {
    sql += ` AND c.author_id = ?`;
    params.push(query.authorId);
  }

  sql += ` ORDER BY c.published_at DESC`;

  if (query.limit) {
    sql += ` LIMIT ?`;
    params.push(query.limit);
  }

  if (query.offset) {
    sql += ` OFFSET ?`;
    params.push(query.offset);
  }

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map(row => ({
    id: row.id,
    url: row.url,
    title: row.title,
    excerpt: row.excerpt,
    fullText: row.full_text,
    authorId: row.author_id,
    contentType: row.content_type,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    likes: row.likes,
    comments: row.comments,
    topics: getContentTopics(row.id),
    author: row.author_id ? {
      id: row.author_id,
      name: row.author_name,
      headline: row.author_headline,
      profileUrl: row.author_profile_url,
      avatarUrl: row.author_avatar_url,
      fetchedAt: row.fetched_at
    } : undefined
  }));
}

export function getContentById(id: string): ContentWithTopics | null {
  const results = getContent({ limit: 1 });
  const db = getDb();

  const row = db.prepare(`
    SELECT c.*, a.name as author_name, a.headline as author_headline,
           a.profile_url as author_profile_url, a.avatar_url as author_avatar_url
    FROM content c
    LEFT JOIN authors a ON c.author_id = a.id
    WHERE c.id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    excerpt: row.excerpt,
    fullText: row.full_text,
    authorId: row.author_id,
    contentType: row.content_type,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    likes: row.likes,
    comments: row.comments,
    topics: getContentTopics(row.id),
    author: row.author_id ? {
      id: row.author_id,
      name: row.author_name,
      headline: row.author_headline,
      profileUrl: row.author_profile_url,
      avatarUrl: row.author_avatar_url,
      fetchedAt: row.fetched_at
    } : undefined
  };
}

function getContentTopics(contentId: string): ContentTopic[] {
  const db = getDb();
  return db.prepare(`
    SELECT content_id, topic, region, subregion
    FROM content_topics
    WHERE content_id = ?
  `).all(contentId) as ContentTopic[];
}

function generateId(url: string): string {
  return Buffer.from(url).toString('base64url').slice(0, 32);
}
