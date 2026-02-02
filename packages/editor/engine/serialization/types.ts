/**
 * Native Blocks Storage Format
 *
 * This is the greenfield storage format for the Clutter editor.
 * Replaces ProseMirror JSON with a clean, block-first schema.
 *
 * Version 2 = Blocks format (v1 was PM JSON)
 */

import type { Block } from '../types/Block';

/**
 * Document stored in app state
 *
 * Format version 2: Native blocks
 */
export interface BlocksDocument {
  /** Format version (2 = blocks) */
  version: 2;

  /** Format identifier */
  format: 'blocks';

  /** All blocks (flat array, tree structure in parent/children) */
  blocks: Block[];

  /** Optional: Root block IDs (optimization, can be derived) */
  rootIds?: string[];

  /** Document metadata */
  metadata?: {
    createdAt?: number;
    updatedAt?: number;
    wordCount?: number;
    blockCount?: number;
  };
}

/**
 * Legacy ProseMirror document
 *
 * Format version 1: PM JSON (deprecated but still loadable)
 */
export interface LegacyPMDocument {
  version?: 1;
  content: {
    type: 'doc';
    content: any[];
  };
}

/**
 * Union type for all supported document formats
 */
export type StoredDocument = BlocksDocument | LegacyPMDocument;

/**
 * Type guard: Check if document is blocks format
 */
export function isBlocksDocument(doc: any): doc is BlocksDocument {
  return (
    doc &&
    typeof doc === 'object' &&
    doc.version === 2 &&
    doc.format === 'blocks' &&
    Array.isArray(doc.blocks)
  );
}

/**
 * Type guard: Check if document is legacy PM format
 */
export function isLegacyPMDocument(doc: any): doc is LegacyPMDocument {
  return (
    doc &&
    typeof doc === 'object' &&
    doc.content &&
    typeof doc.content === 'object' &&
    doc.content.type === 'doc' &&
    Array.isArray(doc.content.content)
  );
}
