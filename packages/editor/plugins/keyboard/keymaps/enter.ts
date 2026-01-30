/**
 * Enter Keymap - Pure ProseMirror structural block creation
 *
 * Direct ProseMirror transaction dispatch (no intents, no resolver, no engine)
 * - Enter creates blocks based on cursor position and hierarchy
 *
 * Phase 2 Implementation (Complete):
 * Execution Order (strict):
 * 1. Selection collapsed check
 * 2. CodeBlock delegation
 * 3. EMPTY BLOCK rules (collapse, outdent, normalize, exit)
 * 4. START → sibling above
 * 5. END → child or sibling
 * 6. MIDDLE → split
 */

import { Editor } from '@tiptap/core';
import { TextSelection } from 'prosemirror-state';
import {
  createBlockNode,
  createCleanBlockAttrs,
} from '../../../domain/createBlock';
import { updateBlockAttrs } from '../../../domain/updateBlockAttrs';
import { withUISafety } from '../withUISafety';

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURAL INVARIANTS (DO NOT VIOLATE)
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. END OF BLOCK RULE (Universal, applies to ALL block types):
//    - If block has children (next block indent > current) → create CHILD
//    - If block has no children → create SIBLING
//    - This is STRUCTURE-BASED, not type-based
//    - Indent defines hierarchy, not node type
//
// 2. TOGGLE EXCEPTION (Localized to insertFirstChild):
//    - Toggles always create PARAGRAPH children, not toggle children
//    - This prevents infinite toggle nesting
//    - Applied only in insertFirstChild helper, not in main logic
//
// 3. EMPTY BLOCK SEQUENCE (Two-step process):
//    - First Enter: Outdent (if indent > 0)
//    - Second Enter: Convert to paragraph (if indent === 0 and not paragraph)
//    - Outdent and type conversion require separate key presses
//
// 4. CONTAINER DETECTION (Type-based, not attribute-based):
//    - Container = listBlock with listType 'toggle' or 'task'
//    - NOT based on presence of 'collapsed' attribute
//    - Prevents paragraphs from being misclassified as containers
//
// 5. ATTRIBUTE LEAKAGE PREVENTION:
//    - Use createCleanBlockAttrs (domain/createBlock) for cloning existing blocks
//    - Use createBlockNode (domain/createBlock) for creating from scratch
//    - Whitelist only: blockId, indent, listType, calloutType
//    - Never copy: collapsed, checked, or any transient state attributes
//
// 6. CURSOR POSITION SEMANTICS:
//    - START (offset === 0): Insert sibling ABOVE
//    - END (offset === content.size): Check children, then insert child/sibling
//    - MIDDLE (0 < offset < size): Split block, preserve indent
//
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// 🔒 PROSEMIRROR POSITION MAPPING GOLDEN RULE
// ═══════════════════════════════════════════════════
//
// When to MAP positions:
//   ✅ DELETE → compute pos → MAP → use mapped pos
//   ✅ Any mutation (setNodeMarkup, replaceWith) → MAP
//
// When NOT to MAP:
//   ❌ INSERT at pos → use pos directly (pos + 1 for cursor)
//
// Rule: Mapping is ONLY for positions that existed BEFORE a mutation
// Never map the insertion point itself after tr.insert()
//
// ═══════════════════════════════════════════════════

/**
 * Dispatch a transaction from keyboard handler
 * User edits are automatically tracked via TipTap's addToHistory mechanism
 */
function dispatchUserEdit(view: any, tr: any): void {
  view.dispatch(tr);
}

/**
 * Find the position after the entire subtree of a block
 * (including all children, visible or hidden)
 *
 * @param state - ProseMirror state
 * @param blockPos - Position before the parent block
 * @param blockIndent - Indent level of the parent block
 * @returns Position after the last descendant
 */
