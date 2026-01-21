/**
 * EditorChromeLayer - Top-level container for editor interaction chrome
 *
 * STEP 5: Real handle rendering (Paragraph only)
 * - Tracks hover, typing, selection, menu state
 * - Renders real handle for blocks with data-block-id
 * - Replaces BlockHandle for Paragraph blocks when USE_NEW_CHROME = true
 *
 * ARCHITECTURAL BOUNDARY:
 * - Chrome = editor-owned interaction overlay (ephemeral, hover-only)
 * - Blocks = semantic content structure (persistent, always rendered)
 * - Chrome and blocks are separate layers that must never couple
 */

import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { DragHandle } from '@clutter/ui';
import { TextSelection } from '@tiptap/pm/state';

// ═══════════════════════════════════════════════════════════════
// 🚦 KILL-SWITCH: Set to false to instantly revert to old chrome
// ═══════════════════════════════════════════════════════════════
export const USE_NEW_CHROME = true;

interface EditorChromeLayerProps {
  editor: Editor;
}

// Extended rect type with content-start offset for chrome anchoring
interface BlockRect extends DOMRect {
  contentStartOffset: number; // padding-top + border-top
}

// Shared anchor position for Shift+Click range selection (Finder-style)
let anchorBlockPos: number | null = null;

