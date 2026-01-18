-- Block Intent Journal (Apple Notes Architecture)
-- Append-only, crash-safe, WAL-backed persistence
-- 
-- Every semantic block operation is written immediately.
-- No debounce, no batching, no autosave.
-- Survives crashes, force-quits, power loss.

CREATE TABLE IF NOT EXISTS block_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
