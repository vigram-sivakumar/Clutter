/**
 * Lexical Block Editor
 *
 * Per-block Lexical editor that:
 * - Syncs content with block store
 * - Handles block-level keyboard shortcuts
 * - Manages focus
 *
 * Plain text only for POC.
 */

import './lexical-theme.css';

import React, { useEffect, useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LinkPlugin as LexicalLinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin as LexicalListPlugin } from '@lexical/react/LexicalListPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  EditorState,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
} from 'lexical';

import { createBlockEditorConfig } from './config';
import { BlockKeyboardPlugin } from './BlockKeyboardPlugin';
import { FormattingPlugin } from './FormattingPlugin';
import { FormattingToolbarPlugin } from './FormattingToolbarPlugin';
import { MarkdownPlugin } from './MarkdownShortcutsPlugin';
import { PlaceholderPlugin } from './PlaceholderPlugin';
import { SlashCommandPlugin } from '../commands/SlashCommandPlugin';
import { useBlockStyle } from './useBlockStyle';
import {
  serializeEditorState,
  deserializeEditorState,
  loadPlainText,
} from './serialization';
import { useBlockStore } from '../store';
import type { FocusManager } from '../focus/useFocusManager';

export interface LexicalBlockEditorProps {
  blockId: string;
  focusManager: FocusManager;
  autoFocus?: boolean;
}

/**
 * Inner component that has access to Lexical context
 */
