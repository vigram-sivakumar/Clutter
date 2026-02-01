/**
 * EditorCore - Main Tiptap editor component
 *
 * Core editor with all extensions, plugins, and behavior.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 SELECTION PATTERN (Notion-Style)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Text Editing:
 *   - TextSelection for all normal editing operations
 *   - Drag-to-select = text selection (matches Notion)
 *   - Shows formatting toolbar
 *
 * Block Selection (Handler-Based Only):
 *   - NodeSelection for single block (Ctrl+A, handler click)
 *   - AllSelection for all blocks (Ctrl+A second press)
 *   - TextSelection range for Shift+Click handlers
 *   - Creates blue halo around selected blocks
 *
 * Drag Behavior (Matches Notion):
 *   - Drag within block → text selection
 *   - Drag across blocks → text selection (NOT block selection)
 *   - Block selection ONLY via handlers (⋮⋮ icon)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 RUNWAY PATTERN (Notion Lazy-Creation Model)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RULE: Empty space below content is not a permanent block — it's intent.
 *
 * The Pattern:
 *   - Document can legitimately end with non-empty content
 *   - No permanent trailing empty paragraph
 *   - Editor container has vertical runway (paddingBottom: 30vh)
 *   - Clicks in runway create new paragraph lazily
 *
 * Runway Click Behavior:
 *   1. User clicks in empty space below content
 *   2. Hit-test: Did click land on a block?
 *   3. If YES → do nothing (ProseMirror handles it)
 *   4. If NO → runway click detected:
 *      - Insert new paragraph at document end
 *      - Focus the new paragraph
 *      - That paragraph now becomes real content
 *
 * Why This Is Correct:
 *   - Blocks exist only if user created them (honest DOM)
 *   - No phantom paragraphs or placeholder hosts
 *   - Click intent is explicit ("I want to continue writing")
 *   - Not selection restoration, not focus tricks
 *
 * Edge Cases Handled:
 *   - Delete-all: BlockDeletion.ts recreates one paragraph
 *   - Creation: createEmptyParagraph() for initial state
 *   - Blur: No auto-creation (pure lazy model)
 *
 * Mental Model:
 *   Whitespace is not content. Whitespace is intent. Intent creates content.
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
import { NodeSelection, TextSelection, AllSelection } from '@tiptap/pm/state';

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
import { HashtagMention as HashtagMentionNode } from '../extensions/nodes/HashtagMention';
import Gapcursor from '@tiptap/extension-gapcursor';
import History from '@tiptap/extension-history';
import HardBreak from '@tiptap/extension-hard-break';
import { MarkdownShortcuts } from '../plugins/MarkdownShortcuts';
import { BlockIdGenerator } from '../extensions/BlockIdGenerator';
import { BlockTimestampTracker } from '../extensions/BlockTimestampTracker';

// Keyboard plugins
import { KeyboardShortcuts } from '../plugins/KeyboardShortcuts';

// All plugins enabled (except UndoRedo - using TipTap History instead)
import { SlashCommands } from '../plugins/SlashCommands';
import { TaskPriority } from '../plugins/TaskPriority';
import { EscapeMarks } from '../plugins/EscapeMarks';
import { DoubleSpaceEscape } from '../plugins/DoubleSpaceEscape';
import { AtMention } from '../plugins/AtMention';
import { HashtagMention } from '../plugins/HashtagMention';
import { SelectAll } from '../plugins/SelectAll';
import { BlockDeletion } from '../plugins/BlockDeletion';
// import { UndoRedo } from '../plugins/UndoRedo'; // ❌ Disabled - using TipTap History

import { CollapseExtension } from '../extensions/CollapseExtension';

// UI Components
import { SlashCommandMenu } from '../components/menus/SlashCommandMenu';
import { AtMentionMenu } from '../components/menus/AtMentionMenu';
import { HashtagMenu } from '../components/menus/HashtagMenu';
import { FloatingToolbar } from '../components/ui/FloatingToolbar';
import { EditorChromeLayer } from '../components/chrome/EditorChromeLayer';

// Tokens
import { placeholders } from '../tokens';

// Styles
import './EditorCore.css';

// Theme
import {
  EditorThemeProvider,
  useEditorTheme,
} from '../theme/EditorThemeContext';
import type { EditorTheme } from '../types/EditorTheme';

/**
 * Create an empty paragraph with full block identity
 *
 * BLOCK IDENTITY LAW:
 * All blocks in the document MUST have a blockId, including the initial empty paragraph.
 * No blocks should ever exist with blockId: null in a persisted state.
 *
 * This function ensures new notes and error fallbacks start with valid block structure.
 */