function getSubtreeEndPosition(
  state: Editor['state'],
  blockPos: number,
  blockIndent: number
): number {
  const doc = state.doc;
  let pos = blockPos;

  const blockNode = doc.nodeAt(blockPos);
  if (!blockNode) return blockPos + 1;

  // Start after the parent block
  pos = blockPos + blockNode.nodeSize;

  // Walk forward through document using correct boundary
  while (pos < doc.nodeSize - 2) {
    const resolved = doc.resolve(pos);
    const nextNode = resolved.nodeAfter;
    if (!nextNode) break;

    const nextIndent = nextNode.attrs?.indent ?? 0;

    // Stop if next block is at same level or lower (not a child)
    if (nextIndent <= blockIndent) break;

    // This node is a child, skip over it
    pos += nextNode.nodeSize;
  }

  return pos;
}

/**
 * Insert a new sibling block above the current block
 * Depth-safe for first block in document
 */
function insertSiblingAbove(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const node = $from.parent;
  const tr = state.tr;

  // Use depth-safe position calculation
  const insertPos = $from.before($from.depth);

  const newNode = node.type.create(
    createCleanBlockAttrs(node, node.attrs.indent ?? 0)
  );
  tr.insert(insertPos, newNode);

  // 🔒 GOLDEN RULE: After tr.insert(), use position directly (don't map)
  // insertPos is the insertion point - mapping it would shift it incorrectly
  // Use TextSelection.near() for safety - guarantees valid text position
  const cursorPos = insertPos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos), 1));

  dispatchUserEdit(view, tr);
  return true;
}

/**
 * Insert a new sibling block below the current block
 * Inserts AFTER the entire subtree (including hidden children)
 */
function insertSiblingBelow(editor: Editor, indent: number): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const node = $from.parent;
  const tr = state.tr;

  // Find position after the entire subtree
  const blockPos = $from.before();
  const insertPos = getSubtreeEndPosition(state, blockPos, indent);

  const newNode = node.type.create(createCleanBlockAttrs(node, indent));
  tr.insert(insertPos, newNode);

  // 🔒 GOLDEN RULE: After tr.insert(), use position directly (don't map)
  // insertPos is the insertion point - mapping it would shift it incorrectly
  // Use TextSelection.near() for safety - guarantees valid text position
  const cursorPos = insertPos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos), 1));

  dispatchUserEdit(view, tr);
  return true;
}

/**
 * Insert a first child block (indent + 1)
 * Inserts immediately after parent, before any existing children
 *
 * TOGGLE EXCEPTION: Toggles always create paragraph children, not toggle children
 */
function insertFirstChild(editor: Editor, parentIndent: number): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const node = $from.parent;
  const tr = state.tr;

  // 🔒 STRUCTURALLY SAFE: Insert right after parent, before any children
  // Use nodeAt() to get actual node size from document, not $from.parent
  const blockPos = $from.before();
  const insertPos = blockPos + state.doc.nodeAt(blockPos)!.nodeSize;

  // Check if parent is a toggle
  const isToggle =
    node.type.name === 'listBlock' && node.attrs.listType === 'toggle';

  if (isToggle) {
    // TOGGLE EXCEPTION: Always create paragraph child
    // Use unified block creation function
    const paragraphNode = createBlockNode(state.schema, {
      type: 'paragraph',
      indent: parentIndent + 1,
      tags: [],
    });
    tr.insert(insertPos, paragraphNode);
  } else {
    // All other blocks: clone parent type
    tr.insert(
      insertPos,
      node.type.create(createCleanBlockAttrs(node, parentIndent + 1))
    );
  }

  // 🔒 GOLDEN RULE: After tr.insert(), use position directly (don't map)
  // insertPos is the insertion point - mapping it would shift it incorrectly
  // Use TextSelection.near() for safety - guarantees valid text position
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1), 1));
  dispatchUserEdit(view, tr);
  return true;
}

// ═══════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════

/**
 * Handle Enter key press - implementation
 * (Wrapped with withUISafety for automatic UI intent handling)
 */
