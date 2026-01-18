/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * LOAD BLOCKS FOR NOTE (Apple Notes Architecture)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * Primary read path for editor initialization.
 * Loads blocks from the snapshot table (fast, no replay needed).
 */

import { invoke } from '@tauri-apps/api/tauri';

/**
 * Block data structure as returned from SQLite.
 */
export interface BlockData {
  blockId: string;
  type: string;
  content: string;
  attrs: Record<string, any>;
}

/**
 * Load all blocks for a note from the blocks snapshot table.
 * 
 * This is the primary read path for editor initialization.
 * Call this after `rebuildBlocks()` to ensure fresh state.
 * 
 * @param noteId - ID of the note to load
 * @returns Array of blocks in chronological order
 */
export async function loadBlocksForNote(noteId: string): Promise<BlockData[]> {
  return await invoke<BlockData[]>('load_blocks_for_note', { noteId });
}