function createEmptyParagraph() {
  const blockId = crypto.randomUUID();
  const result = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: {
          blockId,
          indent: 0,
          collapsed: false,
          tags: [],
        },
        content: [],
      },
    ],
  };
  return result;
}

/**
 * Validate that all blocks in the document have a blockId
 *
 * This is a safety check to prevent persisting malformed documents.
 * Should only run in development to catch bugs early.
 */
function validateBlockIds(doc: any): boolean {
  if (process.env.NODE_ENV === 'production') return true;

  let isValid = true;

  if (doc.content && Array.isArray(doc.content)) {
    for (const node of doc.content) {
      if (node.type !== 'doc' && node.attrs?.blockId === undefined) {
        // Node has blockId attribute in schema but it's not set
        console.error(
          '[EditorCore] Block without blockId detected before save',
          { type: node.type, attrs: node.attrs }
        );
        isValid = false;
      } else if (node.attrs?.blockId === null) {
        // blockId is explicitly null (invalid state)
        console.error(
          '[EditorCore] Block with null blockId detected before save',
          { type: node.type, attrs: node.attrs }
        );
        isValid = false;
      }
    }
  }

  return isValid;
}

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
  // Note metadata for chrome layer
  createdAt?: string; // ISO string from note
  updatedAt?: string; // ISO string from note
  deletedAt?: string | null; // ISO string from note (null if not deleted)
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
      createdAt,
      updatedAt,
      deletedAt,
    },
    ref
  ) => {
    const { colors } = useEditorTheme();

    const activeNoteIdRef = useRef<string | null>(null);
    const prevDocRef = useRef<any>(null);
    // Hard lock to prevent ALL mutations during content loading
    const isHydratingRef = useRef<boolean>(false);
    // Ref to editor container for chrome positioning
    const editorContainerRef = useRef<HTMLDivElement>(null);
    // Anchor block info for Shift+Click range selection
    const anchorBlockPosRef = useRef<{
      pos: number; // Block position
      size: number; // Block nodeSize
    } | null>(null);

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
          HashtagMentionNode,

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
          BlockTimestampTracker,
          KeyboardShortcuts,
          SlashCommands,
          TaskPriority,
          EscapeMarks,
          DoubleSpaceEscape,
          SelectAll,
          BlockDeletion,
          AtMention.configure({
            getColors: () => colors,
          }),
          HashtagMention.configure({
            getColors: () => colors,
          }),
          CollapseExtension,
        ] as any[],
        content: incomingContent || createEmptyParagraph(),
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
          // KeyboardShortcuts extension handles indent/outdent and returns:
          //   - true (consume Tab) when indent/outdent succeeds
          //   - false (allow fallback) when blocked
          //
          // CRITICAL: ProseMirror handleKeyDown runs BEFORE TipTap extensions.
          // If we preventDefault here, TipTap never gets to decide fallback.
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          handleKeyDown(_view, _event) {
            // Let TipTap extensions handle all keyboard events
            return false;
          },
          handleDOMEvents: {
            // Shift+Click inside block for range selection
            // Drag-to-select = native text selection (matches Notion)
            mousedown: (view, event) => {
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              if (pos) {
                const $pos = view.state.doc.resolve(pos.pos);
                const blockDepth = $pos.depth > 0 ? 1 : 0;

                if (blockDepth > 0) {
                  const clickedBlockPos = $pos.before(blockDepth);
                  const clickedBlock = $pos.node(blockDepth);

                  // Handle Shift+Click for range selection between blocks
                  if (event.shiftKey && anchorBlockPosRef.current !== null) {
                    const { pos: anchorPos, size: anchorSize } =
                      anchorBlockPosRef.current;

                    // Calculate proper range endpoints
                    const anchorStart = anchorPos + 1;
                    const anchorEnd = anchorPos + anchorSize - 1;
                    const clickedStart = clickedBlockPos + 1;
                    const clickedEnd =
                      clickedBlockPos + clickedBlock.nodeSize - 1;

                    const from = Math.min(anchorStart, clickedStart);
                    const to = Math.max(anchorEnd, clickedEnd);

                    const tr = view.state.tr.setSelection(
                      TextSelection.create(view.state.doc, from, to)
                    );
                    view.dispatch(tr);

                    event.preventDefault();
                    return true; // Handled
                  }
                }
              }

              return false; // Allow default behavior (native text selection)
            },
            focus: (view) => {
              // 🔍 DEBUG: Log focus events to track selection resurrection
              if (process.env.NODE_ENV === 'development') {
                console.log('[EDITOR FOCUS]', {
                  selection: view.state.selection.constructor.name,
                });
              }

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

          // 🔒 Only persist user edits (using TipTap's standard addToHistory mechanism)
          // Internal operations (BlockIdGenerator, etc.) set addToHistory: false
          // All user typing/keyboard shortcuts default to addToHistory: true
          if (transaction.getMeta('addToHistory') === false) return;
          if (!onChange) return;

          const content = editor.getJSON();

          // 🔒 DEV-ONLY: Validate all blocks have blockId before persisting
          if (!validateBlockIds(content)) {
            console.error(
              '[EditorCore] Blocked save: document contains blocks without blockId',
              content
            );
            return; // Prevent save in dev if validation fails
          }

          prevDocRef.current = editor.state.doc;
          onChange(content);
        },
        onTransaction: ({ transaction }) => {
          // Skip validation during hydration - expected behavior when loading content
          if (isHydratingRef.current) return;

          // 🔍 DIAGNOSTIC: Catch invalid transactions (should never fire after fixes)
          if (transaction.docChanged && !transaction.selectionSet) {
            console.error(
              '❌ INVALID TRANSACTION: docChanged without selectionSet',
              {
                steps: transaction.steps.length,
                docBefore: transaction.before.textContent.substring(0, 50),
                docAfter: transaction.doc.textContent.substring(0, 50),
              }
            );
          }
        },
        onSelectionUpdate: ({ editor }) => {
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

          // 🔍 DEBUG: Log every selection change
          if (process.env.NODE_ENV === 'development') {
            const sel = editor.state.selection;
            console.log('[SELECTION UPDATE]', {
              type: sel.constructor.name,
              from: sel.from,
              to: sel.to,
            });
          }

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
        focus: () => editor?.commands.focus('end'),
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
      let contentObj;
      try {
        contentObj =
          typeof incomingContent === 'string'
            ? JSON.parse(incomingContent)
            : incomingContent;
      } catch (parseError) {
        console.error(
          '[EditorCore] Failed to parse incoming content',
          parseError
        );
        // Fall back to empty paragraph
        contentObj = createEmptyParagraph();
      }

      // Validate structure - must be a doc node
      if (!contentObj || contentObj.type !== 'doc') {
        console.error(
          '[EditorCore] Invalid content structure (not a doc)',
          contentObj
        );
        contentObj = createEmptyParagraph();
      }

      // Use setContent with emitUpdate: false
      // This treats content as authoritative and prevents ProseMirror from normalizing away empty text nodes
      // The false parameter means "don't trigger update event" - critical for hydration
      try {
        const result = editor.commands.setContent(contentObj, false);
        if (!result) {
          console.error('[EditorCore] setContent returned false', contentObj);
          // Attempt fallback to empty paragraph
          editor.commands.setContent(createEmptyParagraph());
        }
      } catch (error) {
        console.error('[EditorCore] setContent threw error', error, contentObj);
        // Attempt fallback to empty paragraph
        try {
          editor.commands.setContent(createEmptyParagraph());
        } catch (fallbackError) {
          console.error('[EditorCore] Fallback also failed', fallbackError);
        }
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

    // 🔍 DEBUG: Document-level click logger (proof of pointer-events passthrough)
    useEffect(() => {
      if (process.env.NODE_ENV !== 'development') return;

      const handler = (e: MouseEvent) => {
        console.log('[DOCUMENT CLICK]', e.target);
      };
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }, []);

    // 🔒 CRITICAL: Document-level deselect on outside click
    // ProseMirror only reacts to events inside its DOM
    // Clicking outside requires explicit deselection
    useEffect(() => {
      if (!editor) return;

      const onDocumentMouseDown = (e: MouseEvent) => {
        const container = editorContainerRef.current;
        if (!container) return;

        // Check if click is outside editor container
        if (!container.contains(e.target as Node)) {
          const sel = editor.state.selection;

          // Clear block-level selections (NodeSelection OR AllSelection)
          // Both must be cleared on outside clicks to match Notion behavior
          if (sel instanceof NodeSelection || sel instanceof AllSelection) {
            const pos = Math.max(1, editor.state.doc.content.size - 1);
            const tr = editor.state.tr.setSelection(
              TextSelection.create(editor.state.doc, pos)
            );
            editor.view.dispatch(tr);
          }
        }
      };

      document.addEventListener('mousedown', onDocumentMouseDown);
      return () =>
        document.removeEventListener('mousedown', onDocumentMouseDown);
    }, [editor]);

    // Runway click handler: Detect clicks BELOW content (Y-position based)
    // Notion pattern: Focus existing empty paragraph OR create new one
    const handleRunwayClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editor) return;

        // 🔍 DEBUG: Log runway clicks
        if (process.env.NODE_ENV === 'development') {
          console.log('[RUNWAY CLICK]', {
            selection: editor.state.selection.constructor.name,
            target: e.target,
          });
        }

        // 🔒 CRITICAL: Actively replace block-level selections with TextSelection
        // NodeSelection and AllSelection are "sticky" — they do NOT clear themselves
        // Must explicitly replace them, or they resurrect on focus
        if (
          editor.state.selection instanceof NodeSelection ||
          editor.state.selection instanceof AllSelection
        ) {
          const { doc } = editor.state;
          const pos = Math.max(1, doc.content.size - 1);
          const tr = editor.state.tr.setSelection(
            TextSelection.create(doc, pos)
          );
          editor.view.dispatch(tr);
          editor.view.focus();
          return;
        }

        // Find the last block in the document
        const lastBlock = document.querySelector(
          '[data-node-view-wrapper]:last-of-type'
        ) as HTMLElement | null;

        if (!lastBlock) return;

        const lastRect = lastBlock.getBoundingClientRect();

        // Only react to clicks BELOW content (+4px tolerance)
        if (e.clientY <= lastRect.bottom + 4) {
          return;
        }

        const { doc } = editor.state;
        const lastNode = doc.lastChild;

        // 🔒 GUARD: If last block is already empty paragraph → set text selection
        const isLastEmptyParagraph =
          lastNode &&
          lastNode.type.name === 'paragraph' &&
          lastNode.textContent.trim() === '';

        if (isLastEmptyParagraph) {
          // ✅ Explicitly set text selection, NOT just focus
          // Rule: Never call focus() after NodeSelection without setting new selection
          // Position inside last paragraph (doc.content.size points AFTER, -1 = inside)
          const pos = Math.max(1, doc.content.size - 1);
          const tr = editor.state.tr.setSelection(
            TextSelection.create(doc, pos)
          );
          editor.view.dispatch(tr);
          editor.view.focus();
          return;
        }

        // ✅ Create new paragraph ONLY when needed
        editor
          .chain()
          .insertContentAt(doc.content.size, {
            type: 'paragraph',
            attrs: {
              blockId: crypto.randomUUID(),
              indent: 0,
              collapsed: false,
              tags: [],
            },
          })
          .focus('end') // Let TipTap calculate correct position after insertion
          .run();
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
      '--editor-selection': colors.selection.default,
      '--editor-selection-bg': `${colors.selection.default}14`, // 14 = 0.14 opacity in hex (20% of 255 ≈ 51 ≈ 0x33, but 14 in hex is used for 14% alpha)
      '--editor-selection-text': `${colors.selection.default}30`, // 30% opacity for text selection
    } as React.CSSProperties;

    return (
      <div
        ref={editorContainerRef}
        className={className}
        style={{
          position: 'relative', // Allow absolute positioning of chrome layer
          minHeight: '100%',
          flex: 1,
          paddingBottom: '30vh', // 🎯 RUNWAY: Clickable space below content (Notion pattern)
          ...cssVariables,
          ...style,
        }}
        onClick={handleRunwayClick}
      >
        {/* Editor content wrapper - isolated text semantic boundary */}
        <div
          style={{
            cursor: 'text',
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Chrome overlay layer - OUTSIDE text context */}
        <EditorChromeLayer
          editor={editor}
          containerRef={editorContainerRef}
          anchorBlockPosRef={anchorBlockPosRef}
          createdAt={createdAt}
          updatedAt={updatedAt}
          deletedAt={deletedAt}
        />

        {/* UI Components */}
        <SlashCommandMenu editor={editor as any} />
        <AtMentionMenu editor={editor as any} />
        <HashtagMenu editor={editor as any} />
        <FloatingToolbar editor={editor} />
      </div>
    );
  }
);

// Export editor type for external use
export type { Editor };
