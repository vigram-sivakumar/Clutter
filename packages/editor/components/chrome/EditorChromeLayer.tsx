/**
 * EditorChromeLayer - Single overlay chrome system (Notion/Craft pattern)
 *
 * ANTI-FLICKER ARCHITECTURE:
 * 1. Atomic state updates (single state object)
 * 2. GPU-accelerated positioning (transform, not top/left)
 * 3. requestAnimationFrame for smooth updates
 * 4. Centralized configuration (one place to edit)
 *
 * DOM ISOLATION (Critical for clean semantics):
 * - Chrome is mounted OUTSIDE the cursor:text container
 * - Ghost overlay pattern: pointerEvents: 'none' on root, 'auto' on buttons
 * - No contentEditable, preventDefault, or userSelect hacks needed
 * - Browser never confuses chrome with text editing context
 *
 * CRAFT-STYLE HOVER ZONES:
 * - Each block has invisible hover-only divs in gutters (data-hover-only="true")
 * - These divs extend into left (64px) and right (40px) gutter areas
 * - Always hoverable (pointerEvents: 'auto'), positioned absolutely
 * - When hovered, trigger block hover detection → chrome appears
 * - Hover zones provide continuous coverage from block → gutter → chrome
 * - No gaps, no bridge padding needed - seamless hover experience
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 INTERACTIVE CHROME RULE (Critical for scaling)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * IMPORTANT:
 * All interactive chrome (inputs, buttons, dropdowns, editable UI) MUST live
 * in overlay layers like this one. NEVER render interactive UI inside
 * ProseMirror NodeViews.
 *
 * Why:
 * - Interactive elements inside PM's DOM cause event bubbling to PM handlers
 * - Causes `INVALID TRANSACTION: docChanged without selectionSet` errors
 * - contentEditable={false} prevents editing but NOT event propagation
 *
 * Examples of interactive chrome (MUST be in overlay):
 * - Block descriptions (inputs)
 * - Inline comments (reply inputs, buttons)
 * - AI suggestions (accept/reject buttons)
 * - Block settings (dropdowns, toggles)
 * - Embeds (play/pause controls)
 *
 * Examples of allowed chrome (CAN be in NodeViews):
 * - Visual indicators (halos, highlights) with pointerEvents: 'none'
 * - Hover detection zones (no focusable elements)
 *
 * See: packages/editor/components/chrome/BlockDescriptionsLayer.tsx for reference
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import { useDescriptionEdit } from '../../context/DescriptionEditContext';
import {
  Plus,
  MoreHorizontal,
  X,
  DotsSixVertical,
  Type,
  FileText,
  Copy,
  Folder,
  Trash2,
  ArrowUpDown,
  Link,
  ChevronRight,
  ChevronLeft,
  DropdownContainer,
  DropdownItem,
  DropdownSeparator,
  DropdownHeader,
  Button,
} from '@clutter/ui';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { spacing } from '../../tokens';
import { formatDateTime } from '../../utils/dateFormatting';
import { useCommandPickerNavigation } from '../../hooks/useCommandPickerNavigation';
import { useBlockById } from '../../hooks/useBlockById';
import { CommandList } from '../shared/CommandList';
import {
  filterSlashCommands,
  type SlashCommand,
} from '../../plugins/SlashCommands';
import {
  convertBlock,
  type BlockConversionSpec,
} from '../../utils/blockConversion';
import {
  getSelectedBlocks,
  isMultiBlockSelection,
} from '../../utils/multiSelection';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION (Single place to edit all chrome behavior)
// ═══════════════════════════════════════════════════════════════════════════

const CHROME_CONFIG = {
  // Timing
  HIDE_DELAY: 150, // ms - Grace period to move from block to chrome
  TYPING_TIMEOUT: 300, // ms - Hide chrome for 300ms after typing/cursor movement
  TRANSITION_DURATION: 120, // ms - Opacity fade duration

  // Layout
  GUTTER_LEFT: spacing.hoverZoneLeft, // px - Left gutter width (matches hover-only div width)
  GUTTER_RIGHT: spacing.hoverZoneRight, // px - Right gutter width (matches hover-only div width)
  GAP: 4, // px - Gap between buttons

  // Button sizes
  BUTTON_SIZE: 24, // px - Standard button size
  HANDLER_WIDTH: 20, // px - Drag handler width (narrower)
  ICON_SIZE: 16, // px - Icon size
  BORDER_RADIUS: 4, // px - Button border radius

  // Z-index
  Z_INDEX: 10,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ChromeState {
  blockId: string | null;
  x: number;
  y: number;
  width: number;
  visible: boolean;
}

interface EditorChromeLayerProps {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement>;
  anchorBlockPosRef: React.RefObject<{
    pos: number;
    size: number;
  } | null>; // Shared anchor for Shift+Click range selection
  createdAt?: string; // ISO string from note metadata
  updatedAt?: string; // ISO string from note metadata
  deletedAt?: string | null; // ISO string from note metadata (null if not deleted)
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map SlashCommand to BlockConversionSpec
 *
 * This bridges the gap between the slash command registry (UI-focused)
 * and the block conversion utility (editor-focused).
 */
