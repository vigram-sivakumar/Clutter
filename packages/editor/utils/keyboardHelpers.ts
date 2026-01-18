/**
 * ════════════════════════════════════════════════════════════════
 * KEYBOARD HELPERS - PHASE 2: STRUCTURAL HIERARCHY
 * ════════════════════════════════════════════════════════════════
 *
 * PHASE 2 GOALS:
 * - Tab: Create parent-child relationship (set parentBlockId)
 * - Shift+Tab: Remove/change parent relationship
 * - Move entire subtrees together (children follow parent)
 * - BlockIdGenerator computes level from parentBlockId chain
 *
 * RULES:
 * - Maximum 5 levels of indentation (0-4)
 * - Can only indent under a previous sibling
 * - Can't indent under yourself or your descendants
 * - Children automatically follow when parent moves
 * - Descendants that would exceed max level are auto-detached
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { EnterRules, BackspaceRules } from './keyboardRules';

// ────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────

const DEBUG = true;

// Maximum indent level (0-4 = 5 levels total, for easier testing and better UX)
const MAX_INDENT_LEVEL = 4;

function log(label: string, data?: any) {
  if (DEBUG) {
    
  }
}

// ────────────────────────────────────────────────────────────────
// HELPERS: FIND BLOCKS & RELATIONSHIPS
// ────────────────────────────────────────────────────────────────

/**
 * Find all descendants of a block (children, grandchildren, etc.)
 * Returns blocks that have this block in their parentBlockId chain
 * Recursively walks the entire subtree
 */
function collectDescendants(
  state: any,
  startPos: number,
  ownerBlockId: string
): Array<{ pos: number; node: PMNode }> {
  const descendants: Array<{ pos: number; node: PMNode }> = [];
  const descendantIds = new Set<string>([ownerBlockId]); // Track all IDs in the subtree

  // Keep collecting until no new descendants are found
  let foundNew = true;
  while (foundNew) {
    foundNew = false;

    state.doc.descendants((node: any, pos: number) => {
      // Skip if already processed
      if (node.attrs?.blockId && descendantIds.has(node.attrs.blockId)) {
        return true;
      }

      // Check if this block's parent is in our subtree
      if (node.attrs?.blockId && node.attrs?.parentBlockId) {
        if (descendantIds.has(node.attrs.parentBlockId)) {
          descendants.push({ pos, node });
          descendantIds.add(node.attrs.blockId);
          foundNew = true;
        }
      }

      return true;
    });
  }

  return descendants;
}

/**
 * Find the block to indent under (Notion-style)
 * Returns the closest block before this position that is at the SAME level or LESS deep.
 * You can't become a child of a block that's already deeper than you.
 *
 * Rule: Tab makes you one level deeper than the found block.
 */
function findPreviousBlockForIndent(
  state: any,
  blockPos: number,
  currentLevel: number,
  currentBlockId: string
): { pos: number; node: PMNode } | null {
  const doc = state.doc;
  let found: { pos: number; node: PMNode } | null = null;
  let foundPos = -1;

  const candidates: any[] = [];

  // Walk through document backwards to find the closest valid parent
  doc.descendants((node: any, pos: number) => {
    // Only consider nodes with blockId (top-level blocks)
    if (node.attrs?.blockId) {
      const nodeLevel = node.attrs.level || 0;

      candidates.push({
        pos,
        blockId: node.attrs.blockId.substring(0, 8),
        type: node.type.name,
        level: nodeLevel,
        isCurrent: node.attrs.blockId === currentBlockId,
        isBeforeTarget: pos < blockPos,
        isValidParent: nodeLevel <= currentLevel, // Can only indent under blocks at same level or less
      });

      if (node.attrs.blockId !== currentBlockId && pos < blockPos) {
        // ✅ Only consider blocks at SAME level or LESS deep
        // You can't become a child of a block that's deeper than you
        if (nodeLevel <= currentLevel) {
          // Keep track of the closest one before target
          if (pos > foundPos) {
            found = { pos, node };
            foundPos = pos;
          }
        }
      }
    }

    return true; // Continue walking entire tree
  });

  log('findPreviousBlockForIndent DEBUG', {
    targetPos: blockPos,
    targetBlockId: currentBlockId.substring(0, 8),
    currentLevel,
    candidates,
    foundBlockId: found
      ? ((found as any).node.attrs.blockId as string).substring(0, 8)
      : 'null',
    foundLevel: found ? (found as any).node.attrs.level || 0 : 'null',
    foundPos: foundPos,
  });

  return found;
}

