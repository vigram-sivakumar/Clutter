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
 * IMPLEMENTATION NOTE:
 * This hook computes placeholder state directly on every render without
 * memoization. While this seems inefficient, it's actually correct because:
 * 1. Selection changes on every cursor move → no cache hits anyway
 * 2. useMemo adds complexity and can cause sync issues with batched renders
 * 3. The computation is trivial (simple comparisons)
 * 4. TipTap already controls when this component re-renders
 *
 * Previous attempts to use useMemo caused bugs where multiple placeholders
 * would appear simultaneously due to stale cached values during batched updates.
 */

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
  // Early exit: not empty
  const isEmpty = node.content.size === 0;
  if (!isEmpty) return null;

  // Get position
  const pos = getPos();
  if (pos === undefined) return null;

  // RULE 1: Always show on first block if editor is completely empty
  const isEditorEmpty =
    editor.state.doc.textContent === '' && editor.state.doc.childCount === 1;
  const isFirstBlock = pos <= 1;

  if (isEditorEmpty && isFirstBlock) {
    return customText || placeholders.default;
  }

  // RULE 2: Show on focused empty blocks (only if editor has focus)
  if (!editor.isFocused) return null;

  // Check if cursor is within this block's boundaries
  const { from, to } = editor.state.selection;
  const nodeStart = pos;
  const nodeEnd = pos + node.nodeSize;
  const isFocused = from >= nodeStart && to <= nodeEnd;

  if (isFocused) {
    return customText || placeholders.default;
  }

  return null;
}
