/**
 * Block Intent Extraction Layer
 * 
 * Converts ProseMirror transactions into semantic block-level operations
 * for immediate, crash-safe persistence.
 * 
 * Design principles:
 * - No debounce, no batching (write-ahead durability)
 * - Block-scoped operations only (not document-level)
 * - Intent-based, not step-based (semantic, not mechanical)
 */

import { Node as ProseMirrorNode, Fragment } from '@tiptap/pm/model';
import { Transaction } from '@tiptap/pm/state';

// ============================================================================
// Intent Types (Semantic Operations)
// ============================================================================

export type BlockIntent =
  | UpdateBlockContentIntent
  | SplitBlockIntent
  | MergeBlocksIntent
  | CreateBlockIntent
  | DeleteBlockIntent
  | UpdateBlockAttrsIntent
  | MoveBlockIntent;

export interface UpdateBlockContentIntent {
  type: 'update_content';
  blockId: string;
  noteId: string;
  newContent: string;
  timestamp: number;
}

export interface SplitBlockIntent {
  type: 'split_block';
  sourceBlockId: string;
  newBlockId: string;
  noteId: string;
  splitOffset: number;
  timestamp: number;
}

export interface MergeBlocksIntent {
  type: 'merge_blocks';
  targetBlockId: string;
  sourceBlockId: string;
  noteId: string;
  timestamp: number;
}

export interface CreateBlockIntent {
  type: 'create_block';
  blockId: string;
  noteId: string;
  blockType: string;
  content: string;
  attrs: Record<string, any>;
  timestamp: number;
}

export interface DeleteBlockIntent {
  type: 'delete_block';
  blockId: string;
  noteId: string;
  timestamp: number;
}

export interface UpdateBlockAttrsIntent {
  type: 'update_attrs';
  blockId: string;
  noteId: string;
  attrs: Record<string, any>;
  timestamp: number;
}

export interface MoveBlockIntent {
  type: 'move_block';
  blockId: string;
  noteId: string;
  oldPosition: number;
  newPosition: number;
  timestamp: number;
}

// ============================================================================
// Block Change Detection
// ============================================================================

/**
 * ⚠️ CRITICAL: Sanitize ProseMirror JSON to remove empty text nodes
 * 
 * ProseMirror creates empty text nodes during normalization.
 * TipTap forbids { type: "text", text: "" } and throws RangeError.
 * 
 * This function RECURSIVELY removes ONLY empty text nodes, preserving all structure.
 */
function sanitizeNode(node: any): any {
  if (!node || typeof node !== 'object') return node;

  // Recursively sanitize content array
  if (Array.isArray(node.content)) {
    node.content = node.content
      .map(sanitizeNode)  // ✅ RECURSIVE: Handle nested structures
      .filter((child: any) => !(child.type === 'text' && child.text === ''));  // ✅ Remove ONLY empty text nodes
    // ✅ Keep content array even if empty after filtering
    // ProseMirror requires the structure, empty array is valid
  }

  return node;
}

interface BlockSnapshot {
  blockId: string;
  type: string;
  content: string;
  attrs: Record<string, any>;
  position: number;
}

/**
 * Find all blocks that changed in this transaction
 * Returns both old and new snapshots for comparison
 */
function findChangedBlocks(
  prevDoc: ProseMirrorNode | null,
  nextDoc: ProseMirrorNode,
  transaction: Transaction
): { added: BlockSnapshot[]; removed: BlockSnapshot[]; modified: BlockSnapshot[] } {
  const added: BlockSnapshot[] = [];
  const removed: BlockSnapshot[] = [];
  const modified: BlockSnapshot[] = [];

  // Build maps of blockId → snapshot for both docs
  const prevBlocks = new Map<string, BlockSnapshot>();
  const nextBlocks = new Map<string, BlockSnapshot>();

  // Scan previous document (if exists)
  if (prevDoc) {
    prevDoc.descendants((node, pos) => {
      if (node.isBlock && node.attrs.blockId) {
        const sanitized = sanitizeNode(node.toJSON());
        
        prevBlocks.set(node.attrs.blockId, {
          blockId: node.attrs.blockId,
          type: node.type.name,
          content: JSON.stringify(sanitized),
          attrs: { ...node.attrs },
          position: pos,
        });
      }
    });
  }

  // Scan next document
  // ✅ APPLE NOTES RULE: Persist ALL blocks with blockId (empty or not)
  nextDoc.descendants((node, pos) => {
    if (node.isBlock && node.attrs.blockId) {
      const sanitized = sanitizeNode(node.toJSON());
      
      nextBlocks.set(node.attrs.blockId, {
        blockId: node.attrs.blockId,
        type: node.type.name,
        content: JSON.stringify(sanitized),
        attrs: { ...node.attrs },
        position: pos,
      });
    }
  });

  // Find added blocks (in next, not in prev)
  nextBlocks.forEach((snapshot, blockId) => {
    if (!prevBlocks.has(blockId)) {
      added.push(snapshot);
    }
  });

  // Find removed blocks (in prev, not in next)
  prevBlocks.forEach((snapshot, blockId) => {
    if (!nextBlocks.has(blockId)) {
      removed.push(snapshot);
    }
  });

  // Find modified blocks (in both, but different)
  nextBlocks.forEach((nextSnapshot, blockId) => {
    const prevSnapshot = prevBlocks.get(blockId);
    if (prevSnapshot) {
      const contentChanged = prevSnapshot.content !== nextSnapshot.content;
      const attrsChanged = JSON.stringify(prevSnapshot.attrs) !== JSON.stringify(nextSnapshot.attrs);
      const positionChanged = prevSnapshot.position !== nextSnapshot.position;

      if (contentChanged || attrsChanged || positionChanged) {
        modified.push({
          ...nextSnapshot,
          // Store old position for move detection
          position: prevSnapshot.position,
        });
      }
    }
  });

  return { added, removed, modified };
}