function EditorContent({
  blockId,
  focusManager,
  autoFocus,
}: LexicalBlockEditorProps) {
  const [editor] = useLexicalComposerContext();
  const block = useBlockStore((s) => s.getBlock(blockId));
  const updateContent = useBlockStore((s) => s.updateContent);
  const splitBlock = useBlockStore((s) => s.splitBlock);
  const mergeBlocks = useBlockStore((s) => s.mergeBlocks);
  const getBlock = useBlockStore((s) => s.getBlock);

  // Get block-specific styling
  const { contentStyle, placeholderText } = useBlockStyle(block?.type);

  // Register editor with focus manager
  useEffect(() => {
    focusManager.registerEditor(blockId, editor);
    return () => {
      focusManager.unregisterEditor(blockId);
    };
  }, [editor, blockId, focusManager]);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus) {
      editor.focus();
      focusManager.setCurrentFocus(blockId);
    }
  }, [autoFocus, editor, blockId, focusManager]);

  // Load initial content
  useEffect(() => {
    if (!block || !block.content) return;

    // Try deserializing as Lexical JSON
    const editorState = deserializeEditorState(editor, block.content);

    if (editorState) {
      // Load rich text from JSON
      editor.setEditorState(editorState);
    } else if (
      typeof block.content === 'string' &&
      !block.content.startsWith('{')
    ) {
      // Fallback: load as plain text (backward compatibility)
      // ✅ Guard: only load non-JSON strings as plain text
      loadPlainText(editor, block.content);
    }
  }, []); // Only on mount

  // Handle content changes
  const handleChange = useCallback(
    (editorState: EditorState) => {
      // Serialize to JSON for storage
      const json = serializeEditorState(editorState);

      // Update block store (debounced updates would be better for production)
      updateContent(blockId, json);
    },
    [blockId, updateContent]
  );

  // Handle Enter key - split block
  const handleEnter = useCallback(
    (currentBlockId: string, offset: number) => {
      // Get current text content
      const currentText = editor.getEditorState().read(() => {
        const root = $getRoot();
        return root.getTextContent();
      });

      const beforeText = currentText.slice(0, offset);

      // Update current block with text before cursor
      editor.update(() => {
        const root = $getRoot();
        root.clear();

        const paragraph = $createParagraphNode();
        if (beforeText) {
          const textNode = $createTextNode(beforeText);
          paragraph.append(textNode);
        }
        root.append(paragraph);
      });

      // Create new empty block (will initialize with empty paragraph)
      const newBlockId = splitBlock(currentBlockId, offset);

      // Focus the new block
      setTimeout(() => {
        focusManager.focusBlock(newBlockId, 0);
      }, 10);
    },
    [editor, splitBlock, focusManager]
  );

  // Handle Backspace at start - merge with previous
  const handleBackspaceAtStart = useCallback(
    (currentBlockId: string) => {
      const currentBlock = getBlock(currentBlockId);
      if (!currentBlock) return;

      // Find previous sibling
      if (currentBlock.parent !== null) {
        const parent = getBlock(currentBlock.parent);
        if (!parent) return;

        const currentIndex = parent.children.indexOf(currentBlockId);
        if (currentIndex > 0) {
          const previousId = parent.children[currentIndex - 1];
          const previousBlock = getBlock(previousId);

          if (previousBlock) {
            // Store cursor position (end of previous block)
            const cursorOffset = previousBlock.content.length;

            // Merge blocks
            mergeBlocks(currentBlockId, previousId);

            // Focus previous block at cursor offset
            setTimeout(() => {
              focusManager.focusBlock(previousId, cursorOffset);
            }, 0);
          }
        }
      } else {
        // Root level - find previous root
        const allBlocks = useBlockStore.getState().getAllBlocks();
        const roots = allBlocks.filter((b) => b.parent === null);
        const currentIndex = roots.findIndex((b) => b.id === currentBlockId);

        if (currentIndex > 0) {
          const previousId = roots[currentIndex - 1].id;
          const previousBlock = getBlock(previousId);

          if (previousBlock) {
            const cursorOffset = previousBlock.content.length;
            mergeBlocks(currentBlockId, previousId);

            setTimeout(() => {
              focusManager.focusBlock(previousId, cursorOffset);
            }, 0);
          }
        }
      }
    },
    [getBlock, mergeBlocks, focusManager]
  );

  // Handle Up arrow - focus previous block
  const handleArrowUp = useCallback(
    (currentBlockId: string) => {
      const currentBlock = getBlock(currentBlockId);
      if (!currentBlock) return;

      // Find previous sibling
      if (currentBlock.parent !== null) {
        const parent = getBlock(currentBlock.parent);
        if (!parent) return;

        const currentIndex = parent.children.indexOf(currentBlockId);
        if (currentIndex > 0) {
          const previousId = parent.children[currentIndex - 1];
          focusManager.focusBlock(previousId);
        }
      } else {
        // Root level
        const allBlocks = useBlockStore.getState().getAllBlocks();
        const roots = allBlocks.filter((b) => b.parent === null);
        const currentIndex = roots.findIndex((b) => b.id === currentBlockId);

        if (currentIndex > 0) {
          const previousId = roots[currentIndex - 1].id;
          focusManager.focusBlock(previousId);
        }
      }
    },
    [getBlock, focusManager]
  );

  // Handle Down arrow - focus next block
  const handleArrowDown = useCallback(
    (currentBlockId: string) => {
      const currentBlock = getBlock(currentBlockId);
      if (!currentBlock) return;

      // Find next sibling
      if (currentBlock.parent !== null) {
        const parent = getBlock(currentBlock.parent);
        if (!parent) return;

        const currentIndex = parent.children.indexOf(currentBlockId);
        if (currentIndex < parent.children.length - 1) {
          const nextId = parent.children[currentIndex + 1];
          focusManager.focusBlock(nextId, 0);
        }
      } else {
        // Root level
        const allBlocks = useBlockStore.getState().getAllBlocks();
        const roots = allBlocks.filter((b) => b.parent === null);
        const currentIndex = roots.findIndex((b) => b.id === currentBlockId);

        if (currentIndex < roots.length - 1) {
          const nextId = roots[currentIndex + 1].id;
          focusManager.focusBlock(nextId, 0);
        }
      }
    },
    [getBlock, focusManager]
  );

  return (
    <>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="lexical-content-editable"
            style={{
              outline: 'none',
              paddingTop: '4px',
              paddingRight: '4px',
              paddingBottom: '4px',
              paddingLeft: '4px',
              minHeight: '24px',
              lineHeight: 1.5, // Base line height (16px × 1.5 = 24px)
              cursor: 'text',
              pointerEvents: 'auto',
              userSelect: 'text',
              whiteSpace: 'pre-wrap', // Preserve whitespace like old editor
              wordBreak: 'break-word', // Break long words
              // Block-type styles now handled by CSS theme classes
            }}
            onClick={() => {
              editor.focus();
              focusManager.setCurrentFocus(blockId);
            }}
          />
        }
        placeholder={<div />}
        ErrorBoundary={() => <div>Error</div>}
      />
      <PlaceholderPlugin
        blockId={blockId}
        text={placeholderText}
        style={contentStyle}
      />
      <HistoryPlugin />
      <LexicalLinkPlugin />
      <LexicalListPlugin />
      <OnChangePlugin onChange={handleChange} />
      <FormattingPlugin />
      <FormattingToolbarPlugin blockId={blockId} />
      <MarkdownPlugin />
      <SlashCommandPlugin blockId={blockId} />
      <BlockKeyboardPlugin
        blockId={blockId}
        onEnter={handleEnter}
        onBackspaceAtStart={handleBackspaceAtStart}
        onArrowUp={handleArrowUp}
        onArrowDown={handleArrowDown}
      />
    </>
  );
}

/**
 * Main Lexical block editor component
 */
export function LexicalBlockEditor(props: LexicalBlockEditorProps) {
  const config = createBlockEditorConfig();

  return (
    <LexicalComposer initialConfig={config}>
      <div style={{ position: 'relative' }}>
        <EditorContent {...props} />
      </div>
    </LexicalComposer>
  );
}
