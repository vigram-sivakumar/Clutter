/**
 * Tab Keymap - Pure ProseMirror structural indentation
 *
 * Direct ProseMirror transaction dispatch (no intents, no resolver, no engine)
 * - Tab changes indent attribute on current block AND its visual subtree
 *
 * Visual Subtree:
 * - The selected block + all following blocks with indent > baseIndent
 * - This maintains flat-list hierarchy semantics
 * - Indent/outdent are perfect inverses
 */

import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { setBlockIndent, MAX_INDENT } from '../../../domain/indentOperations';
import { updateBlockAttrs } from '../../../domain/updateBlockAttrs';
import { withUISafety } from '../withUISafety';

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURAL INVARIANTS (DO NOT VIOLATE)
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. INDENT HIERARCHY: Can only indent to prevBlock.indent + 1
//    - Prevents level skipping (ensures flat list is traversable)
//    - Example: indent 0 can become indent 1, but NOT indent 2
//
// 2. VISUAL SUBTREE: Selected block + all deeper-indented following blocks move together
//    - If parent indents, all children indent with it
//    - Maintains relative hierarchy within subtree
//    - Example: If block at indent 1 indents to 2, its indent-2 child becomes indent 3
//
// 3. AUTO-EXPAND PARENT: If Tab creates a child under collapsed parent → expand parent
//    - Applies to toggles and tasks with collapsed attribute
//    - Only triggers when newIndent === parentIndent + 1 (creating first child)
//    - Prevents invisible children (UX safety)
//
// 4. BOUNDS: Indent capped at MAX_INDENT (8), minimum is 0
//    - Hard limits prevent layout overflow and stack depth issues
//
// 5. HISTORY GROUPING: All indent/outdent operations in one transaction
//    - Undo/Redo affects entire subtree as single unit
//    - Meta: 'historyGroup' = 'indent-block' or 'outdent-block'
//
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dispatch a transaction from keyboard handler
 * User edits are automatically tracked via TipTap's addToHistory mechanism
 */
function dispatchUserEdit(view: any, tr: any): void {
  view.dispatch(tr);
}

/**
 * Handle Tab key - implementation
 * (Wrapped with withUISafety for automatic UI intent handling)
 *
 * @param editor - TipTap editor instance
 * @param isShift - true for Shift+Tab (outdent), false for Tab (indent)
 * @returns true if handled (key consumed), false if should fallback
 */
