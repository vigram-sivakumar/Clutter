// packages/editor/core/structuralDelete/performStructuralDelete.ts

import { beginStructuralDelete, endStructuralDelete } from '../structuralDeleteState';
import { resolveDeletionCursor } from './cursorLaw';
import type { StructuralDeleteParams } from './types';

/**
 * THE ONLY FUNCTION IN THE ENTIRE APP ALLOWED TO:
 * - Perform structural deletes
 * - Dispatch delete transactions
 * - Place the cursor after delete
 *
 * Everything else must delegate here.
 * 
 * CRITICAL: Operates on explicit engineSnapshot (no hidden dependencies).
 * This makes the function:
 * - Stateless
 * - Purely authoritative
 * - Free of timing issues
 * - Impossible to call incorrectly
 */
export function performStructuralDelete({
  editor,
  engineSnapshot,
  blockIds,
  source,
}: StructuralDeleteParams): boolean {
  if (!editor || !blockIds.length) {
    return false;
  }

  const engine = editor._engine;
  const resolver = editor._resolver;

  if (!engine || !resolver) {
    return false;
  }

  beginStructuralDelete();

  try {
    /**
     * 1. Ensure Engine is the source of truth
     */
    engine.selection = {
      kind: 'block',
      blockIds: [...blockIds],
    };

    /**
     * 2. Use explicit snapshot (NO engine lifecycle dependency)
     */
    const blocks = engineSnapshot.blocks;

    /**
     * 3. Resolve subtree + structural delete via resolver
     *    (Resolver does delete+promotion, returns cursor info)
     */
    const results: any[] = [];
    for (const blockId of blockIds) {
      const result = resolver.resolve({
        type: 'delete-block',
        blockId,
        source,
      });

      if (!result || result.success === false) {
        continue;
      }

      results.push(result);
    }

    if (results.length === 0) {
      return false;
    }

    /**
     * 4. Use cursor target from LAST delete
     *    (Resolver already computed it using DELETE CURSOR LAW)
     */
    const lastResult = results[results.length - 1];
    const cursorTarget = lastResult.cursorTarget;

    if (!cursorTarget) {
      return true; // Delete succeeded, but no cursor to place
    }

    /**
     * 5. APPLY CURSOR — EXACTLY ONCE
     *    No other code is allowed to move it
     */
    applyDeletionCursor(editor, cursorTarget);

    return true;
  } finally {
    endStructuralDelete();
  }
}

/**
 * Cursor application is intentionally isolated.
 * This prevents PM "helpfulness" from leaking back in.
 * 
 * Accepts cursor target from resolver:
 * - { blockId, placement: 'start'|'end'|'safe' }
 */
function applyDeletionCursor(
  editor: any,
  target: { blockId: string; placement: 'start' | 'end' | 'safe' },
) {
  const { state, view } = editor;

  if (!view?.dispatch) return;

  const tr = state.tr;

  // Find the target block position
  const pos = findBlockPosition(state, target.blockId, target.placement);
  
  if (pos != null) {
    try {
      const selection = state.selection.constructor.create(state.doc, pos);
      tr.setSelection(selection);
      view.dispatch(tr);
    } catch (e) {
      // Failed to place cursor
    }
  }
}

/**
 * Maps blockId + placement → PM position.
 * This is the ONLY place we do this mapping.
 */
function findBlockPosition(
  state: any,
  blockId: string,
  placement: 'start' | 'end' | 'safe',
): number | null {
  let foundPos: number | null = null;

  state.doc.descendants((node: any, pos: number) => {
    if (node.attrs?.blockId === blockId) {
      if (placement === 'start') {
        // Start of block content
        foundPos = pos + 1;
      } else if (placement === 'end') {
        // End of block content
        foundPos = pos + node.nodeSize - 1;
      } else {
        // Safe position (start)
        foundPos = pos + 1;
      }
      return false;
    }
    return true;
  });

  return foundPos;
}