// ────────────────────────────────────────────────────────────────
// PHASE 2: STRUCTURAL INDENT/OUTDENT
// ────────────────────────────────────────────────────────────────

/**
 * PHASE 2: Indent a block (Notion-style)
 *
 * Strategy:
 * 1. Find the closest block above at SAME level or LESS deep
 * 2. Make that block the parent
 * 3. Children automatically follow with their parent
 * 4. BlockIdGenerator updates all levels automatically
 *
 * Example:
 *   1 (level 0)
 *     2 (level 1)
 *       3 (level 2)
 *     4 (level 1) [Tab]
 *       5 (level 2) ← child of 4
 *
 *   After Tab on 4:
 *   1 (level 0)
 *     2 (level 1)
 *       3 (level 2)
 *       4 (level 2) ← indented under 2 (NOT under 3)
 *         5 (level 3) ← followed parent ✅
 *
 * Rules:
 * - Maximum indent level: 4 (levels 0-4 = 5 levels total)
 * - Cannot indent if resulting level would be > 4
 * - Can't become child of a block deeper than you (prevents level skipping)
 * - Children maintain their parent relationship and follow
 * - Descendants exceeding max level are auto-detached as siblings
 * - BlockIdGenerator computes levels based on parent chain
 */
export function indentBlock(
  editor: Editor,
  blockPos: number,
  blockNode: PMNode
): boolean {
  const { state } = editor;
  const { tr } = state;

  const currentBlockId = blockNode.attrs.blockId;
  const currentLevel = blockNode.attrs.level || 0;
  const currentParentId = blockNode.attrs.parentBlockId || null;

  // Count total blocks in document for debugging
  let totalBlocks = 0;
  state.doc.descendants((node: any) => {
    if (node.attrs?.blockId) totalBlocks++;
  });

  log('INDENT START', {
    blockId: currentBlockId?.substring(0, 8),
    type: blockNode.type.name,
    blockPos,
    currentLevel,
    currentParentId: currentParentId?.substring(0, 8) || 'null',
    totalBlocksInDoc: totalBlocks,
  });

  // 1) Find the closest block above that we can indent under
  // (must be at same level or less deep - can't indent under deeper blocks)
  const prevBlock = findPreviousBlockForIndent(
    state,
    blockPos,
    currentLevel,
    currentBlockId
  );

  if (!prevBlock) {
    log('INDENT BLOCKED: No valid parent found', {
      reason:
        totalBlocks === 1
          ? 'Only 1 block in document'
          : 'No block at same/lower level before current position',
      currentLevel,
    });
    return false;
  }

  // ✅ Block above (at same or lower level) becomes the parent
  const newParentId = prevBlock.node.attrs.blockId;
  const parentLevel = prevBlock.node.attrs.level || 0;
  const expectedNewLevel = parentLevel + 1;

  // Check if new level would exceed maximum
  if (expectedNewLevel > MAX_INDENT_LEVEL) {
    log('INDENT BLOCKED: Would exceed maximum indent level', {
      currentLevel,
      parentLevel,
      expectedNewLevel,
      maxLevel: MAX_INDENT_LEVEL,
      reason: `Indenting would create level ${expectedNewLevel}, max is ${MAX_INDENT_LEVEL}`,
    });
    return false;
  }

  log('INDENT: Setting parent', {
    prevBlockId: prevBlock.node.attrs.blockId?.substring(0, 8),
    prevBlockLevel: parentLevel,
    newParentId: newParentId?.substring(0, 8),
    expectedNewLevel: expectedNewLevel,
  });

  // Safety check: can't indent under yourself
  if (newParentId === currentBlockId) {
    log('INDENT BLOCKED: Cannot indent under self');
    return false;
  }

  // Safety check: can't indent under your own descendant
  const descendants = collectDescendants(state, blockPos, currentBlockId);
  const descendantIds = new Set(descendants.map((d) => d.node.attrs.blockId));
  if (descendantIds.has(newParentId)) {
    log('INDENT BLOCKED: Cannot indent under own descendant');
    return false;
  }

  // Calculate level increase for descendants
  const levelIncrease = expectedNewLevel - currentLevel;

  // Check which descendants would exceed the max level and need to be re-parented
  // Strategy: Move each exceeding descendant up ONE level in the parent chain
  const descendantsToReParent: Array<{
    pos: number;
    node: PMNode;
    oldParentId: string;
    newParentId: string;
  }> = [];

  // Build a map of blockId → node for quick parent lookups
  const blockMap = new Map<string, PMNode>();
  state.doc.descendants((node: any) => {
    if (node.attrs?.blockId) {
      blockMap.set(node.attrs.blockId, node);
    }
  });

  for (const desc of descendants) {
    const descCurrentLevel = desc.node.attrs.level || 0;
    const descNewLevel = descCurrentLevel + levelIncrease;

    if (descNewLevel > MAX_INDENT_LEVEL) {
      const oldParentId = desc.node.attrs.parentBlockId;

      // Find the OLD parent's parent (grandparent)
      let newParent = oldParentId;
      if (oldParentId === currentBlockId) {
        // Direct child of the block we're indenting
        // Move it to be sibling of current block (share same parent)
        newParent = newParentId;
      } else {
        // Deeper descendant - move it up to its grandparent
        const oldParentNode = blockMap.get(oldParentId);
        if (oldParentNode?.attrs?.parentBlockId) {
          newParent = oldParentNode.attrs.parentBlockId;
        } else {
          // Old parent is at root or doesn't exist, use current block's parent
          newParent = newParentId;
        }
      }

      descendantsToReParent.push({
        pos: desc.pos,
        node: desc.node,
        oldParentId,
        newParentId: newParent,
      });

      log('INDENT: Descendant would exceed max, will re-parent', {
        descBlockId: desc.node.attrs.blockId?.substring(0, 8),
        descCurrentLevel,
        descNewLevel,
        oldParentId: oldParentId?.substring(0, 8),
        newParentId: newParent?.substring(0, 8),
        maxLevel: MAX_INDENT_LEVEL,
      });
    }
  }

  // 2) Set the new parent for the current block
  // Children keep their parentBlockId pointing to this block
  // They will automatically follow (BlockIdGenerator will update their levels)
  tr.setNodeMarkup(blockPos, undefined, {
    ...blockNode.attrs,
    parentBlockId: newParentId,
  });

  // 3) Re-parent descendants that would exceed the max level
  // Move each one up in the parent chain to maintain relative structure
  if (descendantsToReParent.length > 0) {
    log('INDENT: Auto-re-parenting descendants', {
      count: descendantsToReParent.length,
      details: descendantsToReParent.map((d) => ({
        blockId: d.node.attrs.blockId?.substring(0, 8),
        oldParent: d.oldParentId?.substring(0, 8),
        newParent: d.newParentId?.substring(0, 8),
      })),
    });

    for (const desc of descendantsToReParent) {
      tr.setNodeMarkup(desc.pos, undefined, {
        ...desc.node.attrs,
        parentBlockId: desc.newParentId,
      });
    }
  }

  editor.view.dispatch(tr);

  log('INDENT COMPLETE', {
    descendantsCount: descendants.length,
    reParentedCount: descendantsToReParent.length,
  });

  return true;
}

