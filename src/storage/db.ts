import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/linkedin.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      headline TEXT,
      profile_url TEXT NOT NULL,
      avatar_url TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      excerpt TEXT,
      full_text TEXT,
      author_id TEXT,
      content_type TEXT CHECK(content_type IN ('article', 'post')) NOT NULL,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      FOREIGN KEY (author_id) REFERENCES authors(id)
    );

    CREATE TABLE IF NOT EXISTS content_topics (
      content_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      region TEXT NOT NULL,
      subregion TEXT,
      PRIMARY KEY (content_id, topic, region),
      FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      region TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      items_found INTEGER DEFAULT 0,
      status TEXT CHECK(status IN ('success', 'error', 'rate_limited')) NOT NULL,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_content_published_at ON content(published_at);
    CREATE INDEX IF NOT EXISTS idx_content_author_id ON content(author_id);
    CREATE INDEX IF NOT EXISTS idx_content_topics_topic ON content_topics(topic);
    CREATE INDEX IF NOT EXISTS idx_content_topics_region ON content_topics(region);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
