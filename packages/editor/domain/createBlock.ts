/**
 * createBlock() - SINGLE SOURCE OF TRUTH FOR BLOCK CREATION
 *
 * 🔒 ARCHITECTURAL LAW:
 * ALL block creation MUST go through this function.
 * No exceptions. No "just for this rule." No "temporary."
 *
 * Why this exists:
 * - Centralizes blockId generation (ALWAYS assigned, never null)
 * - Centralizes indent handling (flat model)
 * - Centralizes default attributes
 * - Makes block creation bugs structurally impossible
 * - Makes audit/logging/metrics possible
 *
 * Mental Model:
 * User intent (Enter/Tab/Slash/Paste)
 *   ↓
 * Intent resolver
 *   ↓
 * createBlock() ← YOU ARE HERE
 *   ↓
 * ProseMirror transaction / TipTap command
 */

import type { Node as PMNode, Fragment, Schema } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/core';

/**
 * All block-level node types that require blockId
 */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'listBlock'
  | 'blockquote'
  | 'callout'
  | 'codeBlock'
  | 'horizontalRule';

/**
 * Type-specific attributes for each block type
 */
export type BlockTypeAttrs = {
  paragraph: {
    tags?: string[];
  };
  heading: {
    headingLevel: 1 | 2 | 3;
  };
  listBlock: {
    listType: 'bullet' | 'numbered' | 'task' | 'toggle';
    checked?: boolean | null;
  };
  blockquote: Record<string, never>;
  callout: {
    type: 'info' | 'warning' | 'error' | 'success';
  };
  codeBlock: {
    language?: string;
  };
  horizontalRule: {
    style?: 'plain' | 'wavy';
    fullWidth?: boolean;
    color?: string;
  };
};

/**
 * Options for creating a block
 */
export type CreateBlockOptions<T extends BlockType> = {
  /** Block type to create */
  type: T;

  /** Indent level (default: 0) */
  indent?: number;

  /** Optional content (Fragment for ProseMirror, JSONContent[] for TipTap) */
  content?: Fragment | JSONContent[] | string;
} & BlockTypeAttrs[T];

/**
 * Create a block as JSON (for TipTap commands: insertContentAt, setContent, etc.)
 *
 * @example
 * ```ts
 * // Create a paragraph
 * const para = createBlockJSON({ type: 'paragraph' });
 *
 * // Create a heading with level 2
 * const h2 = createBlockJSON({ type: 'heading', headingLevel: 2, indent: 1 });
 *
 * // Create a task list item
 * const task = createBlockJSON({
 *   type: 'listBlock',
 *   listType: 'task',
 *   checked: false
 * });
 * ```
 */
export function createBlockJSON<T extends BlockType>(
  options: CreateBlockOptions<T>
): JSONContent {
  const { type, indent = 0, content, ...typeSpecificAttrs } = options;

  // 🔒 BLOCK IDENTITY LAW: blockId is ALWAYS assigned here
  // No caller can override or omit it
  const baseAttrs = {
    blockId: crypto.randomUUID(),
    indent,
    collapsed: false,
  };

  // Build type-specific attrs
  const attrs: Record<string, any> = { ...baseAttrs };

  switch (type) {
    case 'paragraph':
      attrs.tags =
        (typeSpecificAttrs as BlockTypeAttrs['paragraph']).tags || [];
      break;

    case 'heading':
      attrs.headingLevel =
        (typeSpecificAttrs as BlockTypeAttrs['heading']).headingLevel || 1;
      break;

    case 'listBlock': {
      const listAttrs = typeSpecificAttrs as BlockTypeAttrs['listBlock'];
      attrs.listType = listAttrs.listType;
      attrs.checked =
        listAttrs.listType === 'task' ? (listAttrs.checked ?? false) : null;
      break;
    }

    case 'callout':
      attrs.type =
        (typeSpecificAttrs as BlockTypeAttrs['callout']).type || 'info';
      break;

    case 'codeBlock':
      if ((typeSpecificAttrs as BlockTypeAttrs['codeBlock']).language) {
        attrs.language = (
          typeSpecificAttrs as BlockTypeAttrs['codeBlock']
        ).language;
      }
      break;

    case 'horizontalRule': {
      const hrAttrs = typeSpecificAttrs as BlockTypeAttrs['horizontalRule'];
      if (hrAttrs.style) attrs.style = hrAttrs.style;
      if (hrAttrs.fullWidth !== undefined) attrs.fullWidth = hrAttrs.fullWidth;
      if (hrAttrs.color) attrs.color = hrAttrs.color;
      break;
    }

    case 'blockquote':
      // No type-specific attrs
      break;
  }

  // Build content array
  let jsonContent: JSONContent[] = [];
  if (content) {
    if (typeof content === 'string') {
      // Text content for code blocks
      jsonContent = [{ type: 'text', text: content }];
    } else if (Array.isArray(content)) {
      // Already JSONContent[]
      jsonContent = content;
    }
    // Fragment is not supported in JSON mode
  }

  return {
    type,
    attrs,
    content: jsonContent.length > 0 ? jsonContent : undefined,
  };
}

