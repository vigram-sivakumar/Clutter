/**
 * usePlaceholder Hook - JavaScript-Based Focus Detection
 *
 * Returns placeholder text for empty blocks that should show it.
 *
 * PLACEHOLDER RULES (Apple Notes / Notion / Craft Pattern):
 * 1. RULE 1: Empty editor → always show in first block
 * 2. RULE 2: Non-empty editor → only show in focused empty block
 * 3. RULE 3: Never show multiple placeholders (only one at a time)
 * 4. RULE 4: Placeholder follows caret, not hover
 *
 * CRITICAL: Dependencies must be primitive values, not object references.
 * Using editor.state.selection or editor.state.doc directly will NOT
 * trigger re-computation when selection changes, causing stale placeholders
 * to appear in multiple blocks (violation of RULE 3).
 *
 * ALSO CRITICAL: Must extract getPos() VALUE before useMemo, not call inside.
 * Depending on getPos function reference won't detect when the position value
 * changes, causing placeholder to stick in wrong block when cursor moves.
 *
 * This hook re-runs on every selection change to update focus state.
 */

import { useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { placeholders } from '../tokens';

interface UsePlaceholderProps {
  node: PMNode;
  editor: Editor;
  getPos: () => number | undefined;
  customText?: string; // Optional custom placeholder text
}

/**
 * Returns placeholder text if this block is empty, null otherwise
 *
 * @param node - The ProseMirror node
 * @param editor - The Tiptap editor instance
 * @param getPos - Function to get the node's position
 * @param customText - Optional custom placeholder text (e.g., "Type or paste code...")
 * @returns Placeholder text or null
 */
export function usePlaceholder({
  node,
  editor,
  getPos,
  customText,
}: UsePlaceholderProps): string | null {
  // Extract primitive values for useMemo dependencies
  // Using object references like editor.state.selection doesn't trigger re-computation
  const isEmpty = node.content.size === 0;
  const selectionFrom = editor.state.selection.from;
  const selectionTo = editor.state.selection.to;
  const docTextContent = editor.state.doc.textContent;
  const docChildCount = editor.state.doc.childCount;
  const editorHasFocus = editor.isFocused;
  const nodeSize = node.nodeSize;

  // CRITICAL: Must extract position VALUE, not just depend on getPos function
  // getPos function reference doesn't change, but its return value does
  const pos = getPos();

  return useMemo(() => {
    if (!isEmpty) return null;
    if (pos === undefined) return null;

    // Check if editor is empty (only one empty block)
    const isEditorEmpty = docTextContent === '' && docChildCount === 1;
    // First block can be at pos 0 or 1 depending on node structure
    const isFirstBlock = pos <= 1;

    // RULE 1: Always show on first block if editor is completely empty
    if (isEditorEmpty && isFirstBlock) {
      return customText || placeholders.default;
    }

    // RULE 2: Show on focused empty blocks (only if editor has focus)
    if (!editorHasFocus) return null;

    const nodeStart = pos;
    const nodeEnd = pos + nodeSize;
    const isFocused = selectionFrom >= nodeStart && selectionTo <= nodeEnd;

    if (isFocused) {
      return customText || placeholders.default;
    }

    return null;
  }, [
    isEmpty,
    selectionFrom,
    selectionTo,
    docTextContent,
    docChildCount,
    editorHasFocus,
    pos,
    nodeSize,
    customText,
  ]);
}
