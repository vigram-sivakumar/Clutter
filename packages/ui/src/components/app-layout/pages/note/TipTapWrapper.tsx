/**
 * TipTap Wrapper Component
 *
 * Wrapper around EditorCore that provides the string-based API
 * for backward compatibility with existing code.
 *
 * Saves content as JSON strings for better performance and easier task counting.
 * Supports loading legacy HTML content with automatic fallback.
 * 
 * ⚠️ ARCHITECTURAL EXCEPTION:
 * This file imports from @clutter/editor, violating the UI package boundary.
 * This is a composition/adapter layer that should move to apps/ in Phase 5.
 * ESLint exception documented here until migration is complete.
 */

/* eslint-disable no-restricted-imports */
import { useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { generateJSON } from '@tiptap/core';
import { ErrorBoundary } from 'react-error-boundary';

// Editor imports from @clutter/editor package
import {
  EditorCore,
  EditorCoreHandle,
  EditorProvider,
  EditorContextValue,
  Document,
  Text,
  Paragraph,
  Heading,
  ListBlock,
  Blockquote,
  CodeBlock,
  HorizontalRule,
  Bold,
  Italic,
  Underline,
  Strike,
  Code as CodeMark,
  WavyUnderline,
  Link,
} from '@clutter/editor';
import { placeholders } from '@clutter/editor';
import { CustomHighlight } from '@clutter/editor';
import { TextColor } from '@clutter/editor';
import { Callout } from '@clutter/editor';
import { EditorErrorFallback } from '@clutter/editor';

// Theme
import type { EditorTheme } from '@clutter/editor';
import { useTheme } from '../../../../hooks/useTheme';

// HardBreak for line breaks (Shift+Enter)
import HardBreak from '@tiptap/extension-hard-break';

interface TipTapWrapperProps {
  noteId?: string; // Note identifier for editor instance
  value?: string;
  onChange?: (_value: string) => void;
  onTagsChange?: (_tags: string[]) => void; // NEW: Callback when tags in content change
  onTagClick?: (_tag: string) => void; // Callback when a tag is clicked for navigation
  onNavigate?: (_linkType: 'note' | 'folder', _targetId: string) => void; // Callback when a note/folder link is clicked
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  isHydrating?: boolean; // Pass hydration state to prevent onChange during initial load
  onContentApplied?: () => void; // Callback when content has been loaded and applied
  editorContext: EditorContextValue; // REQUIRED: Editor context provided by app
  isFrozen?: boolean; // 🔒 Physically freeze editor DOM during note switches
}

export interface TipTapWrapperHandle {
  focus: () => void;
  scrollToBlock: (_blockId: string, _highlight?: boolean) => void;
}

// Extensions needed for HTML parsing/generation (must match EditorCore)
const htmlExtensions = [
  Document,
  Text,
  Paragraph,
  Heading,
  ListBlock,
  Blockquote,
  CodeBlock,
  HorizontalRule,
  HardBreak,
  Link,
  Callout,
  Bold,
  Italic,
  Underline,
  Strike,
  CodeMark,
  WavyUnderline,
  CustomHighlight,
  TextColor,
];

// Helper function to extract all tags from document content
function extractTagsFromContent(content: any): string[] {
  const tags: string[] = [];

  if (!content || !content.content) return tags;

  // Recursively walk through all nodes
  const walkNodes = (node: any) => {
    // If this node has tags attribute, collect them
    if (node.attrs && Array.isArray(node.attrs.tags)) {
      tags.push(...node.attrs.tags);
    }

    // Recursively walk children
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(walkNodes);
    }
  };

  walkNodes(content);

  // Return unique tags (case-insensitive)
  const uniqueTags = Array.from(
    new Map(tags.map((tag) => [tag.toLowerCase(), tag])).values()
  );

  return uniqueTags;
}

/**
 * 🔧 DOM Selection Normalizer
 *
 * PROBLEM:
 * When ProseMirror transitions from NodeSelection (block mode) to TextSelection (text mode),
 * the browser's DOM selection doesn't automatically follow. This leaves stale block-level
 * selections active, causing the "sticky blue halo" bug.
 *
 * SOLUTION:
 * Explicitly collapse DOM selection to ensure it's in a valid state for text editing.
 * This must be called at all recovery points where content changes programmatically.
 *
 * WHEN TO CALL:
 * - When EMPTY_DOC is injected
 * - When content === null (editor-origin updates)
 * - On first user keystroke after block selection
 */
function _normalizeDomSelection(): void {
  try {
    const selection = window.getSelection();
    if (!selection) return;

    // If selection is anchored to an element (not text), collapse it
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        // Collapse selection to remove any block-level highlighting
        selection.removeAllRanges();
      }
    }
  } catch (err) {
    // Silently fail - selection normalization is best-effort
  }
}

export const TipTapWrapper = forwardRef<
  TipTapWrapperHandle,
  TipTapWrapperProps
>(
  (
    {
      noteId,
      value,
      onChange,
      onTagsChange,
      onTagClick,
      onNavigate,
      onFocus,
      onBlur,
      autoFocus: _autoFocus = false,
      isHydrating: _isHydrating = false,
      onContentApplied: _onContentApplied,
      editorContext,
      isFrozen = false,
    },
    ref
  ) => {
    const previousTags = useRef<string[]>([]);
    const editorCoreRef = useRef<EditorCoreHandle>(null);
    const isUpdatingFromEditor = useRef(false);

    // Get theme from UI and map to EditorTheme format
    const { colors, mode } = useTheme();
    const editorTheme: EditorTheme = {
      colors,
      mode,
    };

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorCoreRef.current?.focus();
      },
      scrollToBlock: (blockId: string, highlight?: boolean) => {
        editorCoreRef.current?.scrollToBlock(blockId, highlight);
      },
    }));

    // Handle content changes - save as JSON string (not HTML)
    const handleChange = useCallback(
      (newContent: object) => {
        const extractedTags = extractTagsFromContent(newContent);

        const tagsChanged =
          extractedTags.length !== previousTags.current.length ||
          extractedTags.some(
            (tag, i) =>
              tag.toLowerCase() !== previousTags.current[i]?.toLowerCase()
          );

        if (tagsChanged && onTagsChange) {
          previousTags.current = extractedTags;
          onTagsChange(extractedTags);
        }

        if (onChange) {
          const jsonString = JSON.stringify(newContent);
          isUpdatingFromEditor.current = true;
          onChange(jsonString);
          setTimeout(() => {
            isUpdatingFromEditor.current = false;
          }, 0);
        }
      },
      [onChange, onTagsChange]
    );

    // Parse incoming value into content object
    let incomingContent: object | null = null;
    if (value) {
      try {
        incomingContent = JSON.parse(value);
      } catch (jsonError) {
        try {
          incomingContent = generateJSON(value, htmlExtensions);
        } catch (htmlError) {
          incomingContent = null;
        }
      }
    }

    return (
      <EditorProvider value={editorContext}>
        <ErrorBoundary
          FallbackComponent={EditorErrorFallback}
          onReset={() => {
            // Reset editor state on error boundary reset
            // This will remount EditorCore with clean state
          }}
          resetKeys={[noteId, value]} // Reset boundary when note changes
        >
          <EditorCore
            ref={editorCoreRef}
            theme={editorTheme}
            noteId={noteId || ''}
            incomingContent={incomingContent}
            onChange={handleChange}
            onTagClick={onTagClick}
            onNavigate={onNavigate}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholders.default}
            editable={!isFrozen}
          />
        </ErrorBoundary>
      </EditorProvider>
    );
  }
);