/**
 * Create a block as ProseMirror Node (for direct transaction manipulation)
 *
 * @example
 * ```ts
 * // Create a paragraph node
 * const para = createBlockNode(schema, { type: 'paragraph' });
 *
 * // Create a heading with content
 * const h2 = createBlockNode(schema, {
 *   type: 'heading',
 *   headingLevel: 2,
 *   content: existingFragment
 * });
 * ```
 */
export function createBlockNode<T extends BlockType>(
  schema: Schema,
  options: CreateBlockOptions<T>
): PMNode {
  const { type, indent = 0, content, ...typeSpecificAttrs } = options;

  const nodeType = schema.nodes[type];
  if (!nodeType) {
    throw new Error(`[createBlock] Unknown block type: ${type}`);
  }

  // 🔒 BLOCK IDENTITY LAW: blockId is ALWAYS assigned here
  const baseAttrs = {
    blockId: crypto.randomUUID(),
    indent,
    collapsed: false,
  };

  // Build type-specific attrs
  const attrs: Record<string, any> = { ...baseAttrs };

  switch (type) {
    case 'paragraph':
      attrs.tags =
        (typeSpecificAttrs as BlockTypeAttrs['paragraph']).tags || [];
      break;

    case 'heading':
      attrs.headingLevel =
        (typeSpecificAttrs as BlockTypeAttrs['heading']).headingLevel || 1;
      break;

    case 'listBlock': {
      const listAttrs = typeSpecificAttrs as BlockTypeAttrs['listBlock'];
      attrs.listType = listAttrs.listType;
      attrs.checked =
        listAttrs.listType === 'task' ? (listAttrs.checked ?? false) : null;
      break;
    }

    case 'callout':
      attrs.type =
        (typeSpecificAttrs as BlockTypeAttrs['callout']).type || 'info';
      break;

    case 'codeBlock':
      if ((typeSpecificAttrs as BlockTypeAttrs['codeBlock']).language) {
        attrs.language = (
          typeSpecificAttrs as BlockTypeAttrs['codeBlock']
        ).language;
      }
      break;

    case 'horizontalRule': {
      const hrAttrs = typeSpecificAttrs as BlockTypeAttrs['horizontalRule'];
      if (hrAttrs.style) attrs.style = hrAttrs.style;
      if (hrAttrs.fullWidth !== undefined) attrs.fullWidth = hrAttrs.fullWidth;
      if (hrAttrs.color) attrs.color = hrAttrs.color;
      break;
    }

    case 'blockquote':
      // No type-specific attrs
      break;
  }

  // Handle content
  let nodeContent: Fragment | string | undefined;

  if (content) {
    if (typeof content === 'string' && type === 'codeBlock') {
      // Code blocks take text content directly
      nodeContent = schema.text(content);
    } else if (typeof content === 'object' && 'content' in content) {
      // Fragment
      nodeContent = content as Fragment;
    }
  }

  return nodeType.create(attrs, nodeContent);
}

