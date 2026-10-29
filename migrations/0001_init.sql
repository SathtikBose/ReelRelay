-- Migration: 0001_init.sql
-- Description: Create keywords, processed_comments, and events_log tables for ReelRelay D1 database

-- Table: keywords (Reel automation rules and trigger keywords)
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'word', -- 'word', 'exact', 'contains'
  dm_message TEXT NOT NULL DEFAULT "Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}",
  link TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = paused
  caption TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  permalink TEXT DEFAULT '',
  matched_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_keywords_media_id ON keywords(media_id);
CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(active);

-- Table: processed_comments (Comment deduplication & delivery status log)
CREATE TABLE IF NOT EXISTS processed_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL,
  commenter_id TEXT NOT NULL DEFAULT '',
  commenter_username TEXT NOT NULL DEFAULT '',
  comment_text TEXT NOT NULL DEFAULT '',
  matched_keyword TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'sent', 'failed', 'skipped'
  skip_reason TEXT DEFAULT NULL,            -- 'no_rule', 'inactive', 'no_match', 'duplicate_user', 'own_comment', 'reply_comment'
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  message_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_comments_comment_id ON processed_comments(comment_id);
CREATE INDEX IF NOT EXISTS idx_processed_comments_dedup ON processed_comments(media_id, commenter_id, status);
CREATE INDEX IF NOT EXISTS idx_processed_comments_created_at ON processed_comments(created_at);

-- Table: events_log (Optional audit log for webhook payloads and system events)
CREATE TABLE IF NOT EXISTS events_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_log_created_at ON events_log(created_at);
