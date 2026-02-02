/**
 * Migration Types
 *
 * Types for converting ProseMirror documents to Lexical JSON format.
 */

import type { Block, BlockType } from '../types/Block';

/**
 * ProseMirror node attributes (from our schema)
 */
export interface PMBlockAttrs {
  blockId?: string | null;
  indent?: number;
  collapsed?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  description?: string | null;
  tags?: string[];

  // Node-specific
  headingLevel?: 1 | 2 | 3;
  listType?: 'bullet' | 'numbered' | 'task';
  checked?: boolean | null;
  priority?: number;
  language?: string;
}

/**
 * Simplified ProseMirror node structure
 */
export interface PMNode {
  type: string;
  attrs?: PMBlockAttrs;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

/**
 * ProseMirror text mark
 */
export interface PMMark {
  type: string;
  attrs?: Record<string, any>;
}

/**
 * ProseMirror document (root)
 */
export interface PMDocument {
  type: 'doc';
  content?: PMNode[];
}

/**
 * Lexical node structure (simplified)
 */
export interface LexicalNode {
  type: string;
  version?: number;
  [key: string]: any;
}

/**
 * Lexical text node with formatting
 */
export interface LexicalTextNode extends LexicalNode {
  type: 'text';
  text: string;
  format: number; // Bitmask for bold, italic, etc.
  style?: string;
  mode?: string;
  detail?: number;
}

/**
 * Lexical paragraph node
 */
export interface LexicalParagraphNode extends LexicalNode {
  type: 'paragraph';
  children: LexicalNode[];
  direction?: 'ltr' | 'rtl';
  format?: string;
  indent?: number;
}

/**
 * Lexical root node
 */
export interface LexicalRoot {
  root: {
    children: LexicalNode[];
    direction: 'ltr' | 'rtl';
    format: string;
    indent: number;
    type: 'root';
    version: number;
  };
}

/**
 * Migration result for a single block
 */
export interface MigrationResult {
  success: boolean;
  block?: Block;
  error?: string;
  warnings?: string[];
}

/**
 * Migration result for entire document
 */
export interface DocumentMigrationResult {
  success: boolean;
  blocks: Block[];
  errors: Array<{ blockId?: string; error: string }>;
  warnings: Array<{ blockId?: string; warning: string }>;
  stats: {
    totalBlocks: number;
    converted: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Migration options
 */
export interface MigrationOptions {
  /** Skip blocks that fail conversion (default: false) */
  skipErrors?: boolean;

  /** Preserve original blockIds (default: true) */
  preserveBlockIds?: boolean;

  /** Generate new timestamps (default: false - preserve original) */
  regenerateTimestamps?: boolean;

  /** Validate tree structure after migration (default: true) */
  validateTree?: boolean;

  /** Callback for progress tracking */
  onProgress?: (current: number, total: number, blockId?: string) => void;
}

/**
 * Text format bitmask for Lexical
 *
 * Binary flags that can be combined:
 * - Bold: 1 (0b00001)
 * - Italic: 2 (0b00010)
 * - Strikethrough: 4 (0b00100)
 * - Underline: 8 (0b01000)
 * - Code: 16 (0b10000)
 */
export enum TextFormat {
  Bold = 1,
  Italic = 2,
  Strikethrough = 4,
  Underline = 8,
  Code = 16,
}
