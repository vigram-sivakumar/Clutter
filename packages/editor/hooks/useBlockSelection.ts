/**
 * useBlockSelection - Hook to detect if current block is selected
 *
 * Returns true when block should show selection halo based on ProseMirror selection:
 *
 * 1. NodeSelection: Block is selected as a structural unit
 * 2. AllSelection: Document-wide selection (Ctrl+A final state)
 * 3. TextSelection: NEVER shows halo (even if spanning multiple blocks)
 *
 * CRITICAL RULE:
 * TextSelection = text intent → Floating toolbar for formatting
 * NodeSelection = structural intent → Block menu for move/delete/duplicate
 * These must NEVER overlap.
 *
 * Text drag across blocks is still text editing, not block navigation.
 * Halo should only appear for explicit block-level operations.
 *
 * Selection ownership:
 * - ProseMirror owns selection state (source of truth)
 * - This hook reads PM selection to determine halo visibility
 * - Halos are pure visual indicators, they don't affect selection
 */

import { useEffect, useState } from 'react';
import { Editor } from '@tiptap/core';
import { NodeSelection, AllSelection } from '@tiptap/pm/state';

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

      const { selection } = editor.state;

      // Case 1: NodeSelection - block is selected as structural unit
      if (selection instanceof NodeSelection) {
        // Check if this specific block is the selected node
        const selectedPos = selection.from;
        const isThisBlock = selectedPos === pos;
        setIsSelected(isThisBlock);
        return;
      }

      // Case 2: AllSelection - entire document selected (Ctrl+A final state)
      if (selection instanceof AllSelection) {
        setIsSelected(true);
        return;
      }

      // Case 3: TextSelection (ANY TextSelection)
      // ❌ NEVER show block halo for text selection, even if multi-block
      // Text drag = text intent (shows floating toolbar for formatting)
      // Block halo = structural intent (shows block menu for move/delete)
      // These must never overlap
      setIsSelected(false);
    };

    // Listen to selection changes
    editor.on('selectionUpdate', checkSelection);
    editor.on('focus', checkSelection);
    editor.on('update', checkSelection);

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
