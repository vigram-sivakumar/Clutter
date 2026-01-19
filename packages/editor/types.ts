/**
 * Editor Shared Types
 */

import type { Editor } from '@tiptap/core';

/**
 * List types supported by ListBlock
 * FLAT TOGGLE ARCHITECTURE: toggle is a ListBlock variant (Craft-style)
 */
export type ListType = 'bullet' | 'numbered' | 'task' | 'toggle';

/**
 * Heading levels
 */
export type HeadingLevel = 1 | 2 | 3;

/**
 * Node attributes for ListBlock (FLAT MODEL)
 * Structure = indent only. No parent pointers, no derived levels.
 */
export interface ListBlockAttrs {
  blockId: string;
  listType: ListType;
  indent: number; // 0..n - SOLE source of structural truth
  checked: boolean | null;
  collapsed: boolean; // UI state only
  priority: number; // 0 = no priority, 1-3 = priority level (!, !!, !!!)
}

/**
 * Node attributes for Heading
 */
export interface HeadingAttrs {
  level: HeadingLevel;
}

/**
 * Node attributes for CodeBlock
 */
export interface CodeBlockAttrs {
  language: string | null;
}

/**
 * Mark attributes for Link
 */
export interface LinkAttrs {
  href: string;
  target?: string;
  rel?: string;
}

/**
 * Props passed to React node view components
 */
export interface NodeViewProps<T = Record<string, unknown>> {
  node: {
    attrs: T;
    textContent: string;
  };
  editor: Editor;
  getPos: () => number | undefined;
  updateAttributes: (_attrs: Partial<T>) => void;
  deleteNode: () => void;
  selected: boolean;
}

/**
 * Block conversion targets - blocks that paragraph can convert to
 */
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'listBlock',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'toggleBlock',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