export function EditorChromeLayer({ editor }: EditorChromeLayerProps) {
  // ═══════════════════════════════════════════════════════════════
  // STATE SIGNALS (matching existing BlockHandle behavior)
  // ═══════════════════════════════════════════════════════════════

  // 1. Hover Detection
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);

  // 2. Typing Suppression (Notion-style)
  const [isTyping, setIsTyping] = useState(false);
  const [hasMouseMovedAfterTyping, setHasMouseMovedAfterTyping] =
    useState(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 3. Selection State
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);

  // 4. Menu State (for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [menuOpenForBlockId, setMenuOpenForBlockId] = useState<string | null>(
    null
  );

  // 5. Block Position Tracking (for chrome positioning)
  const [blockRects, setBlockRects] = useState<Record<string, BlockRect>>({});

  // ═══════════════════════════════════════════════════════════════
  // TYPING DETECTION (mirrors BlockHandle logic exactly)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleTyping = () => {
      setIsTyping(true);
      setHasMouseMovedAfterTyping(false);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Mark typing as stopped after 1 second
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        // Note: chrome stays hidden until mouse moves
      }, 1000);
    };

    editor.on('update', handleTyping);

    return () => {
      editor.off('update', handleTyping);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [editor]);

  // ═══════════════════════════════════════════════════════════════
  // MOUSE MOVEMENT DETECTION (re-enable chrome after typing)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleMouseMove = () => {
      if (!hasMouseMovedAfterTyping) {
        setHasMouseMovedAfterTyping(true);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [hasMouseMovedAfterTyping]);

  // ═══════════════════════════════════════════════════════════════
  // HOVER DETECTION (which block is under mouse)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      // Find closest block element with data-block-id
      const target = e.target as HTMLElement;
      const blockElement = target.closest('[data-block-id]');

      if (blockElement) {
        const blockId = blockElement.getAttribute('data-block-id');
        setHoveredBlockId(blockId);
      } else {
        setHoveredBlockId(null);
      }
    };

    document.addEventListener('mouseover', handleMouseOver);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // SELECTION TRACKING (which blocks are selected)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const updateSelection = () => {
      const { selection, doc } = editor.state;
      const { from, to } = selection;

      // Collect unique block IDs that intersect the selection
      // Use Set to prevent duplicates when selection spans multiple positions in same block
      const selectedIds = new Set<string>();

      doc.nodesBetween(from, to, (node) => {
        if (node.attrs?.blockId) {
          selectedIds.add(node.attrs.blockId);
        }
      });

      setSelectedBlockIds([...selectedIds]);
    };

    updateSelection();
    editor.on('selectionUpdate', updateSelection);
    editor.on('update', updateSelection);

    return () => {
      editor.off('selectionUpdate', updateSelection);
      editor.off('update', updateSelection);
    };
  }, [editor]);

  // ═══════════════════════════════════════════════════════════════
  // BLOCK POSITION MEASUREMENT (for chrome overlay positioning)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const updateRects = () => {
      const rects: Record<string, BlockRect> = {};

      // Find the editor-shell coordinate root
      const editorRoot = editor.view.dom.closest(
        '.editor-shell'
      ) as HTMLElement;
      if (!editorRoot) return;

      // Get editor-shell's viewport position (our coordinate system origin)
      const editorRect = editorRoot.getBoundingClientRect();

      // Measure all blocks and convert from viewport space to editor-shell space
      document.querySelectorAll('[data-block-id]').forEach((el) => {
        const id = el.getAttribute('data-block-id');
        if (!id) return;

        const blockRect = el.getBoundingClientRect();

        // Calculate content-start offset (padding + border)
        // This anchors chrome to the first line of text, not the block edge
        const styles = window.getComputedStyle(el);
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const borderTop = parseFloat(styles.borderTopWidth) || 0;
        const contentStartOffset = paddingTop + borderTop;

        // Convert viewport coordinates to editor-relative coordinates
        // This makes chrome position correctly even when scrolling
        rects[id] = {
          top: blockRect.top - editorRect.top,
          left: blockRect.left - editorRect.left,
          right: blockRect.right - editorRect.left,
          bottom: blockRect.bottom - editorRect.top,
          width: blockRect.width,
          height: blockRect.height,
          x: blockRect.x - editorRect.left,
          y: blockRect.y - editorRect.top,
          contentStartOffset, // Offset from block edge to content start
        } as BlockRect;
      });

      setBlockRects(rects);
    };

    // Update on hover/selection changes
    updateRects();

    // Update on window resize
    window.addEventListener('resize', updateRects);

    return () => {
      window.removeEventListener('resize', updateRects);
    };
  }, [hoveredBlockId, selectedBlockIds, editor]);

  // ═══════════════════════════════════════════════════════════════
  // VISIBILITY DECISION FUNCTION (matching current behavior)
  // ═══════════════════════════════════════════════════════════════

  const shouldShowChromeFor = (blockId: string): boolean => {
    // Multi-selection: only first block
    if (selectedBlockIds.length > 1) {
      return blockId === selectedBlockIds[0];
    }

    // Menu override: always show
    if (menuOpenForBlockId === blockId) {
      return true;
    }

    // Typing suppression: hide until mouse moves
    if (isTyping || !hasMouseMovedAfterTyping) {
      return false;
    }

    // Hover gate: must be hovering
    return hoveredBlockId === blockId;
  };

  // ═══════════════════════════════════════════════════════════════
  // CHROME INTERACTION (Step 5 - handle click only, no menu yet)
  // ═══════════════════════════════════════════════════════════════

  // Helper: Find block position by blockId
  const getBlockPosByBlockId = (blockId: string): number | null => {
    let foundPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.blockId === blockId) {
        foundPos = pos;
        return false; // Stop traversing
      }
    });
    return foundPos;
  };

  // Handle click on drag handle (mirrors BlockHandle logic)
  const handleHandleClick = (blockId: string, e: React.MouseEvent) => {
    const pos = getBlockPosByBlockId(blockId);
    if (pos === null) return;

    // Shift+Click: Range selection (Finder-style)
    if (e.shiftKey && anchorBlockPos !== null && anchorBlockPos !== pos) {
      const doc = editor.state.doc;

      // Get the anchor and target block nodes
      const anchorNode = doc.nodeAt(anchorBlockPos);
      const targetNode = doc.nodeAt(pos);

      if (anchorNode && targetNode) {
        // Determine selection direction
        const firstBlockPos = Math.min(anchorBlockPos, pos);
        const lastBlockPos = Math.max(anchorBlockPos, pos);

        // Calculate positions inside the content (not at block boundaries)
        const fromNode = doc.nodeAt(firstBlockPos);
        const toNode = doc.nodeAt(lastBlockPos);

        if (fromNode && toNode) {
          // Select from start of first block's content to end of last block's content
          const from = firstBlockPos + 1; // Inside first block
          const to = lastBlockPos + toNode.nodeSize - 1; // Inside last block

          // Create a TextSelection spanning the content of all blocks
          const tr = editor.state.tr.setSelection(
            TextSelection.create(doc, from, to)
          );
          editor.view.dispatch(tr);
          editor.view.focus();

          // Don't update anchor - keep it for further Shift+Clicks
          return;
        }
      }
    }

    // Normal click: reset anchor and select this block
    anchorBlockPos = pos;

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    const nodeBlockId = node.attrs?.blockId;
    if (!nodeBlockId) return;

    // Get engine from editor (attached by EditorCore)
    const engine = (editor as any)._engine;
    if (!engine) return;

    // Update ENGINE selection (not ProseMirror)
    engine.selection = {
      kind: 'block',
      blockIds: [nodeBlockId],
    };

    // Ensure editor has focus (but don't move cursor)
    if (!editor.view.hasFocus()) {
      editor.view.focus();
    }

    // For empty text blocks, place cursor inside for editing
    if (node.isTextblock && node.content.size === 0) {
      editor
        .chain()
        .setTextSelection(pos + 1)
        .run();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // DEBUG LOGGING (dev mode only - for state inspection)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[EditorChromeLayer] State:', {
        hoveredBlockId,
        isTyping,
        hasMouseMovedAfterTyping,
        selectedBlockIds,
        menuOpenForBlockId,
      });
    }
  }, [
    hoveredBlockId,
    isTyping,
    hasMouseMovedAfterTyping,
    selectedBlockIds,
    menuOpenForBlockId,
  ]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Real chrome (Step 5 - Paragraph handle only)
  // ═══════════════════════════════════════════════════════════════

  return (
    <div
      className="editor-chrome-layer"
      data-hovered-block={hoveredBlockId || undefined}
      data-is-typing={isTyping ? 'true' : undefined}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none', // Layer is non-interactive by default
        zIndex: 10,
      }}
    >
      {/* Render chrome for blocks that should show it */}
      {Object.entries(blockRects).map(([blockId, rect]) => {
        if (!shouldShowChromeFor(blockId)) return null;

        // Check if this is a paragraph block (Step 5 scope)
        const blockElement = document.querySelector(
          `[data-block-id="${blockId}"]`
        );
        const isParagraph =
          blockElement?.getAttribute('data-type') === 'paragraph';

        return (
          <div key={blockId}>
            {/* LEFT CHROME - Real handle for Paragraph only, placeholder for others */}
            {USE_NEW_CHROME && isParagraph ? (
              // REAL HANDLE (Paragraph only)
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleHandleClick(blockId, e);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: rect.top + rect.contentStartOffset, // Anchor to content-start, not block edge
                  left: rect.left - 32,
                  width: 24,
                  height: 28, // Fixed interaction target (not text height)
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 4,
                  pointerEvents: 'auto', // INTERACTIVE
                  userSelect: 'none',
                }}
              >
                <DragHandle size={16} />
              </div>
            ) : (
              // PLACEHOLDER (other blocks)
              <div
                style={{
                  position: 'absolute',
                  top: rect.top + rect.contentStartOffset, // Anchor to content-start
                  left: rect.left - 56,
                  width: 48,
                  height: 28, // Fixed interaction target
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 255, 0.05)', // Debug tint (blue)
                  borderRadius: 6,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.6, userSelect: 'none' }}>
                  ＋ ⋮⋮
                </div>
              </div>
            )}

            {/* RIGHT CHROME (placeholder - no functionality yet) */}
            <div
              style={{
                position: 'absolute',
                top: rect.top + rect.contentStartOffset, // Anchor to content-start
                left: rect.right + 8,
                width: 32,
                height: 28, // Fixed interaction target
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 0, 0, 0.05)', // Debug tint (red)
                borderRadius: 6,
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.6, userSelect: 'none' }}>
                ⋯
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
