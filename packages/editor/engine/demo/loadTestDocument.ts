/**
 * Load Test Document
 *
 * Browser console utility to inject comprehensive test document
 * into the current note for visual parity testing.
 */

import { createTestDocument } from './createTestDocument';

/**
 * Inject test document into localStorage for the current daily note
 *
 * Usage in browser console:
 * ```
 * import { loadTestDocument } from '@clutter/editor';
 * loadTestDocument();
 * ```
 *
 * Or add to window for easy access:
 * ```
 * window.loadTestDocument = loadTestDocument;
 * ```
 */
export function loadTestDocument() {
  // Get current note ID from localStorage
  const storeKey = 'clutter-notes-store';
  const storeRaw = localStorage.getItem(storeKey);

  if (!storeRaw) {
    console.error('[Test] No notes store found in localStorage');
    return;
  }

  try {
    const store = JSON.parse(storeRaw);
    const currentNoteId = store.state?.currentNoteId;

    if (!currentNoteId) {
      console.error('[Test] No current note ID found');
      return;
    }

    // Find the current note
    const notes = store.state?.notes || [];
    const noteIndex = notes.findIndex((n: any) => n.id === currentNoteId);

    if (noteIndex === -1) {
      console.error('[Test] Current note not found in store');
      return;
    }

    // Create test document
    const testDoc = createTestDocument();
    const serialized = JSON.stringify(testDoc);

    // Update the note's content
    notes[noteIndex].content = serialized;
    notes[noteIndex].updatedAt = new Date().toISOString();

    // Save back to localStorage
    store.state.notes = notes;
    localStorage.setItem(storeKey, JSON.stringify(store));

    console.log(
      '[Test] ✅ Test document loaded! Refresh page to see all block types.'
    );
    console.log('[Test] Blocks:', testDoc.blocks.length);
    console.log('[Test] Types:', testDoc.blocks.map((b) => b.type).join(', '));

    return testDoc;
  } catch (err) {
    console.error('[Test] Failed to load test document:', err);
  }
}

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).loadTestDocument = loadTestDocument;
  console.log('[Test] loadTestDocument() available in console');
}
