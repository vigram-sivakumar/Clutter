/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * REBUILD BLOCKS FROM JOURNAL (Apple Notes Architecture)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * Replays the intent journal to rebuild the blocks snapshot table.
 * 
 * Call this:
 * - On app startup (crash recovery)
 * - After journal accumulates too many entries (consolidation)
 * 
 * Guarantees:
 * - Blocks table always reflects latest state from journal
 * - Journal remains source of truth
 * - Idempotent (safe to call multiple times)
 */

import { invoke } from '@tauri-apps/api/tauri';

/**
 * Rebuild the blocks snapshot for a note from its intent journal.
 * 
 * This operation:
 * 1. Reads all intents from block_journal for this note
 * 2. Replays them chronologically
 * 3. Materializes the final state into the blocks table
 * 
 * ⚠️ READ-ONLY: This function NEVER writes to the journal.
 * Initial block creation happens at note creation time only.
 * 
 * @param noteId - ID of the note to rebuild
 * @throws Error if rebuild fails (usually means corrupted journal)
 */
export async function rebuildBlocks(noteId: string): Promise<void> {
  await invoke('rebuild_blocks_from_journal', { noteId });
}

/**
 * Rebuild blocks for all notes in the database.
 * 
 * This is typically called:
 * - On app first launch after migration
 * - After a major schema change
 * - During maintenance/cleanup
 * 
 * @param noteIds - Array of note IDs to rebuild
 */
export async function rebuildAllBlocks(noteIds: string[]): Promise<void> {
  // Rebuild sequentially to avoid lock contention
  for (const noteId of noteIds) {
    await rebuildBlocks(noteId);
  }
}