// ============================================================================
// Intent Classification
// ============================================================================

/**
 * Classify block changes into semantic intents
 * This is where we map ProseMirror effects → business logic operations
 */
function classifyIntents(
  changes: ReturnType<typeof findChangedBlocks>,
  prevDoc: ProseMirrorNode | null,
  nextDoc: ProseMirrorNode,
  noteId: string
): BlockIntent[] {
  const intents: BlockIntent[] = [];
  const timestamp = Date.now();

  // Pattern 1: Block creation (added blocks)
  changes.added.forEach((block) => {
    intents.push({
      type: 'create_block',
      blockId: block.blockId,
      noteId,
      blockType: block.type,
      content: block.content,
      attrs: block.attrs,
      timestamp,
    });
  });

  // Pattern 2: Block deletion (removed blocks)
  changes.removed.forEach((block) => {
    intents.push({
      type: 'delete_block',
      blockId: block.blockId,
      noteId,
      timestamp,
    });
  });

  // Pattern 3: Modified blocks (complex classification)
  changes.modified.forEach((block) => {
    const prevSnapshot = prevDoc
      ? getAllBlocks(prevDoc).find((b) => b.blockId === block.blockId)
      : null;
    const nextSnapshot = getAllBlocks(nextDoc).find((b) => b.blockId === block.blockId);

    if (!nextSnapshot) return;

    // Check for attribute changes (toggle state, indentation, etc.)
    const attrsChanged = prevSnapshot
      ? JSON.stringify(prevSnapshot.attrs) !== JSON.stringify(nextSnapshot.attrs)
      : false;

    if (attrsChanged) {
      intents.push({
        type: 'update_attrs',
        blockId: block.blockId,
        noteId,
        attrs: nextSnapshot.attrs,
        timestamp,
      });
    }

    // Check for content changes (typing, deletion, paste)
    const contentChanged = prevSnapshot ? prevSnapshot.content !== nextSnapshot.content : true;

    if (contentChanged) {
      intents.push({
        type: 'update_content',
        blockId: block.blockId,
        noteId,
        newContent: nextSnapshot.content,
        timestamp,
      });
    }

    // Position changes handled separately (move operations)
    // For now, we don't emit move intents unless explicitly needed
  });

  // Pattern 4: Detect Enter (split) - heuristic
  // If we have 1 removed + 2 added blocks at same position, it's likely a split
  if (changes.removed.length === 1 && changes.added.length === 2) {
    const [removed] = changes.removed;
    const [first, second] = changes.added;

    // Rough heuristic: if combined content matches removed content, it's a split
    const combinedContent = first.content + second.content;
    if (combinedContent === removed.content || combinedContent.length >= removed.content.length - 1) {
      // Override create intents with a split intent
      const splitIntent: SplitBlockIntent = {
        type: 'split_block',
        sourceBlockId: removed.blockId,
        newBlockId: second.blockId,
        noteId,
        splitOffset: first.content.length,
        timestamp,
      };

      // Remove the create intents and add split
      const createIndexes = intents
        .map((intent, idx) => (intent.type === 'create_block' ? idx : -1))
        .filter((idx) => idx !== -1);

      createIndexes.reverse().forEach((idx) => intents.splice(idx, 1));
      intents.push(splitIntent);
    }
  }

  // Pattern 5: Detect Backspace merge - heuristic
  // If we have 2 removed + 1 added at same position, it's likely a merge
  if (changes.removed.length === 2 && changes.added.length === 1) {
    const [first, second] = changes.removed;
    const [merged] = changes.added;

    // Rough heuristic: if merged content is combination of removed, it's a merge
    const combinedContent = first.content + second.content;
    if (merged.content === combinedContent || merged.content.length >= combinedContent.length - 1) {
      const mergeIntent: MergeBlocksIntent = {
        type: 'merge_blocks',
        targetBlockId: first.blockId,
        sourceBlockId: second.blockId,
        noteId,
        timestamp,
      };

      // Remove delete/create intents and add merge
      intents.length = 0; // Clear all intents for this transaction
      intents.push(mergeIntent);
    }
  }

  return intents;
}

// ============================================================================
// Helper: Get all blocks from document
// ============================================================================

function getAllBlocks(doc: ProseMirrorNode): BlockSnapshot[] {
  const blocks: BlockSnapshot[] = [];
  doc.descendants((node, pos) => {
    if (node.isBlock && node.attrs.blockId) {
      blocks.push({
        blockId: node.attrs.blockId,
        type: node.type.name,
        content: node.textContent,
        attrs: { ...node.attrs },
        position: pos,
      });
    }
  });
  return blocks;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Main entry point: Extract semantic intents from a ProseMirror transaction
 * 
 * @param prevDoc - Previous document state (null on first transaction)
 * @param nextDoc - New document state after transaction
 * @param transaction - The ProseMirror transaction
 * @param noteId - Current note ID (for intent tagging)
 * @returns Array of semantic block intents to persist
 */
export function extractBlockIntents(
  prevDoc: ProseMirrorNode | null,
  nextDoc: ProseMirrorNode,
  transaction: Transaction,
  noteId: string
): BlockIntent[] {
  // 🔒 HARD GATE: Only extract intents from explicit user actions
  if (transaction.getMeta('isUserEdit') !== true) {
    return [];
  }

  // Skip if transaction didn't change the document
  if (!transaction.docChanged) {
    return [];
  }

  // Two-pass analysis
  const changes = findChangedBlocks(prevDoc, nextDoc, transaction);
  const intents = classifyIntents(changes, prevDoc, nextDoc, noteId);

  return intents;
}