/**
 * PHASE 2: Outdent a block (move one level out)
 *
 * Strategy:
 * 1. Change parent to grandparent (or null if moving to root)
 * 2. Re-attach all following siblings to the outdented block
 *
 * Example:
 *   Before:
 *     4 (parent)
 *       ├─ 5 (child)
 *       ├─ 6 (child) ← Outdenting this
 *       └─ 7 (child)
 *
 *   After Shift+Tab on 6:
 *     4 (parent)
 *       └─ 5 (child)
 *     6 (outdented)
 *       └─ 7 (re-attached as child of 6) ✅
 *
 * This prevents "orphaned" siblings where a block is visually between
 * a parent and its children but not part of the hierarchy.
 *
 * Direct children of the outdented block keep their parent relationship.
 */
export function outdentBlock(
  editor: Editor,
  blockPos: number,
  blockNode: PMNode
): boolean {
  const { state } = editor;
  const { tr } = state;

  const currentBlockId = blockNode.attrs.blockId;
  const currentParentId = blockNode.attrs.parentBlockId || null;

  log('OUTDENT START', {
    blockId: currentBlockId?.substring(0, 8),
    type: blockNode.type.name,
    currentParentId: currentParentId?.substring(0, 8) || 'null',
  });

  // Can't outdent if already at root
  if (!currentParentId) {
    log('OUTDENT BLOCKED: Already at root (no parent)');
    return false;
  }

  // Find the current parent node
  let parentNode: PMNode | null = null;
  state.doc.descendants((node: any) => {
    if (node.attrs?.blockId === currentParentId) {
      parentNode = node;
      return false; // Stop searching
    }
    return true;
  });

  if (!parentNode) {
    log('OUTDENT: Parent not found, moving to root');
    tr.setNodeMarkup(blockPos, undefined, {
      ...blockNode.attrs,
      parentBlockId: null,
      level: 0, // Root level
    });
    editor.view.dispatch(tr);
    return true;
  }

  // Get parent's parent (grandparent)
  const newParentId = (parentNode as any).attrs.parentBlockId || null;

  // Calculate what the outdented block's NEW level will be
  // When outdenting, we become a sibling of our current parent
  // So our new level = current parent's level
  const parentLevel = (parentNode as any).attrs.level || 0;
  const newLevel = parentLevel;

  // ✅ Find all following siblings (blocks after this one with same parent)
  // These need to be re-attached to the outdented block to maintain tree structure
  const followingSiblings: { pos: number; node: PMNode }[] = [];

  state.doc.descendants((node: any, pos: number) => {
    if (
      node.attrs?.blockId &&
      node.attrs.blockId !== currentBlockId &&
      node.attrs.parentBlockId === currentParentId && // Same parent as current block
      pos > blockPos
    ) {
      // After current block in document order
      followingSiblings.push({ pos, node });
    }
    return true;
  });

  log('OUTDENT: Changing parent', {
    blockId: currentBlockId?.substring(0, 8),
    oldParentId: currentParentId?.substring(0, 8),
    newParentId: newParentId?.substring(0, 8) || 'null',
    newLevel,
    followingSiblings: followingSiblings.length,
  });

  // Set new parent for current block (or null to go to root)
  tr.setNodeMarkup(blockPos, undefined, {
    ...blockNode.attrs,
    parentBlockId: newParentId,
    level: newLevel, // Explicitly set level to avoid timing issues
  });

  // ✅ Re-attach following siblings to the outdented block
  // This prevents "orphaned" siblings that are visually below but structurally above
  // IMPORTANT: We must explicitly set their level to avoid BlockIdGenerator using stale parent level
  const reattachedLevel = newLevel + 1; // One level deeper than the outdented block

  for (const sibling of followingSiblings) {
    tr.setNodeMarkup(sibling.pos, undefined, {
      ...sibling.node.attrs,
      parentBlockId: currentBlockId, // Outdented block becomes their new parent
      level: reattachedLevel, // Explicitly set level based on NEW parent level
    });

    log('OUTDENT: Re-attaching following sibling', {
      siblingId: sibling.node.attrs.blockId?.substring(0, 8),
      newParent: currentBlockId?.substring(0, 8),
      newLevel: reattachedLevel,
    });
  }

  editor.view.dispatch(tr);

  log('OUTDENT COMPLETE', {
    reattachedSiblings: followingSiblings.length,
  });

  return true;
}

