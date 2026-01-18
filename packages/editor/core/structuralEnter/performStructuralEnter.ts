// packages/editor/core/structuralEnter/performStructuralEnter.ts

import type { Editor } from '@tiptap/core';
import { createBlock } from '../createBlock';
import { resolveStructuralEnter } from './cursorLaw';
import type { EnterContext, StructuralEnterSource } from './types';

/**
 * SINGLE AUTHORITY FOR ENTER
 *
 * - Creates structure explicitly
 * - Generates fresh blockIds
 * - Applies exactly one transaction
 * - Places cursor exactly once
 *
 * 🔒 BLOCK IDENTITY LAW:
 * - Generates new blockId ONCE for the new block
 * - Passes it explicitly to createBlock()
 * - PM schema does NOT regenerate it (schemas now have default: null)
 * - Bridge mirrors PM → Engine without modification
 */
export function performStructuralEnter({
  editor,
  source,
}: {
  editor: Editor;
  source: StructuralEnterSource;
}): boolean {
  const engine = (editor as any)._engine;

  if (!engine) {
    return false; // ❌ Abort - Engine not ready
  }

  if (!engine.tree || !engine.tree.nodes) {
    return false; // ❌ Abort - Engine not ready
  }

  // 🔒 GUARD: Engine must have blocks before structural operations
  const engineBlockCount = Object.keys(engine.tree.nodes).filter(
    (id) => id !== 'root'
  ).length;
  if (engineBlockCount === 0) {
    return false; // ❌ Abort - Engine not ready
  }

  const { state, view } = editor;
  const { selection } = state;

  if (!selection.empty) {
    return true; // ✅ Consume anyway
  }

  // Get current block from PM selection
  const { $from } = selection;
  const blockNode = $from.node($from.depth);

  if (!blockNode || !blockNode.attrs?.blockId) {
    return true; // ✅ Consume anyway
  }

  const blockId = blockNode.attrs.blockId;

  // 🔒 GUARD: Cursor block must exist in Engine (PM-Engine consistency)
  const block = engine.getBlock(blockId);

  if (!block) {
    return false; // ❌ Abort - Engine not ready, don't pretend we handled it
  }

  // Calculate cursor context
  const cursorOffset = $from.parentOffset;
  const textLength = blockNode.textContent.length;
  const currentBlockType = blockNode.type.name;
  const currentIndent =
    blockNode.attrs.indent !== undefined ? blockNode.attrs.indent : 0;

  // 🔒 CHILD-FIRST INSERTION LAW
  // Pass blockId, indent, pmDoc, and engine to cursorLaw so it can check hierarchy.
  // The rule is: "If cursor is at end AND block has INDENTED children, create child (not sibling)"
  // This preserves visual hierarchy continuity.
  const context: EnterContext = {
    cursorOffset,
    textLength,
    isEmpty: textLength === 0,
    atStart: cursorOffset === 0,
    atEnd: cursorOffset === textLength,
    blockId,
    blockType: currentBlockType,
    indent: currentIndent,
    pmDoc: state.doc,
    engine,
  };

  // 🧠 Decide WHAT Enter means (pure logic)
  const decision = resolveStructuralEnter(context);

  // 🔒 BLOCK TYPE INHERITANCE LAW
  // Enter creates a sibling of the SAME block type, except:
  // - Headings downgrade to paragraph
  // - Children of containers may have different rules (future)
  const nextBlockType =
    currentBlockType === 'heading' ? 'paragraph' : currentBlockType;

  // 🔒 LIST TYPE INHERITANCE LAW
  // For listBlocks, preserve the listType attribute (bullet, numbered, task)
  const inheritedAttrs: Record<string, any> = {};
  if (currentBlockType === 'listBlock' && blockNode.attrs.listType) {
    inheritedAttrs.listType = blockNode.attrs.listType;
  }

  // 🧱 Execute structure explicitly via createBlock()
  const newBlockId = crypto.randomUUID();

  // Find current block position in PM document
  let currentBlockPos: number | null = null;
  state.doc.descendants((node, pos) => {
    if (node.attrs?.blockId === blockId) {
      currentBlockPos = pos;
      return false;
    }
    return true;
  });

  if (currentBlockPos === null) {
    return true;
  }

  const tr = state.tr;

  // Execute the structural change
  switch (decision.intent.kind) {
    case 'create-sibling-above': {
      createBlock(state, tr, {
        type: nextBlockType,
        blockId: newBlockId,
        insertPos: currentBlockPos,
        indent: currentIndent, // 🔒 Sibling has same indent as current block
        attrs: inheritedAttrs, // 🔒 Preserve listType, etc.
      });
      break;
    }

    case 'create-sibling-below': {
      const insertPos = currentBlockPos + blockNode.nodeSize;
      createBlock(state, tr, {
        type: nextBlockType,
        blockId: newBlockId,
        insertPos,
        indent: currentIndent, // 🔒 Sibling has same indent as current block
        attrs: inheritedAttrs, // 🔒 Preserve listType, etc.
      });
      break;
    }

    case 'split-block': {
      // Calculate positions for split
      const contentStart = currentBlockPos + 1;
      const splitAt = contentStart + cursorOffset;
      const contentEnd = currentBlockPos + blockNode.nodeSize - 1;

      // Extract content after cursor
      const afterContent = tr.doc.slice(splitAt, contentEnd).content;

      // Delete content after cursor from current block
      tr.delete(splitAt, contentEnd);

      // Insert new block with the extracted content
      const insertPos =
        currentBlockPos + blockNode.nodeSize - (contentEnd - splitAt);
      createBlock(state, tr, {
        type: nextBlockType,
        blockId: newBlockId,
        insertPos,
        indent: currentIndent, // 🔒 Split preserves indent
        content: afterContent,
        attrs: inheritedAttrs, // 🔒 Preserve listType, etc.
      });
      break;
    }

    case 'create-child': {
      // 🔒 CHILD-FIRST INSERTION: Create a child block inside the current container
      // This maintains hierarchy: User stays "inside" the container block
      // Triggered when: cursor at end + (toggle block OR block has existing children)
      const insertPos = currentBlockPos + blockNode.nodeSize;

      // 🔒 INDENT DERIVATION: Child indent = parent indent + 1
      // Get indent from PM (context), NOT from engine (blocks don't have indent)
      const childIndent = currentIndent + 1;

      createBlock(state, tr, {
        type: 'paragraph', // Children default to paragraph (can be changed by user)
        blockId: newBlockId,
        insertPos,
        indent: childIndent, // Child is one level deeper
        attrs: {}, // Children don't inherit parent attrs (except indent)
      });
      break;
    }

    case 'noop':
    default:
      return true; // ✅ Consume but do nothing
  }

  // Apply the transaction (creates the block in PM)
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);

  // 🎯 Cursor placement (authoritative)
  // Place cursor at start of newly created block
  requestAnimationFrame(() => {
    const { state: newState } = editor;
    let targetPos: number | null = null;

    newState.doc.descendants((node, pos) => {
      if (node.attrs?.blockId === newBlockId) {
        targetPos = pos + 1; // Inside the block's content
        return false;
      }
      return true;
    });

    if (targetPos !== null) {
      const tr = newState.tr;
      tr.setSelection(
        newState.selection.constructor.near(newState.doc.resolve(targetPos))
      );
      editor.view.dispatch(tr);
    }
  });

  return true;
}
