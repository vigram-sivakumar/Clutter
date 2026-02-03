/**
 * Block - Core entity in the new block-first architecture
 *
 * This is the new source of truth (replaces ProseMirror document model).
 *
 * Architecture:
 * - Tree structure: Explicit parent/children relationships (not position-based)
 * - ID-based: Stable identity via nanoid (not UUID - smaller/faster)
 * - Extensible: Properties object for future features (tags, status, etc.)
 * - Plain text: Content is string for POC (Lexical JSON in Step 2)
 *
 * Design Principles:
 * - Blocks are entities with stable identity
 * - Tree relationships are explicit (parent/children)
 * - Graph features layer on top via properties
 * - Content is replaceable (text → Lexical → other)
 */

/**
 * Block types (POC subset - will expand)
 */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'code'
  | 'quote'
  | 'divider'
  | 'checklist';

/**
 * Block - The core entity
 */
export interface Block {
  /** Unique identifier (nanoid) */
  id: string;

  /** Block type */
  type: BlockType;

  // === TREE STRUCTURE (Core) ===

  /** Parent block ID (null = root level) */
  parent: string | null;

  /** Ordered list of child block IDs */
  children: string[];

  // === CONTENT ===

  /** Block content (plain text for POC, Lexical JSON later) */
  content: string;

  /** Optional description (plain text for POC) */
  description?: string;

  // === EXTENSIBILITY ===

  /** Extensible metadata (for graph features, tags, status, etc.) */
  properties: Record<string, any>;

  // === METADATA ===

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Type guard: Check if a value is a Block
 */
export function isBlock(value: any): value is Block {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    (value.parent === null || typeof value.parent === 'string') &&
    Array.isArray(value.children) &&
    typeof value.content === 'string' &&
    typeof value.properties === 'object' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

/**
 * Create a new empty block
 */
export function createEmptyBlock(
  type: BlockType,
  parent: string | null = null
): Omit<Block, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    type,
    parent,
    children: [],
    content: '',
    properties: {},
  };
}
