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
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
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
  DropdownContainer,
  DropdownItem,
  DropdownSeparator,
  DropdownHeader,
} from '@clutter/ui';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { spacing } from '../tokens';
import { formatDateTime } from '../utils/dateFormatting';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION (Single place to edit all chrome behavior)
// ═══════════════════════════════════════════════════════════════════════════

const CHROME_CONFIG = {
  // Timing
  HIDE_DELAY: 150,           // ms - Grace period to move from block to chrome
  TYPING_TIMEOUT: 1000,      // ms - Hide chrome for 1s after typing
  TRANSITION_DURATION: 120,  // ms - Opacity fade duration
  
  // Layout
  GUTTER_LEFT: spacing.hoverZoneLeft,   // px - Left gutter width (matches hover-only div width)
  GUTTER_RIGHT: spacing.hoverZoneRight, // px - Right gutter width (matches hover-only div width)
  GAP: 4,                               // px - Gap between buttons
  
  // Button sizes
  BUTTON_SIZE: 24,           // px - Standard button size
  HANDLER_WIDTH: 20,         // px - Drag handler width (narrower)
  ICON_SIZE: 16,             // px - Icon size
  BORDER_RADIUS: 4,          // px - Button border radius
  
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
  createdAt?: string; // ISO string from note metadata
  updatedAt?: string; // ISO string from note metadata
  deletedAt?: string | null; // ISO string from note metadata (null if not deleted)
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function EditorChromeLayer({ editor, containerRef, createdAt, updatedAt, deletedAt }: EditorChromeLayerProps) {
  const { colors } = useEditorTheme();

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
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(-1); // -1 = no selection
  const [, forceUpdate] = useState({}); // Used to re-render when slash menu state changes

  // ─────────────────────────────────────────────────────────────────────────
  // Refs
  // ─────────────────────────────────────────────────────────────────────────

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isOverChromeRef = useRef(false);
  const anchorBlockPosRef = useRef<number | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      if (!isOverChromeRef.current && !isMenuOpen) {
        setChrome(prev => ({ ...prev, blockId: null, visible: false }));
      }
    }, CHROME_CONFIG.HIDE_DELAY);
  }, [isMenuOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // Hover Detection
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Don't update chrome position while any menu is open - keeps chrome locked on menu block
    const slashStorage = editor ? (editor.storage as any).slashCommands : null;
    const isSlashOpenFromBlockMenu = slashStorage?.isOpen && slashStorage?.openedFromBlockMenu;
    if (isMenuOpen || isSlashOpenFromBlockMenu) return;

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
    const blockElement = target?.closest('[data-block-id]') as HTMLElement | null;
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
      setChrome(prev => {
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
  }, [isMenuOpen, containerRef, scheduleHide]);

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
  // Slash Menu State Tracking
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleTransaction = () => {
      // Force re-render when slash menu state changes to update dismiss icon
      const slashStorage = (editor.storage as any).slashCommands;
      if (slashStorage?.openedFromBlockMenu !== undefined) {
        forceUpdate({});
      }
    };

    editor.on('transaction', handleTransaction);

    return () => {
      editor.off('transaction', handleTransaction);
    };
  }, [editor]);

  // ─────────────────────────────────────────────────────────────────────────
  // Chrome Actions
  // ─────────────────────────────────────────────────────────────────────────

  const handleInsertBelow = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!chrome.blockId) return;

    const { state, view } = editor;
    let blockPos: number | null = null;
    let blockNode: any = null;

    state.doc.descendants((node, pos: number) => {
      if (node.attrs.blockId === chrome.blockId) {
        blockPos = pos;
        blockNode = node;
        return false;
      }
    });

    if (blockPos === null || !blockNode) return;

    const insertPos: number = Number(blockPos) + Number(blockNode.nodeSize);
    const newParagraph = state.schema.nodes.paragraph?.create();
    
    if (!newParagraph) return;
    
    view.dispatch(state.tr.insert(insertPos, newParagraph));
    // Don't focus - user must click to focus manually
    
    const cursorPos: number = Number(insertPos) + 1;
    const newSelection = TextSelection.create(state.doc, cursorPos);
    view.dispatch(state.tr.setSelection(newSelection));
  }, [chrome.blockId, editor]);

  const handleBlockSelect = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!chrome.blockId) return;

    const { state, view } = editor;
    let blockPos: number | null = null;

    state.doc.descendants((node, pos) => {
      if (node.attrs.blockId === chrome.blockId) {
        blockPos = pos + 1;
        return false;
      }
    });

    if (blockPos === null) return;

    if (e.shiftKey && anchorBlockPosRef.current !== null) {
      // Range selection
      const from = Math.min(anchorBlockPosRef.current, blockPos);
      const to = Math.max(anchorBlockPosRef.current, blockPos);
      const rangeSelection = TextSelection.create(state.doc, from, to);
      view.dispatch(state.tr.setSelection(rangeSelection));
    } else {
      // Single block selection
      anchorBlockPosRef.current = blockPos;
      const pointSelection = TextSelection.create(state.doc, blockPos);
      view.dispatch(state.tr.setSelection(pointSelection));
    }

    // Don't focus - clicking chrome = clicking outside editor
    view.dom.blur();
  }, [chrome.blockId, editor]);

  const handleOpenMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!editor) return;
    
    const slashStorage = (editor.storage as any).slashCommands;
    
    // Check if we should close menus
    if (isMenuOpen) {
      // Block menu is open, close it
      setIsMenuOpen(false);
      return;
    }
    
    if (slashStorage?.isOpen && slashStorage?.openedFromBlockMenu) {
      // Slash menu is open from block menu, close it
      slashStorage.isOpen = false;
      slashStorage.userClosed = true;
      slashStorage.openedFromBlockMenu = false;
      slashStorage.blockMenuCallback = null;
      slashStorage.customPosition = null;
      // Dispatch transaction to update UI
      const tr = editor.view.state.tr;
      tr.setMeta('closeSlashMenu', true);
      editor.view.dispatch(tr);
      return;
    }
    
    if (!menuButtonRef.current) return;
    
    const buttonRect = menuButtonRef.current.getBoundingClientRect();
    const menuWidth = 240; // Standard dropdown width
    const gap = 8; // Gap between button and menu
    
    // Position menu to the LEFT of the button
    setMenuPosition({
      top: buttonRect.top,
      left: buttonRect.left - menuWidth - gap,
    });
    
    // Blur editor to hide caret while menu is open
    editor.view.dom.blur();
    
    setIsMenuOpen(true);
    setSelectedMenuIndex(-1); // Reset selection when menu opens
  }, [isMenuOpen, editor]);

  // ─────────────────────────────────────────────────────────────────────────
  // Block Menu Actions
  // ─────────────────────────────────────────────────────────────────────────

  const handleTurnInto = useCallback(() => {
    if (!chrome.blockId) return;

    const { state, view } = editor;
    let blockPos: number | null = null;

    // Find the block position
    state.doc.descendants((node, pos: number) => {
      if (node.attrs.blockId === chrome.blockId) {
        blockPos = pos;
        return false;
      }
    });

    if (blockPos === null) return;

    // Capture blockPos and menuPosition
    const capturedBlockPos = blockPos;
    const capturedMenuPosition = menuPosition;

    // IMPORTANT: Set slash menu state BEFORE closing block menu
    // This prevents icon flicker (ensures shouldShowDismissIcon stays true)
    const storage = (editor.storage as any).slashCommands;
    storage.isOpen = true;
    storage.query = ''; // Show all commands
    storage.startPos = capturedBlockPos + 1; // Inside the block (for content extraction)
    storage.selectedIndex = 0;
    storage.userClosed = false;
    storage.openedFromBlockMenu = true;
    storage.customPosition = capturedMenuPosition; // Use block menu position
    storage.blockMenuCallback = () => {
      // Reopen block menu when back button is clicked
      setIsMenuOpen(true);
    };

    // Close block menu (icon stays as X because slash is now marked as open)
    setIsMenuOpen(false);

    // Use setTimeout to allow React to unmount block menu before showing slash menu
    setTimeout(() => {
      // Set selection to trigger transaction event
      const newState = view.state;
      const tr = newState.tr.setSelection(
        TextSelection.create(newState.doc, capturedBlockPos + 1)
      );
      // Add meta to ensure transaction fires
      tr.setMeta('openSlashMenu', true);
      view.dispatch(tr);
      view.focus();
    }, 0); // Minimal delay just to ensure clean unmount
  }, [chrome.blockId, editor, menuPosition]);

  const handleAddDescription = useCallback(() => {
    console.log('Add description for block:', chrome.blockId);
    setIsMenuOpen(false);
    // TODO: Implement add description
  }, [chrome.blockId]);

  const handleDuplicate = useCallback(() => {
    console.log('Duplicate block:', chrome.blockId);
    setIsMenuOpen(false);
    // TODO: Implement duplicate block
  }, [chrome.blockId]);

  const handleMoveTo = useCallback(() => {
    console.log('Move to for block:', chrome.blockId);
    setIsMenuOpen(false);
    // TODO: Implement move to menu
  }, [chrome.blockId]);

  const handleDelete = useCallback(() => {
    if (!chrome.blockId) return;

    const { state, view } = editor;
    let blockPos: number | null = null;
    let blockNode: any = null;

    state.doc.descendants((node, pos: number) => {
      if (node.attrs.blockId === chrome.blockId) {
        blockPos = pos;
        blockNode = node;
        return false;
      }
    });

    if (blockPos === null || !blockNode) return;

    // TypeScript assertion: blockPos is definitely a number here due to guard above
    const from = blockPos as number;
    const to = from + blockNode.nodeSize;
    const tr = state.tr.delete(from, to);
    view.dispatch(tr);
    // Don't focus - user must click to focus manually
    
    setIsMenuOpen(false);
  }, [chrome.blockId, editor]);

  const handleInsertAbove = useCallback(() => {
    if (!chrome.blockId) return;

    const { state, view } = editor;
    let blockPos: number | null = null;

    state.doc.descendants((node, pos: number) => {
      if (node.attrs.blockId === chrome.blockId) {
        blockPos = pos;
        return false;
      }
    });

    if (blockPos === null) return;

    const newParagraph = state.schema.nodes.paragraph?.create();
    if (!newParagraph) return;

    view.dispatch(state.tr.insert(blockPos, newParagraph));
    // Don't focus - user must click to focus manually

    const cursorPos: number = Number(blockPos) + 1;
    const newSelection = TextSelection.create(state.doc, cursorPos);
    view.dispatch(state.tr.setSelection(newSelection));
    
    setIsMenuOpen(false);
  }, [chrome.blockId, editor]);

  const handleInsertBelowFromMenu = useCallback(() => {
    handleInsertBelow({} as React.MouseEvent);
    setIsMenuOpen(false);
  }, [handleInsertBelow]);

  const handleCopyLink = useCallback(() => {
    console.log('Copy link to block:', chrome.blockId);
    setIsMenuOpen(false);
    // TODO: Implement copy link to block
  }, [chrome.blockId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Get Block Timestamps
  // ─────────────────────────────────────────────────────────────────────────

  const getBlockTimestamps = useCallback(() => {
    if (!chrome.blockId) return { createdAt: null, updatedAt: null };

    const { state } = editor;
    let blockCreatedAt: string | null = null;
    let blockUpdatedAt: string | null = null;

    state.doc.descendants((node) => {
      if (node.attrs?.blockId === chrome.blockId) {
        blockCreatedAt = node.attrs.createdAt || null;
        blockUpdatedAt = node.attrs.updatedAt || null;
        return false; // Stop traversing
      }
    });

    return { createdAt: blockCreatedAt, updatedAt: blockUpdatedAt };
  }, [chrome.blockId, editor]);

  const blockTimestamps = getBlockTimestamps();

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

  // Check if any menu in the flow is open (block menu or slash menu opened from block menu)
  const slashStorage = editor ? (editor.storage as any).slashCommands : null;
  const isSlashOpenFromBlockMenu = slashStorage?.isOpen && slashStorage?.openedFromBlockMenu;
  const isAnyMenuOpen = isMenuOpen || isSlashOpenFromBlockMenu;
  
  // Show chrome when hovering (and not typing) OR when any menu in the flow is open
  const shouldShow = (chrome.visible && !isTyping) || isAnyMenuOpen;
  
  // Show dismiss icon when any menu in the flow is open
  const shouldShowDismissIcon = isAnyMenuOpen;

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

  // Keyboard handler for menu navigation
  useEffect(() => {
    if (!isMenuOpen) return;

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
          const newIndex = prev === -1 ? totalMenuItems - 1 : (prev - 1 + totalMenuItems) % totalMenuItems;
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
    isMenuOpen,
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

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!isMenuOpen || selectedMenuIndex === -1 || !menuContainerRef.current) return;

    const items = menuContainerRef.current.querySelectorAll('button');
    const selectedItem = items[selectedMenuIndex];

    if (selectedItem) {
      selectedItem.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isMenuOpen, selectedMenuIndex]);

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
            setSelectedMenuIndex(-1); // Reset selection when menu closes
            // Schedule hide check when menu closes (will hide if not hovering chrome)
            scheduleHide();
          }}
          minWidth="240px"
          maxWidth="240px"
          maxHeight="400px"
        >
          <div ref={menuContainerRef}>
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
              label="Add a description"
              onClick={handleAddDescription}
              isSelected={selectedMenuIndex === 1}
              onMouseEnter={() => setSelectedMenuIndex(1)}
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
              label="Copy link to block"
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
          </div>
        </DropdownContainer>
      )}
    </div>
  );
}