function mapCommandToSpec(command: SlashCommand): BlockConversionSpec | null {
  switch (command.id) {
    // Text blocks
    case 'text':
      return { type: 'paragraph' };
    case 'heading1':
      return { type: 'heading', headingLevel: 1 };
    case 'heading2':
      return { type: 'heading', headingLevel: 2 };
    case 'heading3':
      return { type: 'heading', headingLevel: 3 };

    // Lists
    case 'bulletList':
      return { type: 'listBlock', listType: 'bullet' };
    case 'numberedList':
      return { type: 'listBlock', listType: 'numbered' };
    case 'taskList':
      return { type: 'listBlock', listType: 'task' };
    case 'toggleList':
      return { type: 'listBlock', listType: 'toggle' };

    // Callouts
    case 'quote':
      return { type: 'blockquote' };
    case 'calloutInfo':
      return { type: 'callout', calloutType: 'info' };
    case 'calloutWarning':
      return { type: 'callout', calloutType: 'warning' };
    case 'calloutError':
      return { type: 'callout', calloutType: 'error' };
    case 'calloutSuccess':
      return { type: 'callout', calloutType: 'success' };

    // Code
    case 'code':
      return { type: 'codeBlock' };

    // Commands that insert rather than convert (not supported in block menu)
    case 'divider':
    case 'dividerWavy':
    case 'image':
    case 'video':
    case 'file':
      return null;

    default:
      console.warn(`[mapCommandToSpec] Unknown command: ${command.id}`);
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function EditorChromeLayer({
  editor,
  containerRef,
  anchorBlockPosRef,
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  deletedAt: _deletedAt,
}: EditorChromeLayerProps) {
  const { colors } = useEditorTheme();
  const { setEditingDescription } = useDescriptionEdit();

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  const [chrome, setChrome] = useState<ChromeState>({
    blockId: null,
    x: 0,
    y: 0,
    width: 0,
    visible: false,
  });

  const [isTyping, setIsTyping] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(-1); // -1 = no selection
  const [menuView, setMenuView] = useState<'main' | 'turnInto'>('main');
  const [searchQuery, setSearchQuery] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // Refs
  // ─────────────────────────────────────────────────────────────────────────

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isOverChromeRef = useRef(false);
  // anchorBlockPosRef is now passed as a prop from EditorCore for shared Shift+Click behavior
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null); // Separate ref for Turn Into command list

  // ─────────────────────────────────────────────────────────────────────────
  // Hooks
  // ─────────────────────────────────────────────────────────────────────────

  const findBlock = useBlockById(editor);

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      if (!isOverChromeRef.current && !isMenuOpen) {
        setChrome((prev) => ({ ...prev, blockId: null, visible: false }));
      }
    }, CHROME_CONFIG.HIDE_DELAY);
  }, [isMenuOpen]);

  // Get block result with validation (common pattern)
  const getBlockResult = useCallback(() => {
    if (!chrome.blockId) return null;
    const result = findBlock(chrome.blockId);
    if (!result) return null;
    return result;
  }, [chrome.blockId, findBlock]);

  // Insert paragraph at position and focus
  const insertParagraphAt = useCallback(
    (insertPos: number) => {
      const { state, view } = editor;
      const newParagraph = state.schema.nodes.paragraph?.create();
      if (!newParagraph) return false;

      const tr = state.tr.insert(insertPos, newParagraph);
      const cursorPos = Number(insertPos) + 1;
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));

      view.dispatch(tr);
      view.focus();
      return true;
    },
    [editor]
  );

  // Reset menu to main view
  const resetMenuToMain = useCallback(() => {
    setMenuView('main');
    setSearchQuery('');
    setSelectedMenuIndex(-1);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Hover Detection
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Don't update chrome position while menu is open - keeps chrome locked on menu block
      if (isMenuOpen) return;

      // Cancel any pending operations
      if (rafHandleRef.current) {
        cancelAnimationFrame(rafHandleRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      // Find block under cursor
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const blockElement = target?.closest(
        '[data-block-id]'
      ) as HTMLElement | null;
      const blockId = blockElement?.getAttribute('data-block-id');

      if (!blockId || !blockElement) {
        scheduleHide();
        return;
      }

      // Use RAF to batch positioning with next paint
      rafHandleRef.current = requestAnimationFrame(() => {
        const rect = blockElement.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();

        if (!containerRect) return;

        // Atomic state update prevents flicker
        // Skip update if still hovering the same visible block (performance optimization)
        setChrome((prev) => {
          if (prev.blockId === blockId && prev.visible) return prev;

          return {
            blockId,
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            width: rect.width,
            visible: true,
          };
        });
      });
    },
    [isMenuOpen, containerRef, scheduleHide]
  );

  const handleMouseLeave = useCallback(() => {
    if (rafHandleRef.current) {
      cancelAnimationFrame(rafHandleRef.current);
    }
    scheduleHide();
  }, [scheduleHide]);

  // ─────────────────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (rafHandleRef.current) cancelAnimationFrame(rafHandleRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [containerRef, handleMouseMove, handleMouseLeave]);

  // ─────────────────────────────────────────────────────────────────────────
  // Typing Detection
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleUpdate = () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      setIsTyping(true);

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, CHROME_CONFIG.TYPING_TIMEOUT);
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [editor]);

  // ─────────────────────────────────────────────────────────────────────────
  // Hide Chrome When Menu Closes
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // When menu closes, hide chrome so user must hover to see it again
    if (!isMenuOpen) {
      setChrome((prev) => ({ ...prev, visible: false }));
    }
  }, [isMenuOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // Chrome Actions
  // ─────────────────────────────────────────────────────────────────────────

  const handleInsertBelow = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();

      const result = getBlockResult();
      if (!result) return;

      const { pos: blockPos, node: blockNode } = result;
      const insertPos: number = Number(blockPos) + Number(blockNode.nodeSize);

      insertParagraphAt(insertPos);
    },
    [getBlockResult, insertParagraphAt]
  );

  const handleBlockSelect = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const result = getBlockResult();
      if (!result) return;

      const blockPos = result.pos; // Position of the block itself
      const { state, view } = editor;

      if (e.shiftKey && anchorBlockPosRef.current !== null) {
        // Range selection - select from anchor to current block
        const { pos: anchorPos, size: anchorSize } = anchorBlockPosRef.current;

        // Calculate proper range endpoints
        const anchorStart = anchorPos + 1;
        const anchorEnd = anchorPos + anchorSize - 1;
        const currentStart = blockPos + 1;
        const currentEnd = blockPos + result.node.nodeSize - 1;

        const from = Math.min(anchorStart, currentStart);
        const to = Math.max(anchorEnd, currentEnd);

        const rangeSelection = TextSelection.create(state.doc, from, to);
        view.dispatch(state.tr.setSelection(rangeSelection));
      } else {
        // Check if this block has indented children (flat document structure)
        const currentIndent = result.node.attrs.indent ?? 0;
        const hasIndentAttr = 'indent' in result.node.attrs;

        if (hasIndentAttr) {
          // Find all subsequent blocks with higher indent (logical children)
          // Scan only top-level document blocks, not nested content
          const { doc } = state;
          let endPos = blockPos + result.node.nodeSize;
          let foundChildren = false;

          // Find current block index in document by position
          let currentBlockIndex = -1;
          let currentPos = 0;
          for (let i = 0; i < doc.childCount; i++) {
            if (currentPos === blockPos) {
              currentBlockIndex = i;
              break;
            }
            currentPos += doc.child(i).nodeSize;
          }

          // Scan subsequent top-level blocks
          if (currentBlockIndex >= 0) {
            for (let i = currentBlockIndex + 1; i < doc.childCount; i++) {
              const node = doc.child(i);

              // Check if node has indent attribute
              if (!('indent' in node.attrs)) {
                break;
              }

              const nodeIndent = node.attrs.indent ?? 0;

              // If we hit a block at same or lower indent level, stop
              if (nodeIndent <= currentIndent) {
                break;
              }

              // Block has higher indent - it's a child
              foundChildren = true;
              endPos += node.nodeSize;
            }
          }

          if (foundChildren) {
            // Select from start of parent to end of last child
            const from = blockPos + 1;
            const to = endPos - 1;
            const rangeSelection = TextSelection.create(state.doc, from, to);
            view.dispatch(state.tr.setSelection(rangeSelection));
          } else {
            // No children - select just this block
            const nodeSelection = NodeSelection.create(state.doc, blockPos);
            view.dispatch(state.tr.setSelection(nodeSelection));
          }
        } else {
          // No indent attribute - select just this block
          const nodeSelection = NodeSelection.create(state.doc, blockPos);
          view.dispatch(state.tr.setSelection(nodeSelection));
        }

        // Store this block info as the anchor for potential Shift+Click range
        anchorBlockPosRef.current = {
          pos: blockPos,
          size: result.node.nodeSize,
        };
      }

      // Don't blur editor - maintain focus for keyboard handling
      // Blurring breaks slash command Enter key and other keyboard interactions
    },
    [getBlockResult, editor]
  );

  const handleOpenMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!editor) return;

      // Toggle menu
      if (isMenuOpen) {
        setIsMenuOpen(false);
        return;
      }

      if (!menuButtonRef.current) return;

      const buttonRect = menuButtonRef.current.getBoundingClientRect();
      const menuWidth = 220; // Standard dropdown width
      const gap = 8; // Gap between button and menu

      // Position menu to the LEFT of the button
      setMenuPosition({
        top: buttonRect.top,
        left: buttonRect.left - menuWidth - gap,
      });

      // Don't blur editor - maintain focus for keyboard handling
      // The caret will be hidden by CSS when menu is open (via isMenuOpen state)

      setIsMenuOpen(true);
      setSelectedMenuIndex(-1); // Reset selection when menu opens
    },
    [isMenuOpen, editor]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Block Menu Actions
  // ─────────────────────────────────────────────────────────────────────────

  const handleTurnInto = useCallback(() => {
    if (!chrome.blockId) return;

    // Switch to Turn Into view
    setMenuView('turnInto');
    setSearchQuery(''); // Reset search
    setSelectedMenuIndex(-1); // Reset main menu selection
  }, [chrome.blockId]);

  const handleBackToMenu = useCallback(() => {
    resetMenuToMain();
  }, [resetMenuToMain]);

  const handleSlashCommandSelect = useCallback(
    (command: SlashCommand) => {
      if (!chrome.blockId) return;

      // Map SlashCommand to BlockConversionSpec
      const spec = mapCommandToSpec(command);
      if (!spec) {
        console.warn(
          `[BlockOptionsMenu] Cannot convert command: ${command.id}`
        );
        return;
      }

      // Check for multiselection - convert all selected blocks
      if (isMultiBlockSelection(editor)) {
        const blocks = getSelectedBlocks(editor);

        // Convert each block (no need for reverse order since we're not deleting)
        blocks.forEach((block) => {
          const blockId = block.node.attrs.blockId;
          if (blockId) {
            convertBlock(editor, blockId, spec);
          }
        });
      } else {
        // Single block - convert the block by ID (not cursor position!)
        convertBlock(editor, chrome.blockId, spec);
      }

      // Close menu and reset view
      setIsMenuOpen(false);
      resetMenuToMain();
    },
    [chrome.blockId, editor, resetMenuToMain]
  );

  const handleAddDescription = useCallback(() => {
    if (!chrome.blockId) return;

    const result = getBlockResult();
    if (!result) return;

    const { node, pos } = result;
    const insertPos = pos + node.nodeSize;

    // Check if description already exists (sibling pattern)
    const nextNode = editor.state.doc.nodeAt(insertPos);
    const hasExistingDescription = nextNode?.type.name === 'blockDescription';

    // Close menu first
    setIsMenuOpen(false);

    if (hasExistingDescription) {
      // Edit: Focus existing description
      requestAnimationFrame(() => {
        editor.commands.setTextSelection(insertPos + 1);
        editor.commands.focus();
      });
    } else {
      // Add: Insert new description node (sibling pattern)
      requestAnimationFrame(() => {
        editor
          .chain()
          .insertContentAt(insertPos, {
            type: 'blockDescription',
          })
          .setTextSelection(insertPos + 1)
          .run();
      });
    }
  }, [chrome.blockId, getBlockResult, editor]);

  const handleDuplicate = useCallback(() => {
    const { state, view } = editor;
    let tr = state.tr;

    if (isMultiBlockSelection(editor)) {
      // Duplicate multiple blocks
      const blocks = getSelectedBlocks(editor);

      // Find the position after the last selected block
      const lastBlock = blocks[blocks.length - 1];
      if (!lastBlock) return;

      let insertPos = lastBlock.pos + lastBlock.nodeSize;

      // Clone and insert each block in order
      blocks.forEach((block) => {
        const clonedNode = block.node.copy(block.node.content);
        tr = tr.insert(insertPos, clonedNode);
        insertPos += clonedNode.nodeSize;
      });

      // Set selection to the first duplicated block
      const firstDuplicatedPos = lastBlock.pos + lastBlock.nodeSize;
      tr = tr.setSelection(NodeSelection.create(tr.doc, firstDuplicatedPos));

      view.dispatch(tr);
    } else {
      // Duplicate single block
      const result = getBlockResult();
      if (!result) return;

      const { pos, node } = result;
      const insertPos = pos + node.nodeSize;

      // Clone the node (preserves all attributes including content)
      const clonedNode = node.copy(node.content);
      tr = tr.insert(insertPos, clonedNode);

      // Set selection to the duplicated block
      tr = tr.setSelection(NodeSelection.create(tr.doc, insertPos));

      view.dispatch(tr);
    }

    setIsMenuOpen(false);
  }, [chrome.blockId, editor, getBlockResult]);

  const handleMoveTo = useCallback(() => {
    if (isMultiBlockSelection(editor)) {
      console.log('Move multiple blocks (TODO)');
      // TODO: Implement move to for multiple blocks
    } else {
      console.log('Move to for block:', chrome.blockId);
      // TODO: Implement move to menu for single block
    }
    setIsMenuOpen(false);
  }, [chrome.blockId, editor]);

  const handleDelete = useCallback(() => {
    const { state, view } = editor;

    // Check for multiselection - delete all selected blocks
    if (isMultiBlockSelection(editor)) {
      const blocks = getSelectedBlocks(editor);
      let tr = state.tr;

      // Remember the position of the first block for cursor placement
      const firstBlockPos = blocks[0]?.pos ?? 0;

      // Check if we're deleting all blocks
      const deletingAllBlocks = blocks.length === state.doc.childCount;

      // Delete in reverse order to preserve positions
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block) {
          tr = tr.delete(block.pos, block.pos + block.nodeSize);
        }
      }

      // If we deleted everything, create an empty paragraph
      if (deletingAllBlocks) {
        const emptyParagraph = state.schema.nodes.paragraph.create();
        tr = tr.insert(0, emptyParagraph);
        // Place cursor inside the new paragraph
        tr = tr.setSelection(TextSelection.create(tr.doc, 1));
      } else {
        // Set selection to a safe position after deletion
        const newPos = Math.min(firstBlockPos, tr.doc.content.size);
        tr = tr.setSelection(TextSelection.create(tr.doc, newPos));
      }

      view.dispatch(tr);
    } else {
      // Single block deletion
      const result = getBlockResult();
      if (!result) return;

      const { pos, node } = result;
      let tr = state.tr.delete(pos, pos + node.nodeSize);

      // If we deleted the last block, create an empty paragraph
      if (tr.doc.childCount === 0) {
        const emptyParagraph = state.schema.nodes.paragraph.create();
        tr = tr.insert(0, emptyParagraph);
        // Place cursor inside the new paragraph
        tr = tr.setSelection(TextSelection.create(tr.doc, 1));
      } else {
        // Set selection to a safe position after deletion
        const newPos = Math.min(pos, tr.doc.content.size);
        tr = tr.setSelection(TextSelection.create(tr.doc, newPos));
      }

      view.dispatch(tr);
    }

    // Don't focus - user must click to focus manually
    setIsMenuOpen(false);
  }, [getBlockResult, editor]);

  const handleInsertAbove = useCallback(() => {
    const result = getBlockResult();
    if (!result) return;

    const blockPos = result.pos;
    insertParagraphAt(blockPos);

    setIsMenuOpen(false);
  }, [getBlockResult, insertParagraphAt]);

  const handleInsertBelowFromMenu = useCallback(() => {
    handleInsertBelow(); // No event needed - it's optional now (also hides chrome)
    setIsMenuOpen(false);
  }, [handleInsertBelow]);

  const handleCopyLink = useCallback(() => {
    const baseUrl = window.location.href.split('#')[0];

    if (isMultiBlockSelection(editor)) {
      // Multi-selection: Copy page link (can't highlight multiple blocks)
      navigator.clipboard.writeText(baseUrl).catch((err) => {
        console.error('Failed to copy page link:', err);
      });
    } else {
      // Single selection: Copy link to specific block
      const result = getBlockResult();
      if (!result) return;

      const blockId = result.node.attrs.blockId;
      if (blockId) {
        const blockUrl = `${baseUrl}#${blockId}`;
        navigator.clipboard.writeText(blockUrl).catch((err) => {
          console.error('Failed to copy block link:', err);
        });
      }
    }

    setIsMenuOpen(false);
  }, [chrome.blockId, editor, getBlockResult]);

  // ─────────────────────────────────────────────────────────────────────────
  // Get Block Timestamps
  // ─────────────────────────────────────────────────────────────────────────

  const getBlockTimestamps = useCallback(() => {
    const result = getBlockResult();
    if (!result) return { createdAt: null, updatedAt: null };

    return {
      createdAt: result.node.attrs.createdAt || null,
      updatedAt: result.node.attrs.updatedAt || null,
    };
  }, [getBlockResult]);

  const blockTimestamps = getBlockTimestamps();

  // Get current block's description status (for menu label)
  const hasDescription = useCallback(() => {
    const result = getBlockResult();
    if (!result) return false;

    // Check if next node is a blockDescription (sibling pattern)
    const insertPos = result.pos + result.node.nodeSize;
    const nextNode = editor.state.doc.nodeAt(insertPos);
    return nextNode?.type.name === 'blockDescription';
  }, [getBlockResult, editor.state.doc]);

  const blockHasDescription = hasDescription();

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard Navigation Modes
  // ─────────────────────────────────────────────────────────────────────────

  // Explicit keyboard mode flags for clarity and maintainability
  // Defined here before hooks that depend on them
  const isMainMenuKeyboardActive = isMenuOpen && menuView === 'main';
  const isTurnIntoKeyboardActive = isMenuOpen && menuView === 'turnInto';

  // ─────────────────────────────────────────────────────────────────────────
  // Turn Into View State (Command Picker)
  // ─────────────────────────────────────────────────────────────────────────

  // Filter slash commands based on search query
  // Also exclude commands that can't be converted (dividers, media)
  const filteredCommands = useMemo(() => {
    const allCommands = filterSlashCommands(searchQuery);

    // Exclude insert-only commands that can't convert existing blocks
    const excludedCommands = [
      'divider',
      'dividerWavy',
      'image',
      'video',
      'file',
    ];

    return allCommands.filter((cmd) => !excludedCommands.includes(cmd.id));
  }, [searchQuery]);

  // Convert SlashCommand to CommandItem format for CommandList
  const commandItems = useMemo(() => {
    return filteredCommands.map((cmd: SlashCommand) => ({
      id: cmd.id,
      title: cmd.title,
      description: cmd.description,
      icon: cmd.icon,
      group: cmd.group,
    }));
  }, [filteredCommands]);

  // Keyboard navigation for TURN INTO view
  // Note: Must be defined after isMainMenuKeyboardActive/isTurnIntoKeyboardActive
  const {
    selectedIndex: commandSelectedIndex,
    setSelectedIndex: setCommandSelectedIndex,
    hasKeyboardNavigatedRef, // Hook tracks keyboard usage internally
  } = useCommandPickerNavigation({
    isActive: isTurnIntoKeyboardActive,
    itemCount: commandItems.length,
    onSelect: (index) => {
      const command = filteredCommands[index];
      if (command) {
        handleSlashCommandSelect(command);
      }
    },
    containerRef: commandListRef, // Use separate ref to exclude Back button
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Chrome Container Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const chromeContainerHandlers = {
    onMouseEnter: () => {
      isOverChromeRef.current = true;
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    },
    onMouseLeave: () => {
      isOverChromeRef.current = false;
      scheduleHide();
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────

  // Show chrome when hovering (and not typing) OR when menu is open
  const shouldShow = (chrome.visible && !isTyping) || isMenuOpen;

  // Show dismiss icon when menu is open
  const shouldShowDismissIcon = isMenuOpen;

  // Check if multiple blocks are selected (for menu behavior)
  const isMultiSelected = isMultiBlockSelection(editor);
  const selectedCount = isMultiSelected ? getSelectedBlocks(editor).length : 1;

  const baseButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    borderRadius: CHROME_CONFIG.BORDER_RADIUS,
    color: colors.text.secondary,
    transition: `background-color ${CHROME_CONFIG.TRANSITION_DURATION}ms ease`,
  };

  const buttonHoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.backgroundColor = colors.background.hover;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard Navigation
  // ─────────────────────────────────────────────────────────────────────────

  // Count total actionable menu items (excludes DropdownHeaders and DropdownSeparators)
  const totalMenuItems = 8; // Turn into, Add description, Duplicate, Move to, Delete, Insert above, Insert below, Copy link

  // Keyboard handler for MAIN MENU navigation
  useEffect(() => {
    if (!isMainMenuKeyboardActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedMenuIndex((prev) => {
          const newIndex = prev === -1 ? 0 : (prev + 1) % totalMenuItems;
          return newIndex;
        });
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedMenuIndex((prev) => {
          const newIndex =
            prev === -1
              ? totalMenuItems - 1
              : (prev - 1 + totalMenuItems) % totalMenuItems;
          return newIndex;
        });
      }

      if (event.key === 'Enter' && selectedMenuIndex !== -1) {
        event.preventDefault();
        event.stopPropagation();

        // Execute the action based on selectedMenuIndex
        const actions = [
          handleTurnInto,
          handleAddDescription,
          handleDuplicate,
          handleMoveTo,
          handleDelete,
          handleInsertAbove,
          handleInsertBelowFromMenu,
          handleCopyLink,
        ];

        actions[selectedMenuIndex]?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    isMainMenuKeyboardActive,
    selectedMenuIndex,
    totalMenuItems,
    handleTurnInto,
    handleAddDescription,
    handleDuplicate,
    handleMoveTo,
    handleDelete,
    handleInsertAbove,
    handleInsertBelowFromMenu,
    handleCopyLink,
  ]);

  // Auto-scroll selected item into view (ONLY for main menu)
  useEffect(() => {
    if (
      !isMainMenuKeyboardActive ||
      selectedMenuIndex === -1 ||
      !menuContainerRef.current
    )
      return;

    const items = menuContainerRef.current.querySelectorAll('button');
    const selectedItem = items[selectedMenuIndex];

    if (selectedItem) {
      selectedItem.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isMainMenuKeyboardActive, selectedMenuIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: CHROME_CONFIG.Z_INDEX,
      }}
    >
      {/* Left Chrome */}
      <div
        {...chromeContainerHandlers}
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          gap: CHROME_CONFIG.GAP,
          transform: `translate(${chrome.x - CHROME_CONFIG.GUTTER_LEFT}px, ${chrome.y}px)`,
          opacity: shouldShow ? 1 : 0,
          pointerEvents: shouldShow ? 'auto' : 'none',
          transition: `opacity ${CHROME_CONFIG.TRANSITION_DURATION}ms ease`,
        }}
      >
        <button
          onClick={handleInsertBelow}
          onMouseDown={(e) => e.preventDefault()}
          {...buttonHoverHandlers}
          style={{
            ...baseButtonStyle,
            width: CHROME_CONFIG.BUTTON_SIZE,
            height: CHROME_CONFIG.BUTTON_SIZE,
            // cursor: 'pointer',
          }}
          aria-label="Insert block below"
        >
          <Plus size={CHROME_CONFIG.ICON_SIZE} />
        </button>

        <button
          onClick={handleBlockSelect}
          onMouseDown={(e) => e.preventDefault()}
          {...buttonHoverHandlers}
          style={{
            ...baseButtonStyle,
            width: CHROME_CONFIG.HANDLER_WIDTH,
            height: CHROME_CONFIG.BUTTON_SIZE,
            // cursor: 'grab',
          }}
          aria-label="Select block"
        >
          <DotsSixVertical size={CHROME_CONFIG.ICON_SIZE} weight="bold" />
        </button>
      </div>

      {/* Right Chrome */}
      <div
        {...chromeContainerHandlers}
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          transform: `translate(${chrome.x + chrome.width}px, ${chrome.y}px)`,
          opacity: shouldShow ? 1 : 0,
          pointerEvents: shouldShow ? 'auto' : 'none',
          transition: `opacity ${CHROME_CONFIG.TRANSITION_DURATION}ms ease`,
        }}
      >
        <button
          ref={menuButtonRef}
          onClick={handleOpenMenu}
          onMouseDown={(e) => e.preventDefault()}
          {...buttonHoverHandlers}
          style={{
            ...baseButtonStyle,
            width: CHROME_CONFIG.BUTTON_SIZE,
            height: CHROME_CONFIG.BUTTON_SIZE,
            // cursor: 'pointer',
          }}
          aria-label={shouldShowDismissIcon ? 'Close menu' : 'Block options'}
        >
          {shouldShowDismissIcon ? (
            <X size={CHROME_CONFIG.ICON_SIZE} weight="bold" />
          ) : (
            <MoreHorizontal size={CHROME_CONFIG.ICON_SIZE} weight="bold" />
          )}
        </button>
      </div>

      {/* Block Options Menu */}
      {isMenuOpen && menuPosition && (
        <DropdownContainer
          isOpen={isMenuOpen}
          position={menuPosition}
          onClose={() => {
            setIsMenuOpen(false);
            resetMenuToMain();
            // Schedule hide check when menu closes (will hide if not hovering chrome)
            scheduleHide();
          }}
        >
          <div ref={menuContainerRef}>
            {menuView === 'main' ? (
              // Main menu view
              <>
                <DropdownItem
                  icon={<Type size={16} />}
                  label="Turn into"
                  trailing={<ChevronRight size={14} />}
                  onClick={handleTurnInto}
                  isSelected={selectedMenuIndex === 0}
                  onMouseEnter={() => setSelectedMenuIndex(0)}
                />
                <DropdownItem
                  icon={<FileText size={16} />}
                  label={
                    blockHasDescription
                      ? 'Edit description'
                      : 'Add a description'
                  }
                  onClick={handleAddDescription}
                  isSelected={selectedMenuIndex === 1}
                  onMouseEnter={() => setSelectedMenuIndex(1)}
                  disabled={isMultiSelected}
                />

                <DropdownSeparator />

                <DropdownItem
                  icon={<Copy size={16} />}
                  label="Duplicate"
                  onClick={handleDuplicate}
                  isSelected={selectedMenuIndex === 2}
                  onMouseEnter={() => setSelectedMenuIndex(2)}
                />
                <DropdownItem
                  icon={<Folder size={16} />}
                  label="Move to"
                  onClick={handleMoveTo}
                  isSelected={selectedMenuIndex === 3}
                  onMouseEnter={() => setSelectedMenuIndex(3)}
                />
                <DropdownItem
                  icon={<Trash2 size={16} />}
                  label="Delete"
                  onClick={handleDelete}
                  isSelected={selectedMenuIndex === 4}
                  onMouseEnter={() => setSelectedMenuIndex(4)}
                />

                <DropdownSeparator />

                <DropdownItem
                  icon={<ArrowUpDown size={16} />}
                  label="Insert block above"
                  onClick={handleInsertAbove}
                  isSelected={selectedMenuIndex === 5}
                  onMouseEnter={() => setSelectedMenuIndex(5)}
                />
                <DropdownItem
                  icon={<ArrowUpDown size={16} />}
                  label="Insert block below"
                  onClick={handleInsertBelowFromMenu}
                  isSelected={selectedMenuIndex === 6}
                  onMouseEnter={() => setSelectedMenuIndex(6)}
                />
                <DropdownItem
                  icon={<Link size={16} />}
                  label={
                    isMultiSelected
                      ? `Copy link to all (${selectedCount})`
                      : 'Copy link to block'
                  }
                  onClick={handleCopyLink}
                  isSelected={selectedMenuIndex === 7}
                  onMouseEnter={() => setSelectedMenuIndex(7)}
                />

                <DropdownSeparator />

                <DropdownHeader
                  label={`Created: ${blockTimestamps.createdAt ? formatDateTime(new Date(blockTimestamps.createdAt)) : 'N/A'}`}
                  hint=""
                />
                <DropdownHeader
                  label={`Last edited: ${blockTimestamps.updatedAt ? formatDateTime(new Date(blockTimestamps.updatedAt)) : 'N/A'}`}
                  hint=""
                />
              </>
            ) : (
              // Turn Into view (command picker)
              <>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '4px',
                    // marginBottom: '8px',
                  }}
                >
                  <Button
                    variant="tertiary"
                    onClick={handleBackToMenu}
                    icon={<ChevronLeft size={16} />}
                  />

                  {/* <Input
                    autoFocus
                    placeholder="Search block types..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  /> */}
                </div>

                <div ref={commandListRef}>
                  <CommandList
                    items={commandItems}
                    selectedIndex={commandSelectedIndex}
                    onSelect={(index) => {
                      const command = filteredCommands[index];
                      if (command) {
                        handleSlashCommandSelect(command);
                      }
                    }}
                    onItemHover={(index) => {
                      // Gate hover updates after keyboard navigation starts (ownership enforcement)
                      if (hasKeyboardNavigatedRef.current) return;
                      setCommandSelectedIndex(index);
                    }}
                    showGroups={searchQuery === ''}
                    groupLabels={{
                      text: 'Basic Blocks',
                      lists: 'Lists',
                      media: 'Media',
                      callouts: 'Callouts',
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </DropdownContainer>
      )}
    </div>
  );
}