// ────────────────────────────────────────────────────────────────
// COMPATIBILITY EXPORTS (Required by other modules)
// ────────────────────────────────────────────────────────────────

/**
 * Create sibling attributes (for Enter key handlers)
 * Phase 2: Copy parent and level from source
 */
export function createSiblingAttrs(sourceAttrs: any): {
  parentBlockId: string | null;
  level: number;
} {
  return {
    parentBlockId: sourceAttrs?.parentBlockId || null,
    level: sourceAttrs?.level ?? 0,
  };
}

/**
 * BLOCK IDENTITY LAW: Get blockId from current ProseMirror selection
 *
 * This is the ONLY legal way to derive blockId for keyboard intents.
 *
 * Rule: Walk up from selection position to find first node with blockId attribute.
 * This ensures the blockId comes from the ACTUAL document state, not cached/stale data.
 *
 * Why this matters:
 * - Engine rebuilds its index from TipTap document on every update
 * - Keyboard rules must derive blockId from the SAME source (ProseMirror state)
 * - Using cached blockIds causes "Block not found" errors
 */
export function getBlockIdFromSelection(state: any): string | null {
  const { selection } = state;

  // Use NodeSelection if present, otherwise use anchor position
  const $from = (selection as any).$from || selection.$anchor;

  // Walk up from cursor depth to find first node with blockId
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.attrs && typeof node.attrs.blockId === 'string') {
      return node.attrs.blockId;
    }
  }

  return null;
}

