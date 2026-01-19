/**
 * Shared block replacement utility
 * Used by both Markdown Shortcuts and Slash Commands
 */

import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Replace a block with a new block in a single atomic transaction
 * Handles content preservation and cursor positioning
 *
 * @param view - ProseMirror editor view
 * @param blockStart - Start position of block to replace
 * @param blockEnd - End position of block to replace
 * @param replacement - New node(s) to insert (single node or array)
 * @param options - Optional configuration
 */
export function replaceBlock(
  view: EditorView,
  blockStart: number,
  blockEnd: number,
  replacement: PMNode | PMNode[],
  options?: {
    /** Cursor offset from start of new block content (default: 0) */
    cursorOffset?: number;
  }
): void {
  const { state } = view;
  const tr = state.tr;

  // Replace the block
  tr.replaceWith(blockStart, blockEnd, replacement);

  // Position cursor inside the new block
  const cursorOffset = options?.cursorOffset ?? 0;
  let newCursorPos: number;

  if (Array.isArray(replacement)) {
    // For arrays (like HR + paragraph), cursor goes into the second element (paragraph)
    const firstNodeSize = replacement[0]?.nodeSize || 0;
    newCursorPos = blockStart + firstNodeSize + 1 + cursorOffset;
  } else {
    // For single nodes, use TextSelection.near to find valid position
    // This handles both wrapper blocks (listBlock, blockquote) and standalone (heading)
    const $pos = tr.doc.resolve(blockStart + 1);
    const nearPos = TextSelection.near($pos);
    newCursorPos = nearPos.from + cursorOffset;
  }

  tr.setSelection(TextSelection.create(tr.doc, newCursorPos));

  // ✅ Mark as user edit so it persists
  tr.setMeta('isUserEdit', true);

  view.dispatch(tr);
}

/**
 * Helper attributes that should be preserved when converting blocks
 *
 * 🔒 BLOCK IDENTITY LAW (Phase 2):
 * When a node type changes (paragraph → heading, paragraph → HR, etc.),
 * blockId MUST be regenerated. NEVER preserve blockId across type changes.
 *
 * 🔥 FLAT MODEL (Phase 2):
 * Only preserve indent. No parentBlockId, no level, no parentToggleId.
 * Hierarchy is determined solely by indent values.
 */
export interface PreservedAttrs {
  /** Indent level (0 = root) - ONLY structural attribute preserved */
  indent?: number;
}

/**
 * Helper to create block nodes with optional content preservation
 */
export interface BlockCreator {
  /** Create heading with given level */
  // eslint-disable-next-line no-unused-vars
  heading: (
    schema: any,
    level: 1 | 2 | 3,
    content?: Fragment,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create list block with given type */
  // eslint-disable-next-line no-unused-vars
  listBlock: (
    schema: any,
    listType: 'bullet' | 'numbered' | 'task',
    content?: Fragment,
    checked?: boolean,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create blockquote */
  // eslint-disable-next-line no-unused-vars
  blockquote: (
    schema: any,
    content?: Fragment,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create callout */
  // eslint-disable-next-line no-unused-vars
  callout: (
    schema: any,
    type: 'info' | 'warning' | 'error' | 'success',
    content?: Fragment,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create code block */
  // eslint-disable-next-line no-unused-vars
  codeBlock: (
    schema: any,
    content?: string,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create toggle header (standalone, flat structure) */
  // eslint-disable-next-line no-unused-vars
  toggleBlock: (
    schema: any,
    content?: Fragment,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create paragraph */
  // eslint-disable-next-line no-unused-vars
  paragraph: (
    schema: any,
    content?: Fragment,
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
  /** Create horizontal rule */
  // eslint-disable-next-line no-unused-vars
  horizontalRule: (
    schema: any,
    style: 'plain' | 'wavy',
    preservedAttrs?: PreservedAttrs
  ) => PMNode;
}

/**
 * 🔒 STEP 2C.3: Slash command block creation helpers
 *
 * All helpers follow the Block Creation Law:
 * - Always generate new blockId
 * - Always use indent (flat model)
 * - Never use parentBlockId, level, or parentToggleId
 */
export const createBlock: BlockCreator = {
  heading: (schema, level, content, preservedAttrs) => {
    return schema.nodes.heading.create(
      {
        blockId: crypto.randomUUID(), // 🔒 Always new ID
        indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
        headingLevel: level,
        collapsed: false,
      },
      content
    );
  },

  listBlock: (schema, listType, content, checked = false, preservedAttrs) => {
    return schema.nodes.listBlock.create(
      {
        blockId: crypto.randomUUID(), // 🔒 Always new ID
        indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
        listType,
        checked: listType === 'task' ? checked : null,
        collapsed: false,
      },
      content
    );
  },

  blockquote: (schema, content, preservedAttrs) => {
    return schema.nodes.blockquote.create(
      {
        blockId: crypto.randomUUID(), // 🔒 Always new ID
        indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
        collapsed: false,
      },
      content
    );
  },

  callout: (schema, type, content, preservedAttrs) => {
    return schema.nodes.callout.create(
      {
        blockId: crypto.randomUUID(), // 🔒 Always new ID
        indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
        type,
        collapsed: false,
      },
      content
    );
  },

  codeBlock: (schema, content, preservedAttrs) => {
    const textNode = content ? schema.text(content) : null;
    const attrs = {
      blockId: crypto.randomUUID(), // 🔒 Always new ID
      indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
      collapsed: false,
    };

    return textNode
      ? schema.nodes.codeBlock.create(attrs, textNode)
      : schema.nodes.codeBlock.create(attrs);
  },

  toggleBlock: (schema, content, preservedAttrs) => {
    // toggleBlock is actually a listBlock with listType='toggle' (flat model)
    return schema.nodes.listBlock.create(
      {
        blockId: crypto.randomUUID(), // 🔒 Always new ID
        indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
        listType: 'toggle',
        checked: null,
        collapsed: false,
      },
      content
    );
  },

  paragraph: (schema, content, preservedAttrs) => {
    return schema.nodes.paragraph.create(
      {
        blockId: crypto.randomUUID(), // 🔒 Always new ID
        indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
      },
      content
    );
  },

  horizontalRule: (schema, style, preservedAttrs) => {
    return schema.nodes.horizontalRule.create({
      blockId: crypto.randomUUID(), // 🔒 Always new ID
      indent: preservedAttrs?.indent ?? 0, // 🔥 FLAT MODEL
      style,
      collapsed: false,
    });
  },
};
