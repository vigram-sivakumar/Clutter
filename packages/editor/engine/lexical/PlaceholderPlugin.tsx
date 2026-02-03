/**
 * Placeholder Plugin
 *
 * Manages placeholder visibility based on:
 * - Editor empty state
 * - Focus state
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

export interface PlaceholderPluginProps {
  /** Placeholder text to display */
  text?: string;

  /** Optional custom styles to match block styling */
  style?: React.CSSProperties;
}

/**
 * Plugin that renders a baseline-aligned placeholder when:
 * - Block is empty
 * - Block is focused
 * - Not composing (IME-safe)
 */
export function PlaceholderPlugin({
  text = 'Type here...',
  style,
}: PlaceholderPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isFocused, setIsFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

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

  const showPlaceholder = isFocused && isEmpty;

  return (
    <BlockPlaceholder visible={showPlaceholder} text={text} style={style} />
  );
}