function handleEnterImpl(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;

  // 1️⃣ Only handle collapsed cursor
  if (!selection.empty) return false;

  // 2️⃣ Let CodeBlock handle Enter
  if (editor.isActive('codeBlock')) return false;

  const { $from } = selection;
  const node = $from.parent;

  if (!node || !node.attrs) return false;

  const indent = node.attrs.indent ?? 0;
  const isEmpty = node.content.size === 0;
  const atStart = $from.parentOffset === 0;
  const atEnd = $from.parentOffset === node.content.size;

  const nodeType = node.type.name;
  const isContainer =
    node.type.name === 'listBlock' &&
    (node.attrs.listType === 'toggle' || node.attrs.listType === 'task');
  const isExpandedContainer = isContainer && node.attrs.collapsed === false;
  const isCollapsedContainer = isContainer && node.attrs.collapsed === true;

  // Check if this block has children (next block has higher indent)
  // 🔒 OPTIMIZATION: O(1) check using resolve instead of O(n) document traversal
  // Uses flat-list semantics: next node at higher indent = child
  const hasChildren = (() => {
    try {
      const $after = state.doc.resolve($from.after());
      const nextNode = $after.nodeAfter;
      return !!(nextNode && (nextNode.attrs?.indent ?? 0) > indent);
    } catch {
      // Resolve failed (at document boundary)
      return false;
    }
  })();

  // ─────────────────────────────────────────────
  // EMPTY BLOCK CHECKS (must come BEFORE start/end)
  // ─────────────────────────────────────────────

  if (isEmpty) {
    // 3️⃣ EMPTY BLOCK + INDENTED → OUTDENT (ALWAYS FIRST)
    // 🔒 INVARIANT: Empty blocks ALWAYS normalize (outdent) before creating structure
    // This enforces the two-step normalization rule regardless of cursor position
    if (indent > 0) {
      const tr = state.tr;

      // 🔒 CRITICAL: Only pass changed attributes (indent), not full attrs with blockId
      // updateBlockAttrs() rejects blockId changes to preserve block identity
      updateBlockAttrs(tr, $from.before(), { indent: indent - 1 });

      // ✅ FIX: Map position after attribute change, use TextSelection.near() for safety
      const mappedPos = tr.mapping.map($from.pos);
      tr.setSelection(TextSelection.near(tr.doc.resolve(mappedPos), 1));
      dispatchUserEdit(view, tr);
      return true;
    }

    // 4️⃣ EMPTY CALLOUT / BLOCKQUOTE → EXIT CONTAINER
    if (nodeType === 'callout' || nodeType === 'blockquote') {
      const tr = state.tr;
      const pos = $from.before();

      // Use node.nodeSize for exact replacement range
      // 🔒 CRITICAL: Use createBlockNode to ensure blockId is assigned at creation
      // Never rely on BlockIdGenerator as primary mechanism (architectural violation)
      tr.replaceWith(
        pos,
        pos + node.nodeSize,
        createBlockNode(state.schema, {
          type: 'paragraph',
          indent,
        })
      );

      // 🔒 GOLDEN RULE: After replaceWith(), map the position
      // replaceWith mutates the document, so old positions must be mapped
      // Use TextSelection.near() for safety - guarantees valid text position
      const mappedPos = tr.mapping.map(pos);
      tr.setSelection(TextSelection.near(tr.doc.resolve(mappedPos + 1), 1));
      dispatchUserEdit(view, tr);
      return true;
    }

    // 5️⃣ EMPTY BLOCK AT ROOT (indent 0) → CONVERT TO PARAGRAPH
    // 🔒 CRITICAL: This MUST run BEFORE sibling insertion
    // UX rule: Normalize type before creating structure
    // Empty task/toggle/heading → paragraph, THEN sibling on next Enter
    if (indent === 0 && nodeType !== 'paragraph') {
      const tr = state.tr;

      // 🔒 CRITICAL: Preserve existing blockId and createdAt when converting node type
      // createCleanBlockAttrs() generates NEW blockId (for new blocks only!)
      // When converting existing block, must preserve identity and creation timestamp
      const cleanAttrs = {
        blockId: node.attrs.blockId, // Preserve existing ID
        createdAt: node.attrs.createdAt, // Preserve creation timestamp
        indent: 0,
      };

      // ⚠️ EXCEPTION: Direct setNodeMarkup allowed here for node type conversion
      // updateBlockAttrs() doesn't support changing node types (paragraph → heading, etc.)
      tr.setNodeMarkup(
        $from.before(),
        state.schema.nodes.paragraph,
        cleanAttrs
      );

      // ✅ FIX: Map position after setNodeMarkup, use TextSelection.near() for safety
      const mappedPos = tr.mapping.map($from.pos);
      tr.setSelection(TextSelection.near(tr.doc.resolve(mappedPos), 1));
      dispatchUserEdit(view, tr);
      return true;
    }

    // 6️⃣ EMPTY PARAGRAPH AT ROOT → INSERT SIBLING BELOW
    // This runs AFTER conversion, so empty task → para → sibling (two Enter presses)
    // Matches Notion/Linear behavior: normalize before creating structure
    if (indent === 0 && (atStart || atEnd)) {
      return insertSiblingBelow(editor, indent);
    }
  }

  // ─────────────────────────────────────────────
  // NON-EMPTY BLOCK RULES (structure creation OK)
  // ─────────────────────────────────────────────

  // 7️⃣ NON-EMPTY CHILD AT END → CREATE SIBLING
  // UX: Continue writing at same level instead of forcing outdent
  // Empty children always outdent first (handled above in rule 3)
  if (indent > 0 && atEnd && node.content.size > 0) {
    return insertSiblingBelow(editor, indent);
  }

  // ─────────────────────────────────────────────
  // 🔒 COMPUTE POSITION ONCE (before any mutations)
  // ─────────────────────────────────────────────
  const isListBlock = nodeType === 'listBlock';
  const isToggle = isListBlock && node.attrs.listType === 'toggle';
  const inMiddle = !atStart && !atEnd;

  // ═══════════════════════════════════════════════════════════════════
  // MIDDLE SPLIT (AUTHORITATIVE - runs BEFORE START/END helpers)
  // ═══════════════════════════════════════════════════════════════════
  // 🔒 ARCHITECTURAL RULE: Middle-split is single owner
  // START/END helpers only run if cursor is definitively at edges
  // This prevents offset drift after delete from triggering wrong helpers
  // ═══════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────
  // 8️⃣ TOGGLE MIDDLE → PARAGRAPH CHILD WITH TEXT MOVE
  // ─────────────────────────────────────────────
  // 🔒 ARCHITECTURAL BOUNDARY: Toggle owns middle-split completely
  // This handler is the SINGLE AUTHORITY for toggle middle splits
  // Generic middle-split logic (below) never applies to toggles
  // DO NOT let toggle logic drift into generic logic
  if (isToggle && inMiddle) {
    const tr = state.tr;

    // Text after cursor
    const after = node.content.cut($from.parentOffset);

    // 🎯 UX RULE: Insert position depends on collapsed state (same as generic split)
    // - Collapsed with children → insert after subtree (sibling)
    // - Expanded or no children → insert as first child
    const isCollapsed = node.attrs.collapsed === true;
    const blockPos = $from.before();

    // 🔒 POSITION INVARIANT: Compute position BEFORE mutation
    // Then map it after delete to maintain validity
    const insertPos =
      isCollapsed && hasChildren
        ? getSubtreeEndPosition(state, blockPos, indent)
        : $from.after();

    // Remove text after cursor from toggle
    const from = $from.before() + 1 + $from.parentOffset;
    const to = $from.after() - 1;
    tr.delete(from, to);

    // Map position to new document after delete
    const mappedInsertPos = tr.mapping.map(insertPos);

    // Compute correct indent based on position semantics
    const newIndent = isCollapsed && hasChildren ? indent : indent + 1;

    // Insert paragraph child
    // 🔒 CRITICAL: Use createBlockNode to ensure blockId is assigned at creation
    // Consistent with insertFirstChild (line 239) which also uses createBlockNode
    tr.insert(
      mappedInsertPos,
      createBlockNode(state.schema, {
        type: 'paragraph',
        indent: newIndent,
        content: after,
      })
    );

    // Cursor into paragraph (use mapped position)
    // Use TextSelection.near() for safety - guarantees valid text position
    tr.setSelection(TextSelection.near(tr.doc.resolve(mappedInsertPos + 1), 1));

    // ✅ FIX: Use dispatchUserEdit for consistency
    dispatchUserEdit(view, tr);
    return true;
  }

  // ─────────────────────────────────────────────
  // 9️⃣ GENERIC MIDDLE SPLIT (non-toggle blocks)
  // ─────────────────────────────────────────────
  if (inMiddle) {
    const tr = state.tr;

    // Text after cursor
    const after = node.content.cut($from.parentOffset);

    // 🎯 UX RULE: Insert position depends on collapsed state
    // - Collapsed with children → insert after subtree (sibling, visible)
    // - Expanded with children → insert as first child (above existing children)
    // - No children → insert right after parent (same in both cases)
    const isCollapsed = node.attrs.collapsed === true;
    const blockPos = $from.before();

    // 🔒 POSITION INVARIANT: Compute position BEFORE mutation
    // Then map it after delete to maintain validity
    let insertPos: number;
    if (isCollapsed && hasChildren) {
      // Collapsed → split becomes sibling (user can't see children)
      insertPos = getSubtreeEndPosition(state, blockPos, indent);
    } else {
      // Expanded or no children → split goes right after parent
      insertPos = $from.after();
    }

    // Remove text after cursor from current node
    const from = $from.before() + 1 + $from.parentOffset;
    const to = $from.after() - 1;
    tr.delete(from, to);

    // Map position to new document after delete
    const mappedInsertPos = tr.mapping.map(insertPos);

    // Compute correct indent based on position semantics
    // Expanded + children → first child (indent + 1)
    // Collapsed + children → sibling (indent)
    // No children → sibling (indent)
    const newIndent = !isCollapsed && hasChildren ? indent + 1 : indent;

    // Insert new block with remaining content
    tr.insert(
      mappedInsertPos,
      node.type.create(createCleanBlockAttrs(node, newIndent), after)
    );

    // Use TextSelection.near() for safety - guarantees valid text position
    tr.setSelection(TextSelection.near(tr.doc.resolve(mappedInsertPos + 1), 1));
    // ✅ FIX: Use dispatchUserEdit instead of manual meta + dispatch
    dispatchUserEdit(view, tr);

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // START/END HELPERS (only run if NOT middle)
  // ═══════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────
  // 🔟 START OF BLOCK → insert sibling ABOVE
  // ─────────────────────────────────────────────
  if (atStart) {
    return insertSiblingAbove(editor);
  }

  // ─────────────────────────────────────────────
  // 1️⃣1️⃣ END OF BLOCK
  // ─────────────────────────────────────────────
  if (atEnd) {
    const isToggle =
      node.type.name === 'listBlock' && node.attrs.listType === 'toggle';

    // ✅ COLLAPSED CONTAINER RULE:
    // If collapsed with children → create sibling AFTER subtree
    // UX: User can't see children, so Enter should continue at same level
    if (isCollapsedContainer && hasChildren) {
      return insertSiblingBelow(editor, indent);
    }

    // ✅ TOGGLE RULE:
    // Expanded toggles ALWAYS create a child
    if (isToggle && isExpandedContainer) {
      return insertFirstChild(editor, indent);
    }

    // ✅ UNIVERSAL STRUCTURAL RULE:
    // Any block that already has children → create child
    if (hasChildren) {
      return insertFirstChild(editor, indent);
    }

    // ✅ DEFAULT:
    // No children → create sibling

    return insertSiblingBelow(editor, indent);
  }

  // ─────────────────────────────────────────────
  // 1️⃣2️⃣ FALLBACK (should never reach here)
  // ─────────────────────────────────────────────
  // If we reach this point, something is wrong with position detection
  // Fall back to creating a sibling below as safest option
  return insertSiblingBelow(editor, indent);
}

/**
 * Handle Enter key press
 *
 * 🔒 WRAPPED WITH UI SAFETY:
 * - Automatically defers to UI handlers (slash commands, mentions, etc.)
 * - Returns false when UI is active, true when structural edit applied
 * - See withUISafety wrapper for enforcement details
 */
export const handleEnter = withUISafety(handleEnterImpl, 'handleEnter');