function handleTabImpl(editor: Editor, isShift: boolean = false): boolean {
  const { state, view } = editor;
  const selection = state.selection;

  let blockPos: number;
  let node: any;

  // ✅ CASE 1: Block / ruler selected
  if (selection instanceof NodeSelection) {
    blockPos = selection.$from.before();
    node = selection.node;
  }

  // ✅ CASE 2: Cursor inside text (existing behavior)
  else if (selection instanceof TextSelection) {
    blockPos = selection.$from.before();
    node = selection.$from.parent;
  }

  // ❌ Anything else → ignore
  else {
    return false;
  }

  if (!node || !node.attrs?.blockId) return false;

  const doc = state.doc;
  const tr = state.tr;

  // Collect all blocks in document order with positions
  const blocks: Array<{
    pos: number;
    node: any;
    indent: number;
    collapsed: boolean;
  }> = [];
  doc.descendants((n: any, pos: number) => {
    if (n.attrs?.blockId) {
      blocks.push({
        pos,
        node: n,
        indent: n.attrs.indent ?? 0,
        collapsed: n.attrs.collapsed ?? false,
      });
    }
    return true;
  });

  // Track visibility using same algorithm as CollapsePlugin
  // This prevents finding hidden children as "prevBlock"
  const isVisible: boolean[] = new Array(blocks.length).fill(true);
  let hiddenIndent: number | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // If we're hiding, check if this block should remain hidden
    if (hiddenIndent !== null && block.indent > hiddenIndent) {
      isVisible[i] = false;
      continue;
    }

    // This block is visible
    // If this block is collapsed, start hiding deeper blocks
    if (block.collapsed) {
      hiddenIndent = block.indent;
    }
    // If we were hiding and this block is at same/less indent, stop hiding
    else if (hiddenIndent !== null && block.indent <= hiddenIndent) {
      hiddenIndent = null;
    }
  }

  // Find the selected block index
  const selectedIndex = blocks.findIndex((b) => b.pos === blockPos);

  if (selectedIndex === -1) return false;

  const selectedBlock = blocks[selectedIndex];
  const baseIndent = selectedBlock.indent;

  // Calculate new indent level
  const delta = isShift ? -1 : 1;
  const newIndent = baseIndent + delta;

  // INDENT VALIDATION: Check constraints
  if (!isShift) {
    // For indent: can only indent to prevBlock.indent + 1
    // This prevents indent jumps and maintains flat list invariant
    // 🔒 FIX: Find last VISIBLE block, not just previous in array
    let prevBlock = null;
    for (let i = selectedIndex - 1; i >= 0; i--) {
      if (isVisible[i]) {
        prevBlock = blocks[i];
        break;
      }
    }
    const maxAllowedIndent = prevBlock ? prevBlock.indent + 1 : 0;

    if (newIndent > maxAllowedIndent) {
      // 🔒 GOLDEN RULE: Don't consume without action - let default behavior run
      return false;
    }

    // Hard cap at MAX_INDENT
    if (newIndent > MAX_INDENT) {
      // 🔒 GOLDEN RULE: Don't consume without action - let default behavior run
      return false;
    }
  } else {
    // For outdent: minimum is 0
    if (newIndent < 0) {
      // 🔒 GOLDEN RULE: Don't consume without action - let default behavior run
      return false;
    }
  }

  // RANGE DETECTION: Find visual subtree
  // Collect the selected block + all following blocks with indent > baseIndent
  // This is the "visual subtree" that moves with the selected block
  const affectedRange = [selectedIndex];

  for (let i = selectedIndex + 1; i < blocks.length; i++) {
    if (blocks[i].indent > baseIndent) {
      affectedRange.push(i);
    } else {
      break; // Stop at first block not deeper than base
    }
  }

  // RANGE MUTATION: Apply indent delta to all affected blocks
  for (const index of affectedRange) {
    const block = blocks[index];
    const blockNewIndent = block.indent + delta;

    // Use centralized indent operation (auto-clamps)
    setBlockIndent(tr, block.pos, blockNewIndent, { clamp: true });
  }

  // AUTO-EXPAND COLLAPSED PARENT: When indenting creates a new parent-child relationship
  // 🔒 CORRECTNESS: Find last VISIBLE block (skip hidden children)
  // This ensures we expand the actual parent, not a hidden sibling
  let prevVisibleBlock = null;
  for (let i = selectedIndex - 1; i >= 0; i--) {
    if (isVisible[i]) {
      prevVisibleBlock = blocks[i];
      break;
    }
  }

  if (
    prevVisibleBlock &&
    !isShift &&
    newIndent === prevVisibleBlock.indent + 1
  ) {
    const isCollapsed = prevVisibleBlock.node.attrs?.collapsed === true;
    const isToggleOrTask =
      prevVisibleBlock.node.type.name === 'listBlock' &&
      (prevVisibleBlock.node.attrs.listType === 'toggle' ||
        prevVisibleBlock.node.attrs.listType === 'task');

    // If parent is collapsed toggle/task, expand it
    if (isCollapsed && isToggleOrTask) {
      updateBlockAttrs(tr, prevVisibleBlock.pos, {
        collapsed: false,
      });
    }
  }

  // HISTORY GROUPING: Mark as single undo step
  tr.setMeta('addToHistory', true);
  tr.setMeta('historyGroup', isShift ? 'outdent-block' : 'indent-block');

  // 🔒 CRITICAL: Recreate selection at same position using NEW document
  // After attribute changes, state.selection points to OLD document
  // Use TextSelection.near() for safety - guarantees valid text position after structural mutations
  // 🔒 SELECTION SAFETY: Always use TextSelection.near() after mutations
  // NodeSelection.create() is unsafe after setBlockIndent() because:
  // - selection.from may no longer point to a node boundary
  // - Document structure changed, positions may have shifted
  // - TextSelection.near() guarantees valid position (matches Enter/Backspace)
  tr.setSelection(TextSelection.near(tr.doc.resolve(selection.from), 1));

  // Apply transaction
  dispatchUserEdit(view, tr);
  return true; // Key consumed
}

/**
 * Handle Tab key (with Shift+Tab support)
 *
 * 🔒 WRAPPED WITH UI SAFETY:
 * - Automatically defers to UI handlers (slash commands, mentions, etc.)
 * - Returns false when UI is active, true when structural edit applied
 * - See withUISafety wrapper for enforcement details
 */
export const handleTab = withUISafety(handleTabImpl, 'handleTab');
