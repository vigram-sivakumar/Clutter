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
import { Plus, MoreHorizontal, DotsSixVertical } from '@clutter/ui';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { spacing } from '../tokens';

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
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function EditorChromeLayer({ editor, containerRef }: EditorChromeLayerProps) {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Refs
  // ─────────────────────────────────────────────────────────────────────────

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isOverChromeRef = useRef(false);
  const anchorBlockPosRef = useRef<number | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      if (!isOverChromeRef.current) {
        setChrome(prev => ({ ...prev, blockId: null, visible: false }));
      }
    }, CHROME_CONFIG.HIDE_DELAY);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Hover Detection
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
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
      setChrome({
        blockId,
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        visible: true,
      });
    });
  }, [containerRef, scheduleHide]);

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
    view.focus();
    
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

    view.focus();
  }, [chrome.blockId, editor]);

  const handleOpenMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Open menu for block:', chrome.blockId);
  }, [chrome.blockId]);

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

  const shouldShow = chrome.visible && !isTyping;

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
          onClick={handleOpenMenu}
          onMouseDown={(e) => e.preventDefault()}
          {...buttonHoverHandlers}
          style={{
            ...baseButtonStyle,
            width: CHROME_CONFIG.BUTTON_SIZE,
            height: CHROME_CONFIG.BUTTON_SIZE,
            // cursor: 'pointer',
          }}
          aria-label="Block options"
        >
          <MoreHorizontal size={CHROME_CONFIG.ICON_SIZE} weight="bold" />
        </button>
      </div>
    </div>
  );
}
