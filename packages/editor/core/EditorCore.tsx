/**
 * EditorCore - Main Tiptap editor component
 *
 * Core editor with all extensions, plugins, and behavior.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 SELECTION PATTERN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Text Editing:
 *   - TextSelection for all normal editing operations
 *   - Users select text, apply formatting, type, delete, etc.
 *
 * Block Highlighting (Intentional NodeSelection):
 *   - NodeSelection used ONLY for visual block highlighting (task navigation)
 *   - Triggered when user clicks task in sidebar → scrollToBlock(blockId, highlight=true)
 *   - Creates blue halo around entire block
 *   - Selection persists until user clicks elsewhere
 *
 * Why This Works:
 *   - NodeSelection is opt-in, controlled, and intentional
 *   - Only used for navigation/highlighting, never for editing operations
 *   - Standard keyboard/delete operations remain TextSelection-based
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
import { Editor, Extension } from '@tiptap/core';
import {
  NodeSelection,
  TextSelection,
  Plugin,
  PluginKey,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

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

// Editor Context
import { useEditorContext } from '../context/EditorContext';

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
    // Drag state for multi-block drag selection (decoration-based, not TextSelection)
    const dragStateRef = useRef<{
      isDragging: boolean;
      startBlockPos: number;
      startBlockSize: number;
      hoveredBlockPos: number; // Current hovered block during drag
      blocks: Array<{
        // Y-only hit-testing map (built on drag start)
        pos: number; // Block position in document
        size: number; // Block nodeSize
        top: number; // Screen Y coordinate (top edge)
        bottom: number; // Screen Y coordinate (bottom edge)
        centerY: number; // Vertical center - used for nearest-block calculation
      }>;
    }>({
      isDragging: false,
      startBlockPos: -1,
      startBlockSize: 0,
      hoveredBlockPos: -1,
      blocks: [],
    });

    // Plugin key for block drag decorations
    const blockDragKey = useRef(new PluginKey('blockDrag'));

    // Create block drag decoration extension (Notion-style block selection)
    // Renders visual selection via decorations, NOT TextSelection
    const BlockDragExtension = useRef(
      Extension.create({
        name: 'blockDrag',

        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: blockDragKey.current,
              state: {
                init() {
                  return DecorationSet.empty;
                },
                apply(tr, decorations) {
                  // Get drag state from transaction metadata
                  const dragMeta = tr.getMeta(blockDragKey.current);
                  if (dragMeta !== undefined) {
                    if (!dragMeta.isDragging) {
                      return DecorationSet.empty;
                    }

                    // Create decorations for all blocks in range
                    const { startPos, startSize, hoveredPos, hoveredSize } =
                      dragMeta;
                    const decorationArray: Decoration[] = [];

                    // Calculate block range (anchor to head)
                    const from = Math.min(startPos, hoveredPos);
                    const to = Math.max(
                      startPos + startSize,
                      hoveredPos + hoveredSize
                    );

                    // Add decoration for each block in range
                    tr.doc.nodesBetween(from, to, (node, pos) => {
                      if (pos >= from && pos < to && node.type.name !== 'doc') {
                        decorationArray.push(
                          Decoration.node(pos, pos + node.nodeSize, {
                            class: 'block-drag-selected',
                          })
                        );
                        return false; // Don't descend into children
                      }
                    });

                    return DecorationSet.create(tr.doc, decorationArray);
                  }

                  // Map decorations through document changes
                  return decorations.map(tr.mapping, tr.doc);
                },
              },
              props: {
                decorations(state) {
                  return this.getState(state);
                },
              },
            }),
          ];
        },
      })
    );

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
          BlockDragExtension.current,
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
            // ❌ REMOVED mousedown preventDefault - it prevented clicking into empty blocks
            // ProseMirror handles its own selection and mousedown behavior
            // We don't need to prevent default browser behavior
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
                  } else {
                    // Build Y-only block hit-testing map for drag
                    const blockRects: Array<{
                      pos: number;
                      size: number;
                      top: number;
                      bottom: number;
                      centerY: number;
                    }> = [];

                    // Snapshot all block positions and screen coordinates
                    view.state.doc.descendants((node, pos) => {
                      if (
                        node.type.name !== 'doc' &&
                        pos < view.state.doc.content.size
                      ) {
                        const domNode = view.nodeDOM(pos);
                        if (domNode && domNode instanceof HTMLElement) {
                          const rect = domNode.getBoundingClientRect();
                          const centerY = rect.top + rect.height / 2;
                          blockRects.push({
                            pos,
                            size: node.nodeSize,
                            top: rect.top,
                            bottom: rect.bottom,
                            centerY,
                          });
                        }
                      }
                      return false; // Only top-level blocks
                    });

                    // Initialize drag state for potential multi-block drag
                    dragStateRef.current = {
                      isDragging: false, // Not dragging yet, just mousedown
                      startBlockPos: clickedBlockPos,
                      startBlockSize: clickedBlock.nodeSize,
                      hoveredBlockPos: -1,
                      blocks: blockRects,
                    };
                  }
                }
              }

              return false; // Allow default behavior
            },
            mousemove: (view, event) => {
              // Only process if we have a valid start position
              if (dragStateRef.current.startBlockPos === -1) {
                return false;
              }

              // ANCHOR-LOCKED DRAG: Once in block-drag mode, always prevent ProseMirror interference
              if (dragStateRef.current.isDragging) {
                event.preventDefault();
                event.stopPropagation();
              }

              // Y-ONLY HIT-TESTING (Notion/Apple model)
              // Chrome, gutter, X position - all irrelevant
              const y = event.clientY;
              const blocks = dragStateRef.current.blocks;

              if (blocks.length === 0) {
                // No blocks available - bail out
                return false;
              }

              // Find NEAREST block by vertical center distance (handles empty blocks)
              let hoveredBlock = blocks[0]!;
              let minDistance = Math.abs(y - hoveredBlock.centerY);

              for (const block of blocks) {
                const distance = Math.abs(y - block.centerY);
                if (distance < minDistance) {
                  minDistance = distance;
                  hoveredBlock = block;
                }
              }

              // Check if start block is empty (no text content)
              const startBlock = view.state.doc.nodeAt(
                dragStateRef.current.startBlockPos
              );
              const isStartBlockEmpty =
                startBlock && startBlock.textContent.trim().length === 0;

              // Check if we've moved to a different block
              if (hoveredBlock.pos === dragStateRef.current.startBlockPos) {
                // For empty blocks, immediately enter block-drag mode
                // (no text selection possible)
                if (isStartBlockEmpty) {
                  dragStateRef.current.isDragging = true;
                  event.preventDefault();
                  event.stopPropagation();
                  // Don't return - continue to handle selection
                } else {
                  // Still in same block - allow default text selection
                  return false;
                }
              } else {
                // Moved to different block - enter block-drag mode
                dragStateRef.current.isDragging = true;
                event.preventDefault();
                event.stopPropagation();
              }

              // Update hovered block position
              if (hoveredBlock.pos !== dragStateRef.current.hoveredBlockPos) {
                dragStateRef.current.hoveredBlockPos = hoveredBlock.pos;

                // DECORATION-BASED SELECTION (Notion/Apple model)
                // Visual selection via decorations, NOT TextSelection
                // PM selection stays collapsed at anchor point
                const tr = view.state.tr;
                tr.setMeta(blockDragKey.current, {
                  isDragging: true,
                  startPos: dragStateRef.current.startBlockPos,
                  startSize: dragStateRef.current.startBlockSize,
                  hoveredPos: hoveredBlock.pos,
                  hoveredSize: hoveredBlock.size,
                });

                // Keep PM selection collapsed at anchor (text selection inert)
                const anchorStart = dragStateRef.current.startBlockPos + 1;
                tr.setSelection(
                  TextSelection.create(view.state.doc, anchorStart)
                );

                view.dispatch(tr);
              }

              return true; // Block ALL other handlers during multi-block drag
            },
            mouseup: (view) => {
              // Clear decorations if we were dragging
              if (dragStateRef.current.isDragging) {
                const tr = view.state.tr;
                tr.setMeta(blockDragKey.current, {
                  isDragging: false,
                });
                view.dispatch(tr);
              }

              // Reset drag state
              dragStateRef.current = {
                isDragging: false,
                startBlockPos: -1,
                startBlockSize: 0,
                hoveredBlockPos: -1,
                blocks: [],
              };
              return false; // Allow default behavior
            },
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

    // Helper: Focus editor end, creating new paragraph if needed
    const focusEditorEnd = useCallback(() => {
      if (!editor) return;

      const { doc } = editor.state;
      const lastNode = doc.lastChild;
      const isLastBlockEmpty = lastNode && lastNode.textContent.trim() === '';

      if (isLastBlockEmpty) {
        // Just focus the existing empty block
        editor.commands.focus('end');
      } else {
        // Create a new paragraph and focus it
        editor.commands.focus('end');
        editor.commands.insertContentAt(doc.content.size, {
          type: 'paragraph',
          attrs: {
            blockId: crypto.randomUUID(), // 🔒 BLOCK IDENTITY LAW: Always assign blockId
            indent: 0,
            collapsed: false,
            tags: [],
          },
        });
        editor.commands.focus('end');
      }
    }, [editor]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        focus: focusEditorEnd,
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

    // Handle click on empty space to focus editor
    const handleWrapperClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editor) return;

        // Check if click is on the wrapper itself (not on content)
        const target = e.target as HTMLElement;
        const editorContent = target.closest('.ProseMirror');

        if (!editorContent) {
          // Click was outside editor content - focus end
          focusEditorEnd();
        }
      },
      [editor, focusEditorEnd]
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
          // paddingBottom: '15vh',  // Inner clickable space (outer 30vh is on container)
          ...cssVariables,
          ...style,
        }}
      >
        {/* Editor content wrapper - isolated text semantic boundary */}
        <div
          style={{
            cursor: 'text',
          }}
          onClick={handleWrapperClick}
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