/**
 * Find an ancestor node by name
 */
export function findAncestorNode(
  editor: Editor,
  nodeName: string | string[]
): { pos: number; node: PMNode; depth: number } | null {
  const { state } = editor;
  const { $from } = state.selection;
  const names = Array.isArray(nodeName) ? nodeName : [nodeName];

  for (let d = $from.depth; d >= 1; d--) {
    const pos = $from.before(d);
    const node = state.doc.nodeAt(pos);
    if (node && names.includes(node.type.name)) {
      return { pos, node, depth: d };
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// EMPTY BLOCK HANDLERS (For Enter key)
// ────────────────────────────────────────────────────────────────

/**
 * Handle Enter in empty block (progressive exit from indentation)
 * Phase 2: Outdent by removing parent relationship
 */
export function handleEmptyBlockInToggle(
  editor: Editor,
  blockPos: number,
  blockNode: PMNode,
  blockName: string
): boolean {
  const hasParent = blockNode.attrs.parentBlockId !== null;

  log('EMPTY BLOCK ENTER', {
    type: blockName,
    hasParent,
  });

  // If has parent, outdent by removing parent
  if (hasParent) {
    return outdentBlock(editor, blockPos, blockNode);
  }

  // At root level, convert to paragraph
  return convertEmptyBlockToParagraph(editor, blockPos, blockNode);
}

/**
 * Convert empty block to paragraph
 * Preserves indentation level and parent relationships
 */
export function convertEmptyBlockToParagraph(
  editor: Editor,
  blockPos: number,
  blockNode: PMNode
): boolean {
  const { state } = editor;
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  log('CONVERT TO PARAGRAPH', {
    from: blockNode.type.name,
    parentBlockId: blockNode.attrs.parentBlockId?.substring(0, 8) || 'null',
    level: blockNode.attrs.level || 0,
  });

  const { tr } = state;

  // ✅ Preserve structural context (level, parentBlockId, parentToggleId)
  const siblingAttrs = createSiblingAttrs(blockNode.attrs);

  const paragraphNode = paragraphType.create({
    blockId: crypto.randomUUID(),
    ...siblingAttrs, // Preserves level, parentBlockId, parentToggleId
  });

  tr.replaceWith(blockPos, blockPos + blockNode.nodeSize, paragraphNode);
  tr.setSelection(TextSelection.create(tr.doc, blockPos + 1));
  editor.view.dispatch(tr);
  return true;
}

/**
 * Insert paragraph after block (preserves current block)
 */
export function insertParagraphAfterBlock(
  editor: Editor,
  blockPos: number,
  blockNode: PMNode
): boolean {
  

  const { state } = editor;
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) {
    
    return false;
  }

  const { tr } = state;
  const afterBlock = blockPos + blockNode.nodeSize;

  

  

  // New paragraph is sibling (same parent and level)
  const newParagraph = paragraphType.create({
    blockId: crypto.randomUUID(),
    level: blockNode.attrs.level || 0,
    parentBlockId: blockNode.attrs.parentBlockId || null,
    parentToggleId: blockNode.attrs.parentToggleId || null,
  });

  
  tr.insert(afterBlock, newParagraph);

  const targetPos = afterBlock + 1;
  const targetSelection = TextSelection.create(tr.doc, targetPos);

  

  tr.setSelection(targetSelection);

  
  editor.view.dispatch(tr);

  // 🔍 Log selection AFTER dispatch (with requestAnimationFrame)
  requestAnimationFrame(() => {
    const sel = editor.state.selection;
    
  });

  return true;
}

// ────────────────────────────────────────────────────────────────
// WRAPPER BLOCK HELPERS (Blockquote, Callout)
// ────────────────────────────────────────────────────────────────

/**
 * Shift+Enter handler (insert hard break)
 */
export function createShiftEnterHandler(nodeName: string) {
  return ({ editor }: { editor: Editor }) => {
    const { state } = editor;
    const { $from } = state.selection;

    for (let d = $from.depth; d >= 1; d--) {
      const node = state.doc.nodeAt($from.before(d));
      if (node && node.type.name === nodeName) {
        return editor.commands.setHardBreak();
      }
    }
    return false;
  };
}

/**
 * Enter handler for wrapper blocks (blockquote, callout)
 */
export function createWrapperEnterHandler(
  wrapperType: 'blockquote' | 'callout'
) {
  return ({ editor }: { editor: Editor }) => {
    const context = EnterRules.getWrapperBlockContext(editor, wrapperType);
    if (!context.inWrapper) return false;

    const { state } = editor;
    const { wrapperPos, wrapperNode, isEmpty, isAtEnd } = context;

    // Empty wrapper: outdent or convert to paragraph
    if (isEmpty) {
      return handleEmptyBlockInToggle(
        editor,
        wrapperPos!,
        wrapperNode!,
        wrapperType
      );
    }

    // At end: create new wrapper at same level
    if (isAtEnd) {
      const { tr } = state;
      const after = wrapperPos! + wrapperNode!.nodeSize;
      const nodeType = state.schema.nodes[wrapperType];
      if (!nodeType) return false;

      tr.insert(
        after,
        nodeType.create({
          ...wrapperNode!.attrs,
          blockId: crypto.randomUUID(),
        })
      );
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      editor.view.dispatch(tr);
      return true;
    }

    // In middle: insert hard break
    return editor.commands.setHardBreak();
  };
}

/**
 * Backspace handler for wrapper blocks
 */
export function createWrapperBackspaceHandler(
  wrapperType: 'blockquote' | 'callout'
) {
  return ({ editor }: { editor: Editor }) => {
    const context = BackspaceRules.getWrapperBlockBackspaceContext(
      editor,
      wrapperType
    );

    if (!context.inWrapper) return false;

    if (context.shouldConvert) {
      return convertEmptyBlockToParagraph(
        editor,
        context.wrapperPos!,
        context.wrapperNode!
      );
    }

    return false;
  };
}
