/**
 * Enter Keymap - Pure ProseMirror structural block creation
 *
 * Apple Notes Architecture:
 * - No intents, no resolver, no engine
 * - Direct ProseMirror transaction dispatch
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
//    - Use createCleanBlockAttrs for ALL new block creation
//    - Whitelist only: blockId, indent, listType, calloutType
//    - Never copy: collapsed, or any state attributes
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

/**
 * Dispatch a transaction marked as user edit
 * This is the ONLY way keyboard handlers should dispatch transactions
 */
function dispatchUserEdit(view: any, tr: any): void {
  tr.setMeta('isUserEdit', true);
  view.dispatch(tr);
}

/**
 * Create clean block attributes for new blocks
 * Whitelists only essential attributes, preventing attr leakage (e.g., collapsed)
 *
 * ⚠️ APPLE NOTES RULE: Do NOT assign blockId here
 * blockId is assigned ONLY when cursor enters the block (lazy assignment)
 *
 * @param node - Source node to copy attrs from
 * @param indent - Indent level for the new block
 * @returns Clean attrs object with only whitelisted properties
 */
function createCleanBlockAttrs(node: any, indent: number): Record<string, any> {
  const attrs: Record<string, any> = {
    // ❌ DO NOT assign blockId here - it will be assigned when cursor lands
    // blockId: crypto.randomUUID(),  // REMOVED
    indent,
  };

  // Whitelist: only copy if present on source node
  if (node.attrs.listType !== undefined) {
    attrs.listType = node.attrs.listType;
  }

  if (node.attrs.calloutType !== undefined) {
    attrs.calloutType = node.attrs.calloutType;
  }

  return attrs;
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

  const newNode = node.type.create(createCleanBlockAttrs(node, node.attrs.indent ?? 0));
  tr.insert(insertPos, newNode);

  // Calculate cursor position inside the new block
  const cursorPos = insertPos + 1;
  tr.setSelection(TextSelection.create(tr.doc, cursorPos));

  console.log('[INSERT SIBLING ABOVE]', {
    insertPos,
    cursorPos,
    nodeType: node.type.name,
    indent: node.attrs.indent ?? 0,
    newBlockId: newNode.attrs.blockId?.substring(0, 8),
    isEmpty: node.content.size === 0,
    selectionBefore: state.selection.from,
    selectionAfter: cursorPos,
  });

  dispatchUserEdit(view, tr);
  
  // Verify cursor position after dispatch
  setTimeout(() => {
    const currentPos = editor.state.selection.from;
    console.log('[CURSOR AFTER INSERT]', {
      expected: cursorPos,
      actual: currentPos,
      matches: currentPos === cursorPos,
    });
  }, 0);
  
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

  // Calculate cursor position inside the new block
  const cursorPos = insertPos + 1;
  tr.setSelection(TextSelection.create(tr.doc, cursorPos));

  console.log('[INSERT SIBLING BELOW]', {
    insertPos,
    cursorPos,
    nodeType: node.type.name,
    indent,
    newBlockId: newNode.attrs.blockId?.substring(0, 8),
    isEmpty: node.content.size === 0,
    selectionBefore: state.selection.from,
    selectionAfter: cursorPos,
  });

  dispatchUserEdit(view, tr);
  
  // Verify cursor position after dispatch
  setTimeout(() => {
    const currentPos = editor.state.selection.from;
    console.log('[CURSOR AFTER INSERT]', {
      expected: cursorPos,
      actual: currentPos,
      matches: currentPos === cursorPos,
    });
  }, 0);
  
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

  // Explicit: insert after parent node, before subtree
  const insertPos = $from.before() + node.nodeSize;

  // Check if parent is a toggle
  const isToggle =
    node.type.name === 'listBlock' && node.attrs.listType === 'toggle';

  if (isToggle) {
    // TOGGLE EXCEPTION: Always create paragraph child
    // ⚠️ No blockId assigned - will be assigned when cursor enters
    tr.insert(
      insertPos,
      state.schema.nodes.paragraph!.create({
        indent: parentIndent + 1,
      })
    );
  } else {
    // All other blocks: clone parent type
    tr.insert(
      insertPos,
      node.type.create(createCleanBlockAttrs(node, parentIndent + 1))
    );
  }

  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  dispatchUserEdit(view, tr);
  return true;
}

// ═══════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════

