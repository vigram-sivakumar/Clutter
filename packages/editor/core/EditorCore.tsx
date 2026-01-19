/**
 * EditorCore - Main Tiptap editor component
 *
 * Core editor with all extensions, plugins, and behavior.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 SELECTION INVARIANT (ARCHITECTURAL LAW)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ProseMirror:
 *   - TextSelection ONLY
 *   - NEVER NodeSelection
 *
 * Block selection:
 *   - Represented by blockId(s) in the Engine
 *   - Reflected visually via UI (halo)
 *   - PM selection does NOT change when halo is clicked
 *
 * Keyboard / Delete / Backspace:
 *   - Operate on Engine block selection (blockId-based)
 *   - Never rely on PM NodeSelection
 *   - PM selection remains TextSelection at all times
 *
 * WHY THIS MATTERS:
 *   Model owns truth. View reflects it. Never the reverse.
 *   NodeSelection leaks view authority into the model, causing:
 *   - Delete breaking backspace
 *   - Backspace breaking delete
 *   - Enter breaking lists
 *   - Cascading selection bugs
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, {
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

export interface EditorCoreHandle {
  focus: () => void;
  scrollToBlock: (_blockId: string, _highlight?: boolean) => void;
}

// Extensions - all block types enabled
import { Document } from '../extensions/nodes/Document';
import { Text } from '../extensions/nodes/Text';
import { Paragraph } from '../extensions/nodes/Paragraph';
import { Heading } from '../extensions/nodes/Heading';
import { Blockquote } from '../extensions/nodes/Blockquote';
import { ListBlock } from '../extensions/nodes/ListBlock';
import { CodeBlock } from '../extensions/nodes/CodeBlock';
import { HorizontalRule } from '../extensions/nodes/HorizontalRule';
import { Link } from '../extensions/marks/Link';
import { Callout } from '../extensions/nodes/Callout';
import { Bold } from '../extensions/marks/Bold';
import { Italic } from '../extensions/marks/Italic';
import { Underline } from '../extensions/marks/Underline';
import { Strike } from '../extensions/marks/Strike';
import { Code } from '../extensions/marks/Code';
import { WavyUnderline } from '../extensions/marks/WavyUnderline';
import { CustomHighlight } from '../extensions/marks/Highlight';
import { TextColor } from '../extensions/marks/TextColor';
import { DateMention as DateMentionNode } from '../extensions/nodes/DateMention';
import { NoteLink } from '../extensions/nodes/NoteLink';
import Gapcursor from '@tiptap/extension-gapcursor';
import History from '@tiptap/extension-history';
import HardBreak from '@tiptap/extension-hard-break';
import { MarkdownShortcuts } from '../plugins/MarkdownShortcuts';
import { BlockIdGenerator } from '../extensions/BlockIdGenerator';

// Keyboard plugins
import { BackspaceHandler } from '../plugins/BackspaceHandler';
import { TabHandler } from '../plugins/TabHandler';
import { KeyboardShortcuts } from '../plugins/KeyboardShortcuts';

// All plugins enabled (except UndoRedo - using TipTap History instead)
import { SlashCommands } from '../plugins/SlashCommands';
import { TaskPriority } from '../plugins/TaskPriority';
import { EscapeMarks } from '../plugins/EscapeMarks';
import { DoubleSpaceEscape } from '../plugins/DoubleSpaceEscape';
import { HashtagDetection } from '../plugins/HashtagDetection';
import { HashtagAutocomplete } from '../plugins/HashtagAutocomplete';
import { AtMention } from '../plugins/AtMention';
import { SelectAll } from '../plugins/SelectAll';
import { BlockDeletion } from '../plugins/BlockDeletion';
// import { UndoRedo } from '../plugins/UndoRedo'; // ❌ Disabled - using TipTap History

import { CollapseExtension } from '../extensions/CollapseExtension';

// UI Components
import { SlashCommandMenu } from '../components/SlashCommandMenu';
import { AtMentionMenu } from '../components/AtMentionMenu';
import { FloatingToolbar } from '@clutter/ui';

// Tokens
import { spacing, typography, placeholders } from '../tokens';

// Styles
import './EditorCore.css';

// Theme
import {
  EditorThemeProvider,
  useEditorTheme,
} from '../theme/EditorThemeContext';
import type { EditorTheme } from '../types/EditorTheme';

// Editor Context
import { useEditorContext } from '../context/EditorContext';

interface EditorCoreProps {
  theme: EditorTheme;
  noteId: string;
  incomingContent?: object | null;
  onChange?: (_content: object) => void;
  onTagClick?: (_tag: string) => void;
  onNavigate?: (_linkType: 'note' | 'folder', _targetId: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const EditorCore = forwardRef<EditorCoreHandle, EditorCoreProps>(
  (props, ref) => {
    const { theme, ...innerProps } = props;
    return (
      <EditorThemeProvider theme={theme}>
        <EditorCoreInner {...innerProps} ref={ref} />
      </EditorThemeProvider>
    );
  }
);

// Internal component that consumes theme from context
const EditorCoreInner = forwardRef<
  EditorCoreHandle,
  Omit<EditorCoreProps, 'theme'>
>(
  (
    {
      noteId,
      incomingContent,
      onChange,
      onTagClick,
      onNavigate,
      onFocus,
      onBlur,
      placeholder: _placeholder = placeholders.default,
      editable = true,
      className,
      style,
    },
    ref
  ) => {
    const { colors } = useEditorTheme();
    const { availableTags } = useEditorContext();

    const activeNoteIdRef = useRef<string | null>(null);
    const prevDocRef = useRef<any>(null);
    // Hard lock to prevent ALL mutations during content loading
    const isHydratingRef = useRef<boolean>(false);

    // Create editor instance
    const editor = useEditor(
      {
        extensions: [
          // Core TipTap nodes
          Document,
          Text,
          Paragraph,

          // Marks
          Bold,
          Italic,
          Underline,
          Strike,
          Code,
          Link,
          WavyUnderline,
          TextColor,
          CustomHighlight,

          // Block nodes - ✅ FIXED: ListBlock priority removed & node-type guards added
          Heading,
          ListBlock,
          Blockquote,
          CodeBlock,
          HorizontalRule,
          Callout,
          DateMentionNode,
          NoteLink.configure({
            onNavigate,
          }),

          // Built-in TipTap extensions
          HardBreak.configure({
            keepMarks: true,
          }),
          Gapcursor,
          History,

          // ⚡ All plugins re-enabled
          MarkdownShortcuts.configure({
            // No config needed, just verifying it's loaded
          }),

          // ✅ RE-ENABLED
          BlockIdGenerator,
          KeyboardShortcuts,
          TabHandler,
          BackspaceHandler,
          SlashCommands,
          TaskPriority,
          EscapeMarks,
          DoubleSpaceEscape,
          SelectAll,
          BlockDeletion,
          HashtagDetection,
          HashtagAutocomplete.configure({
            getColors: () => colors,
            getTags: () => availableTags,
          }),
          AtMention.configure({
            getColors: () => colors,
          }),
          CollapseExtension,
        ] as any[],
        content: incomingContent || {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        autofocus: false,
        editable,
        editorProps: {
          attributes: {
            class: 'editor-content',
          },
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 🔑 Tab handling is done by TipTap extensions (KeyboardShortcuts)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          //
          // We do NOT preventDefault here at the ProseMirror level.
          // Instead, TipTap extensions decide:
          //   - KeyboardShortcuts (priority 1000): handles indent/outdent intents
          //     → returns result.handled (true = consume, false = fallback)
          //   - TabHandler (priority 100): fallback to prevent focus navigation
          //     → only runs if KeyboardShortcuts returns false
          //
          // This allows proper fallback when indent is blocked:
          //   Intent blocked → result.handled = false → browser handles Tab
          //
          // CRITICAL: ProseMirror handleKeyDown runs BEFORE TipTap extensions.
          // If we preventDefault here, TipTap never gets to decide fallback.
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          handleKeyDown(_view, _event) {
            // Let TipTap extensions handle all keyboard events
            return false;
          },
          handleDOMEvents: {
            // ❌ REMOVED mousedown preventDefault - it prevented clicking into empty blocks
            // ProseMirror handles its own selection and mousedown behavior
            // We don't need to prevent default browser behavior
            focus: () => {
              onFocus?.();
              return false; // Allow default focus behavior
            },
            blur: () => {
              onBlur?.();
              return false; // Allow default blur behavior
            },
          },
        },
        onUpdate: ({ editor, transaction }) => {
          // ABSOLUTE HARD LOCK - No mutations during hydration
          if (isHydratingRef.current) return;

          // 🔒 Only persist user edits (authoritative signal from UserInputMarker)
          if (transaction.getMeta('isUserEdit') !== true) return;
          if (!onChange) return;

          prevDocRef.current = editor.state.doc;
          onChange(editor.getJSON());
        },
        onTransaction: ({ transaction }) => {
          // 🔍 DIAGNOSTIC: Catch invalid transactions
          if (transaction.docChanged && !transaction.selectionSet) {
            console.error(
              '❌ INVALID TRANSACTION: docChanged without selectionSet',
              {
                steps: transaction.steps.length,
                docBefore: transaction.before.textContent.substring(0, 50),
                docAfter: transaction.doc.textContent.substring(0, 50),
                selectionType: transaction.selection?.constructor?.name,
              }
            );
          }
        },
        onSelectionUpdate: () => {
          // ⚠️ READ ONLY — DO NOT MUTATE DOCUMENT HERE
          //
          // ❌ DISABLED: Lazy blockId assignment
          // Root cause: onSelectionUpdate is an OBSERVER, not an action handler
          // Mutating here caused INVALID TRANSACTION errors (doc changed without selection update)
          //
          // This corrupted editor state:
          // - Cursor lag behind text
          // - Backspace silently failing
          // - Selection pointing to stale document positions
          //
          // Proper solution: Assign blockId at creation time, not reactively

          return; // ❌ DO NOT MUTATE HERE
        },
      },
      [noteId]
    ); // Recreate editor when note changes

    // Reset refs when editor recreates for new note
    useEffect(() => {
      if (!editor) return;

      // Reset refs when editor recreates for new note
      activeNoteIdRef.current = null;
      prevDocRef.current = null;
    }, [editor]);

    // Destroy editor on unmount to prevent state leaks
    useEffect(() => {
      return () => {
        if (editor) {
          editor.destroy();
        }
      };
    }, [editor]);

    // Store onTagClick callback in editor instance so node views can access it
    useEffect(() => {
      if (editor) {
        (editor as any).onTagClick = onTagClick;
      }
    }, [editor, onTagClick]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          if (editor) {
            const { doc } = editor.state;
            const lastNode = doc.lastChild;
            const isLastBlockEmpty =
              lastNode && lastNode.textContent.trim() === '';

            if (isLastBlockEmpty) {
              // Just focus the existing empty block
              editor.commands.focus('end');
            } else {
              // Create a new paragraph and focus it
              editor.commands.focus('end');
              editor.commands.insertContentAt(doc.content.size, {
                type: 'paragraph',
              });
              editor.commands.focus('end');
            }
          }
        },
        scrollToBlock: (blockId: string, highlight: boolean = true) => {
          if (!editor) return;

          // Find the block position in the document by blockId
          const { doc } = editor.state;
          let blockPos: number | null = null;

          doc.descendants((node, pos) => {
            if (node.attrs?.blockId === blockId) {
              blockPos = pos;
              return false; // Stop searching
            }
            return true;
          });

          if (blockPos === null) return;

          // Find the DOM element with data-block-id attribute for scrolling
          const blockElement = document.querySelector(
            `[data-block-id="${blockId}"]`
          );

          if (blockElement) {
            // Scroll into view if not visible
            const rect = blockElement.getBoundingClientRect();
            const isInViewport =
              rect.top >= 0 && rect.bottom <= window.innerHeight;

            if (!isInViewport) {
              blockElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }
          }

          // Highlight the block by selecting it (shows the blue halo)
          if (highlight) {
            // Use NodeSelection to select the entire block (triggers halo effect)
            const tr = editor.state.tr.setSelection(
              NodeSelection.create(doc, blockPos)
            );
            editor.view.dispatch(tr);
            editor.view.focus();

            // Selection persists until user manually clicks elsewhere
          }
        },
      }),
      [editor]
    );

    // Hydration effect
    useEffect(() => {
      if (!editor) return;
      if (!incomingContent) return;
      if (activeNoteIdRef.current === noteId) return;

      activeNoteIdRef.current = noteId;

      // HARD LOCK - Prevent ALL mutations during load
      isHydratingRef.current = true;

      // Parse JSON string to object
      const contentObj =
        typeof incomingContent === 'string'
          ? JSON.parse(incomingContent)
          : incomingContent;

      // Use setContent with emitUpdate: false
      // This treats content as authoritative and prevents ProseMirror from normalizing away empty text nodes
      // The false parameter means "don't trigger update event" - critical for hydration
      try {
        const result = editor.commands.setContent(contentObj, false);
        if (!result) {
          // setContent returned false
        }
      } catch (error) {
        // Error handled
        // setContent threw error
      }

      // ✅ Set baseline immediately after hydration (not after first edit)
      prevDocRef.current = editor.state.doc;

      // Release lock after current frame completes
      // This ensures all synchronous ProseMirror mutations are done
      requestAnimationFrame(() => {
        isHydratingRef.current = false;
      });
    }, [editor, incomingContent, noteId]);

    // Update editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(editable);
      }
    }, [editable, editor]);

    // 🔬 FORENSIC: Log selection on focus events

    // Handle click on empty space to focus editor
    const handleWrapperClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editor) return;

        // Check if click is on the wrapper itself (not on content)
        const target = e.target as HTMLElement;
        const editorContent = target.closest('.ProseMirror');

        if (!editorContent) {
          // Click was outside editor content
          const { doc } = editor.state;
          const lastNode = doc.lastChild;
          const isLastBlockEmpty =
            lastNode && lastNode.textContent.trim() === '';

          if (isLastBlockEmpty) {
            // Just focus the existing empty block
            editor.commands.focus('end');
          } else {
            // Create a new paragraph and focus it
            editor.commands.focus('end');
            editor.commands.insertContentAt(doc.content.size, {
              type: 'paragraph',
            });
            editor.commands.focus('end');
          }
        }
      },
      [editor]
    );

    if (!editor) {
      return null;
    }

    // CSS custom properties for theme-reactive colors
    const cssVariables = {
      '--editor-text-default': colors.text.default,
      '--editor-text-tertiary': colors.text.tertiary,
      '--editor-focus-border-20': `${colors.border.focus}20`,
      '--editor-orange': colors.semantic.orange,
      '--editor-orange-bg': `${colors.semantic.orange}10`,
    } as React.CSSProperties;

    return (
      <div
        className={className}
        style={{
          minHeight: '100%',
          cursor: 'text',
          flex: 1,
          // paddingBottom: '15vh',  // Inner clickable space (outer 30vh is on container)
          ...cssVariables,
          ...style,
        }}
        onClick={handleWrapperClick}
      >
        {/* Editor content */}
        <EditorContent editor={editor} />

        {/* UI Components */}
        <SlashCommandMenu editor={editor as any} />
        <AtMentionMenu editor={editor as any} />
        <FloatingToolbar editor={editor} />
      </div>
    );
  }
);

// Export editor type for external use
export type { Editor };
