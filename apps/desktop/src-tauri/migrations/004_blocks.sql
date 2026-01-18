-- Blocks Snapshot Table (Apple Notes Architecture)
-- Fast, materialized view of current block state
-- Rebuilt from journal on startup for crash recovery

CREATE TABLE IF NOT EXISTS blocks (
  block_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  content TEXT NOT NULL,
  attrs TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_note_id ON blocks(note_id);