export function handleEnter(editor: Editor): boolean {
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

  // Check if this block has children (next block has higher indent)
  // Uses document traversal for safety (handles decorations, atom blocks, future schema changes)
  const hasChildren = (() => {
    const currentPos = $from.before();
    let nextBlockIndent: number | null = null;

    state.doc.descendants((n, pos) => {
      if (n.attrs?.blockId && pos > currentPos) {
        nextBlockIndent = n.attrs.indent ?? 0;
        return false; // Stop after first block found
      }
      return true;
    });

    return nextBlockIndent !== null && nextBlockIndent > indent;
  })();

  // ─────────────────────────────────────────────
  // EMPTY BLOCK CHECKS (must come BEFORE start/end)
  // ─────────────────────────────────────────────

  if (isEmpty) {
    // 3️⃣ EMPTY CONTAINER → COLLAPSE
    if (isExpandedContainer) {
      const tr = state.tr;
      tr.setNodeMarkup($from.before(), undefined, {
        ...node.attrs,
        collapsed: true,
      });
      tr.setMeta('isUserEdit', true);
      view.dispatch(tr);
      return true;
    }

    // 4️⃣ EMPTY BLOCK + INDENTED → OUTDENT (only)
    if (indent > 0) {
      const tr = state.tr;
      const cleanAttrs = createCleanBlockAttrs(node, indent - 1);

      tr.setNodeMarkup($from.before(), undefined, cleanAttrs);

      dispatchUserEdit(view, tr);
      return true;
    }

    // 5️⃣ EMPTY CALLOUT / BLOCKQUOTE → EXIT CONTAINER
    if (nodeType === 'callout' || nodeType === 'blockquote') {
      const tr = state.tr;
      const pos = $from.before();

      // Use node.nodeSize for exact replacement range
      // ⚠️ No blockId assigned - will be assigned when cursor enters
      tr.replaceWith(
        pos,
        pos + node.nodeSize,
        state.schema.nodes.paragraph!.create({
          indent,
        })
      );

      tr.setSelection(TextSelection.create(tr.doc, pos + 1));
      dispatchUserEdit(view, tr);
      return true;
    }

    // 6️⃣ EMPTY BLOCK AT ROOT (indent 0) → CONVERT TO PARAGRAPH
    // This runs AFTER outdent, so requires a separate Enter press
    if (indent === 0 && nodeType !== 'paragraph') {
      const tr = state.tr;
      const cleanAttrs = createCleanBlockAttrs(node, 0);

      tr.setNodeMarkup(
        $from.before(),
        state.schema.nodes.paragraph,
        cleanAttrs
      );

      dispatchUserEdit(view, tr);
      return true;
    }
  }

  // ─────────────────────────────────────────────
  // 7️⃣ TOGGLE MIDDLE → PARAGRAPH CHILD WITH TEXT MOVE
  // ─────────────────────────────────────────────
  const isListBlock = nodeType === 'listBlock';
  const isToggle = isListBlock && node.attrs.listType === 'toggle';
  const inMiddle = !atStart && !atEnd;

  if (isToggle && inMiddle) {
    const tr = state.tr;

    // Text after cursor
    const after = node.content.cut($from.parentOffset);

    // Remove text after cursor from toggle
    const from = $from.before() + 1 + $from.parentOffset;
    const to = $from.after() - 1;
    tr.delete(from, to);

    // Insert paragraph child
    // ⚠️ No blockId assigned - will be assigned when cursor enters
    const insertPos = $from.after();
    tr.insert(
      insertPos,
      state.schema.nodes.paragraph!.create(
        {
          indent: indent + 1,
        },
        after
      )
    );

    // Cursor into paragraph
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));

    view.dispatch(tr);
    return true;
  }

  // ─────────────────────────────────────────────
  // 8️⃣ START OF BLOCK → insert sibling ABOVE
  // ─────────────────────────────────────────────
  if (atStart) {
    console.log('[ENTER KEY] atStart - creating sibling ABOVE', {
      isEmpty,
      indent,
      nodeType,
      blockId: node.attrs.blockId?.substring(0, 8),
    });
    return insertSiblingAbove(editor);
  }

  // ─────────────────────────────────────────────
  // 9️⃣ END OF BLOCK
  // ─────────────────────────────────────────────
  if (atEnd) {
    const isToggle =
      node.type.name === 'listBlock' && node.attrs.listType === 'toggle';

    console.log('[ENTER KEY] atEnd - checking children', {
      isEmpty,
      indent,
      nodeType,
      hasChildren,
      isToggle,
      isExpandedContainer,
      blockId: node.attrs.blockId?.substring(0, 8),
    });

    // ✅ TOGGLE RULE:
    // Expanded toggles ALWAYS create a child
    if (isToggle && isExpandedContainer) {
      console.log('[ENTER KEY] Creating child (toggle rule)');
      return insertFirstChild(editor, indent);
    }

    // ✅ UNIVERSAL STRUCTURAL RULE:
    // Any block that already has children → create child
    if (hasChildren) {
      console.log('[ENTER KEY] Creating child (has children)');
      return insertFirstChild(editor, indent);
    }

    // ✅ DEFAULT:
    // No children → create sibling
    console.log('[ENTER KEY] Creating sibling BELOW');
    return insertSiblingBelow(editor, indent);
  }

  // ─────────────────────────────────────────────
  // 1️⃣1️⃣ MIDDLE OF BLOCK → SPLIT (generic fallback)
  // ─────────────────────────────────────────────
  const tr = state.tr;
  const from = $from.before() + 1 + $from.parentOffset;
  const to = $from.after() - 1;

  // Text after cursor
  const after = node.content.cut($from.parentOffset);

  // Remove text after cursor from current node
  tr.delete(from, to);

  // Insert new block with remaining content
  const insertPos = $from.after();
  tr.insert(
    insertPos,
    node.type.create(createCleanBlockAttrs(node, indent), after)
  );

  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  tr.setMeta('isUserEdit', true);
  view.dispatch(tr);

  return true;
}