/**
 * Create a block with dynamic type (for clipboard, etc.)
 * This bypasses type safety but ensures blockId assignment
 *
 * @param schema - ProseMirror schema
 * @param type - Block type name (string)
 * @param attrs - Attributes (must not include blockId)
 * @param content - Optional content
 * @returns ProseMirror Node
 */
export function createBlockNodeDynamic(
  schema: Schema,
  type: string,
  attrs: Record<string, any>,
  content?: Fragment | string
): PMNode {
  const nodeType = schema.nodes[type];
  if (!nodeType) {
    throw new Error(`[createBlockDynamic] Unknown block type: ${type}`);
  }

  // 🔒 BLOCK IDENTITY LAW: Always assign blockId
  const fullAttrs = {
    blockId: crypto.randomUUID(),
    indent: attrs.indent ?? 0,
    collapsed: attrs.collapsed ?? false,
    ...attrs,
  };

  // Handle content
  let nodeContent: Fragment | string | undefined;
  if (content) {
    if (typeof content === 'string' && type === 'codeBlock') {
      nodeContent = schema.text(content);
    } else if (typeof content === 'object' && 'content' in content) {
      nodeContent = content as Fragment;
    }
  }

  return nodeType.create(fullAttrs, nodeContent);
}

/**
 * Create clean block attributes for cloning/duplicating existing blocks
 *
 * Use this when you need to create a NEW block based on an existing block's
 * attributes, but want to:
 * - Generate a NEW blockId (for the new block)
 * - Whitelist only essential structural attributes
 * - Prevent state leakage (e.g., collapsed, checked)
 *
 * 🔒 BLOCK IDENTITY LAW:
 * This function ALWAYS generates a new blockId. Never use this to UPDATE
 * an existing block's attributes. For updates, use updateBlockAttrs().
 *
 * @param sourceNode - Existing block node to copy attributes from
 * @param indent - Indent level for the new block
 * @returns Clean attrs object with new blockId and whitelisted properties
 *
 * @example
 * ```ts
 * // Create sibling below current block
 * const cleanAttrs = createCleanBlockAttrs(node, node.attrs.indent);
 * tr.insert(pos, node.type.create(cleanAttrs));
 * ```
 */
export function createCleanBlockAttrs(
  sourceNode: PMNode,
  indent: number
): Record<string, any> {
  const attrs: Record<string, any> = {
    blockId: crypto.randomUUID(), // Always new ID for new block
    indent,
  };

  // Whitelist: only copy if present on source node
  if (sourceNode.attrs.listType !== undefined) {
    attrs.listType = sourceNode.attrs.listType;
  }

  if (sourceNode.attrs.calloutType !== undefined) {
    attrs.calloutType = sourceNode.attrs.calloutType;
  }

  return attrs;
}

/**
 * Validation helper: Assert all blocks in a document have blockIds
 * (Development-only guard)
 */
export function assertAllBlocksHaveIds(doc: JSONContent): void {
  if (process.env.NODE_ENV === 'production') return;

  const blockTypes: BlockType[] = [
    'paragraph',
    'heading',
    'listBlock',
    'blockquote',
    'callout',
    'codeBlock',
    'horizontalRule',
  ];

  function checkNode(node: JSONContent, path: string = 'root') {
    if (node.type && blockTypes.includes(node.type as BlockType)) {
      if (!node.attrs?.blockId) {
        throw new Error(
          `[INVARIANT VIOLATION] Block without blockId at ${path}: ${node.type}`
        );
      }
      if (node.attrs.blockId === null || node.attrs.blockId === '') {
        throw new Error(
          `[INVARIANT VIOLATION] Block with null/empty blockId at ${path}: ${node.type}`
        );
      }
    }

    if (node.content && Array.isArray(node.content)) {
      node.content.forEach((child, index) => {
        checkNode(child, `${path}.content[${index}]`);
      });
    }
  }

  checkNode(doc);
}
