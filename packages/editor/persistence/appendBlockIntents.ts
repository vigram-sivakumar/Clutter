/**
 * Block Intent Journal Writer (Apple Notes Architecture)
 * 
 * Appends semantic block operations to crash-safe journal.
 * CAUSAL CONSISTENCY: Writes are tracked and must complete before rebuild.
 * WAL guarantees durability once it reaches Rust.
 */

import { invoke } from '@tauri-apps/api/tauri';
import type { BlockIntent } from './extractBlockIntents';

// Track pending writes per note for causal consistency
const pendingWrites = new Map<string, Promise<void>[]>();

/**
 * Append block intents to journal (causally consistent)
 * 
 * Returns a promise that resolves when write completes.
 * Caller may await or track via flushPendingWrites().
 * 
 * @param noteId - Current note ID
 * @param intents - Array of semantic block intents to persist
 * @returns Promise that resolves when write is durable
 */
export function appendBlockIntents(
  noteId: string,
  intents: BlockIntent[],
): Promise<void> {
  // 🔍 DIAGNOSTIC: DB WRITE BOUNDARY
  console.error('💾 DB WRITE', {
    noteId,
    source: 'editor',
    payloadSize: JSON.stringify(intents).length,
    intentCount: intents.length,
    timestamp: Date.now(),
  });
  
  // Create tracked write promise
  const writePromise = invoke<void>('append_block_intents', {
    noteId,
    intents,
    timestamp: Date.now(),
  }).catch((err) => {
    console.error('💾 DB WRITE FAILED', {
      error: err,
      errorMessage: err?.message || String(err),
      errorStack: err?.stack,
      errorType: typeof err,
      errorKeys: err ? Object.keys(err) : [],
      noteId,
      intentCount: intents.length,
      intents: intents.map(intent => ({
        type: intent.type,
        blockId: intent.blockId,
        contentPreview: intent.type === 'update_content' ? 
          (intent as any).newContent?.substring(0, 100) : 
          (intent as any).content?.substring(0, 100),
      })),
      rawIntentsJson: JSON.stringify(intents).substring(0, 500),
    });
    throw err;
  }).finally(() => {
    // Remove from pending writes when complete
    const pending = pendingWrites.get(noteId);
    if (pending) {
      const index = pending.indexOf(writePromise);
      if (index > -1) {
        pending.splice(index, 1);
      }
      if (pending.length === 0) {
        pendingWrites.delete(noteId);
      }
    }
  });
  
  // Track pending write
  if (!pendingWrites.has(noteId)) {
    pendingWrites.set(noteId, []);
  }
  pendingWrites.get(noteId)!.push(writePromise);
  
  return writePromise;
}

/**
 * Flush all pending writes for a note (write barrier)
 * 
 * MUST be called before:
 * - rebuildBlocks()
 * - Note switching
 * - App shutdown
 * 
 * Ensures causal consistency: journal reads see all prior writes.
 * 
 * @param noteId - Note ID to flush writes for
 */
export async function flushPendingWrites(noteId: string): Promise<void> {
  const pending = pendingWrites.get(noteId);
  if (!pending || pending.length === 0) {
    return;
  }
  
  console.log('[FLUSH] Waiting for pending writes', {
    noteId,
    count: pending.length,
  });
  
  await Promise.all(pending);
  
  console.log('[FLUSH] All writes complete', { noteId });
}
