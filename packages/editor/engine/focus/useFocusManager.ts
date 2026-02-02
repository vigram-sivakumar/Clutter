/**
 * Focus Manager
 *
 * Manages which block has focus and provides API for focus transitions.
 *
 * Uses a Map of blockId → LexicalEditor refs to call .focus() directly.
 */

import { useCallback, useRef } from 'react';
import { LexicalEditor } from 'lexical';

export interface FocusManager {
  /**
   * Register a block's editor instance
   */
  registerEditor: (blockId: string, editor: LexicalEditor) => void;

  /**
   * Unregister a block's editor instance
   */
  unregisterEditor: (blockId: string) => void;

  /**
   * Focus a specific block at an optional offset
   */
  focusBlock: (blockId: string, offset?: number) => void;

  /**
   * Get currently focused block ID
   */
  getCurrentFocus: () => string | null;

  /**
   * Set currently focused block ID
   */
  setCurrentFocus: (blockId: string | null) => void;
}

/**
 * Hook for managing focus across blocks
 */
export function useFocusManager(): FocusManager {
  // Map of blockId → editor instance
  const editorsRef = useRef<Map<string, LexicalEditor>>(new Map());

  // Currently focused block ID
  const currentFocusRef = useRef<string | null>(null);

  const registerEditor = useCallback(
    (blockId: string, editor: LexicalEditor) => {
      editorsRef.current.set(blockId, editor);
    },
    []
  );

  const unregisterEditor = useCallback((blockId: string) => {
    editorsRef.current.delete(blockId);
  }, []);

  const focusBlock = useCallback((blockId: string, offset?: number) => {
    const editor = editorsRef.current.get(blockId);
    if (!editor) {
      console.warn(`Cannot focus block ${blockId}: editor not registered`);
      return;
    }

    editor.focus(() => {
      // Focus at specific offset if provided
      if (offset !== undefined) {
        editor.update(() => {
          const selection = editor.getEditorState().read(() => {
            return editor.getRootElement()?.textContent || '';
          });

          // Move cursor to offset
          // For now, just focus - we'll add precise positioning later
          // This is enough for POC
        });
      }
    });

    currentFocusRef.current = blockId;
  }, []);

  const getCurrentFocus = useCallback(() => {
    return currentFocusRef.current;
  }, []);

  const setCurrentFocus = useCallback((blockId: string | null) => {
    currentFocusRef.current = blockId;
  }, []);

  return {
    registerEditor,
    unregisterEditor,
    focusBlock,
    getCurrentFocus,
    setCurrentFocus,
  };
}
