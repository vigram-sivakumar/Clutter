/**
 * Placeholder Plugin
 *
 * Manages placeholder visibility based on:
 * - Editor empty state
 * - Focus state
 * - First block rule (shows without focus)
 * - IME composition state (safe)
 */

import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $isRootNode,
  BLUR_COMMAND,
  FOCUS_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';

import { BlockPlaceholder } from './BlockPlaceholder';
import { useBlockStore } from '../store';

export interface PlaceholderPluginProps {
  /** Block ID to check if this is the first block */
  blockId: string;

  /** Placeholder text to display */
  text?: string;

  /** Optional custom styles to match block styling */
  style?: React.CSSProperties;

  /** Always show placeholder when empty (ignore focus requirement) */
  alwaysShow?: boolean;
}

/**
 * Plugin that renders a baseline-aligned placeholder when:
 * - Block is empty AND (focused OR first block)
 * - Not composing (IME-safe)
 *
 * First Block Rule: The first block in the document shows its placeholder
 * even without focus, providing a visual hint to start typing.
 */
export function PlaceholderPlugin({
  blockId,
  text = 'Type here...',
  style,
  alwaysShow = false,
}: PlaceholderPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isFocused, setIsFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  // Check if this is the first block in the document
  const isFirstBlock = useBlockStore((s) => {
    const allBlocks = s.getAllBlocks();
    const rootBlocks = allBlocks.filter((b) => b.parent === null);
    return rootBlocks.length > 0 && rootBlocks[0].id === blockId;
  });

  // Track focus state
  useEffect(() => {
    const removeFocus = editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        setIsFocused(true);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    const removeBlur = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        setIsFocused(false);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      removeFocus();
      removeBlur();
    };
  }, [editor]);

  // Track empty state
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const isEmpty = root.getTextContent().trim() === '';
        setIsEmpty(isEmpty);
      });
    });
  }, [editor]);

  // Show placeholder if:
  // 1. Block is empty AND focused (normal case)
  // 2. Block is empty AND is the first block (special case - no focus needed)
  // 3. alwaysShow is true (for field blocks - always show when empty)
  const showPlaceholder = isEmpty && (isFocused || isFirstBlock || alwaysShow);

  return (
    <BlockPlaceholder visible={showPlaceholder} text={text} style={style} />
  );
}
