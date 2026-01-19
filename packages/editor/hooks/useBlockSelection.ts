/**
 * useBlockSelection - Hook to detect if current block is selected
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 SELECTION INVARIANT: Engine owns selection, PM does not
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This hook ONLY reads Engine selection state.
 * It NEVER observes ProseMirror selection.
 *
 * PM selection is write-only from this system's perspective.
 * Reading PM selection creates an observer feedback loop:
 *   PM → DOM → Hook → DOM → PM (resurrection)
 *
 * By reading Engine only, we break the cycle:
 *   Engine → Hook → DOM (paint only)
 *   PM selection → ignored
 *
 * Returns true when:
 * - Block is in Engine.selection.blockIds (halo click)
 * - Block is part of multi-block Engine selection (Shift+Click, Cmd+A)
 *
 * Returns false when:
 * - Engine selection is 'none' or 'text'
 * - Block is not in Engine.selection.blockIds
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { Editor } from '@tiptap/core';
import { isMultiBlockSelection } from '../utils/multiSelection';

interface UseBlockSelectionProps {
  editor: Editor;
  getPos: () => number | undefined;
  nodeSize: number;
}

export function useBlockSelection({
  editor,
  getPos,
  nodeSize,
}: UseBlockSelectionProps): boolean {
  const [isSelected, setIsSelected] = useState(false);

  useEffect(() => {
    const checkSelection = () => {
      const pos = getPos();
      if (pos === undefined) {
        setIsSelected(false);
        return;
      }

      // Get Engine from editor (attached by EditorCore)
      const engine = (editor as any)._engine;
      if (!engine) {
        setIsSelected(false);
        return;
      }

      // Get current block's blockId
      const currentNode = editor.state.doc.nodeAt(pos);
      const blockId = currentNode?.attrs?.blockId;
      if (!blockId) {
        setIsSelected(false);
        return;
      }

      // 🔒 Read from ENGINE selection ONLY (never PM selection)
      // This prevents the observer feedback loop that resurrects NodeSelection

      // Case 1: Engine block selection (halo click) → show halo
      if (engine.selection.kind === 'block') {
        const selected = engine.selection.blockIds.includes(blockId);
        
        setIsSelected(selected);
        return;
      }

      // Case 2: Multi-block TextSelection (Shift+Click, Cmd+A) → show halo
      // This is the only case where we check PM selection, because
      // multi-block text selection is still represented as TextSelection in PM
      const isMultiBlock = isMultiBlockSelection(editor);
      if (isMultiBlock) {
        const { selection } = editor.state;
        const blockStart = pos;
        const blockEnd = pos + nodeSize;
        const { from, to } = selection;
        const contentStart = blockStart + 1;
        const contentEnd = blockEnd - 1;

        // Check if this block is covered by the selection
        const isFullyCovered = from <= contentStart && to >= contentEnd;
        const finalSelected = isFullyCovered && from !== to;
        
        setIsSelected(finalSelected);
        return;
      }

      // Case 3: Engine selection is 'none' or 'text' → NO halo
      setIsSelected(false);
    };

    // Listen to both editor events and engine changes
    editor.on('selectionUpdate', checkSelection);
    editor.on('focus', checkSelection);
    editor.on('update', checkSelection); // Also check on document updates

    // Initial check
    checkSelection();

    return () => {
      editor.off('selectionUpdate', checkSelection);
      editor.off('focus', checkSelection);
      editor.off('update', checkSelection);
    };
  }, [editor, getPos, nodeSize]);

  return isSelected;
}
