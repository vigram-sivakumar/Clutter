/**
 * BlockHandle - Drag handle with actions menu (Craft/Notion style)
 *
 * Shows ⋮⋮ icon on hover to the left of every block
 * - Click to select block and open actions menu
 * - Menu stays open until item selected or click outside
 */

import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  DragHandle,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Type,
} from '@clutter/ui';
import { useEditorTheme } from '../theme/EditorThemeContext';
import {
  isMultiBlockSelection,
  getSelectedBlocks,
  executeOnSelectedBlocks,
  getSelectedBlockCount,
} from '../utils/multiSelection';

export interface BlockHandleProps {
  editor: Editor;
  getPos: () => number | undefined;
  indent?: number; // Optional indent offset (for nested blocks)
}

// Shared anchor position for Shift+Click range selection (Finder-style)
let anchorBlockPos: number | null = null;

export function BlockHandle({ editor, getPos, indent = 0 }: BlockHandleProps) {
  const { colors } = useEditorTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [isFirstInMultiSelection, setIsFirstInMultiSelection] = useState(false);
  const [isInMultiSelection, setIsInMultiSelection] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [hasMouseMovedAfterTyping, setHasMouseMovedAfterTyping] =
    useState(true);
  const [menuPosition, setMenuPosition] = useState<{
    top: string;
    transform: string;
  }>({
    top: '50%',
    transform: 'translateY(-50%)',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Detect typing activity to temporarily hide handles (Notion behavior)
  useEffect(() => {
    const handleTyping = () => {
      setIsTyping(true);
      setHasMouseMovedAfterTyping(false); // Require mouse movement after typing

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set new timeout: mark typing as stopped after 1 second
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        // Note: handles stay hidden until mouse moves (hasMouseMovedAfterTyping)
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

  // Track mouse movement to re-enable handles after typing (Notion behavior)
  useEffect(() => {
    const handleMouseMove = () => {
      if (!hasMouseMovedAfterTyping) {
        setHasMouseMovedAfterTyping(true);
      }
    };

    // Listen to global mouse movement
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [hasMouseMovedAfterTyping]);

  // Reset anchor when user clicks in editor content (not on a handle)
  useEffect(() => {
    const handleSelectionChange = () => {
      const { selection } = editor.state;

      // If selection is just a cursor (collapsed), reset anchor
      if (selection.empty) {
        anchorBlockPos = null;
      }
    };

    editor.on('selectionUpdate', handleSelectionChange);

    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Detect multi-block selection and determine if this is the first block
  useEffect(() => {
    const checkMultiSelection = () => {
      const pos = getPos();
      if (pos === undefined) return;

      const { selection } = editor.state;
      const { from, to } = selection;

      // Reset flags when selection is empty (just a cursor) - no multi-selection
      if (from === to) {
        setIsFirstInMultiSelection(false);
        setIsInMultiSelection(false);
        return;
      }

      // Use the reliable isMultiBlockSelection utility
      const multiSelected = isMultiBlockSelection(editor);
      setIsInMultiSelection(multiSelected);

      if (multiSelected) {
        // Get all selected blocks and check if this is the first one
        const blocks = getSelectedBlocks(editor);
        if (blocks.length > 0) {
          const firstBlockPos = blocks[0].pos;
          setIsFirstInMultiSelection(pos === firstBlockPos);
        } else {
          setIsFirstInMultiSelection(false);
        }
      } else {
        setIsFirstInMultiSelection(false);
      }
    };

    checkMultiSelection();
    editor.on('selectionUpdate', checkMultiSelection);
    editor.on('update', checkMultiSelection); // Also check on general updates
    return () => {
      editor.off('selectionUpdate', checkMultiSelection);
      editor.off('update', checkMultiSelection);
    };
  }, [editor, getPos]);

  // Close menu when this block is no longer selected
  useEffect(() => {
    const handleSelectionUpdate = () => {
      const pos = getPos();
      if (pos === undefined) return;

      const { selection } = editor.state;

      // If selection is a NodeSelection but not on this block, close menu
      if (selection instanceof NodeSelection) {
        if (selection.$from.pos !== pos) {
          setShowMenu(false);
        }
      } else {
        // If selection is not a NodeSelection at all, close menu
        setShowMenu(false);
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => editor.off('selectionUpdate', handleSelectionUpdate);
  }, [editor, getPos]);

  // Calculate menu position to ensure it stays within viewport
  useEffect(() => {
    if (showMenu && menuRef.current && handleRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const handleRect = handleRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate ideal centered position
      const idealTop = handleRect.top + handleRect.height / 2;
      const menuHalfHeight = menuRect.height / 2;

      // Check if menu would overflow top or bottom
      const wouldOverflowTop = idealTop - menuHalfHeight < 10;
      const wouldOverflowBottom =
        idealTop + menuHalfHeight > viewportHeight - 10;

      if (wouldOverflowTop) {
        // Align to top with small margin
        setMenuPosition({ top: '0px', transform: 'none' });
      } else if (wouldOverflowBottom) {
        // Align to bottom
        setMenuPosition({ top: 'auto', transform: 'none' });
      } else {
        // Center vertically
        setMenuPosition({ top: '50%', transform: 'translateY(-50%)' });
      }
    }
  }, [showMenu]);
  // Select the block when clicking the handle
  const handleClick = (e?: React.MouseEvent) => {
    const pos = getPos();
    if (pos === undefined) return;

    // Shift+Click: Range selection (Finder-style)
    if (e?.shiftKey && anchorBlockPos !== null && anchorBlockPos !== pos) {
      const doc = editor.state.doc;

      // Get the anchor and target block nodes
      const anchorNode = doc.nodeAt(anchorBlockPos);
      const targetNode = doc.nodeAt(pos);

      if (anchorNode && targetNode) {
        // Determine selection direction
        const firstBlockPos = Math.min(anchorBlockPos, pos);
        const lastBlockPos = Math.max(anchorBlockPos, pos);

        // Calculate positions inside the content (not at block boundaries)
        // This ensures the selection is properly detected as multi-block
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

    // Normal click (without Shift):
    // - If in multi-selection and clicking first block, keep selection (for bulk actions)
    // - Otherwise, select just this block and reset anchor

    if (isInMultiSelection && isFirstInMultiSelection) {
      // Clicking the first block's handle in a multi-selection: keep the selection
      // (user wants to perform bulk action on all selected blocks)
      editor.view.focus();
      return; // Don't reset anchor, don't change selection
    }

    // Normal single-block selection (or clicking non-first block in multi-selection)
    // Reset anchor and select just this block
    anchorBlockPos = pos;

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔒 SELECTION INVARIANT: Halo click updates ENGINE selection, NOT PM selection
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // BEFORE (WRONG): editor.chain().focus().setNodeSelection(pos).run()
    //   - Created PM NodeSelection
    //   - Leaked view authority into model
    //   - Caused delete/backspace/keyboard bugs
    //
    // AFTER (CORRECT): engine.selection = { kind: 'block', blockIds: [...] }
    //   - Updates Engine selection only
    //   - PM selection stays TextSelection (doesn't move)
    //   - Halo is view affordance, not selection authority
    //
    // ═══════════════════════════════════════════════════════════════════════════

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    const blockId = node.attrs?.blockId;
    if (!blockId) {
      return;
    }

    // Get engine from editor (attached by EditorCore)
    const engine = (editor as any)._engine;
    if (!engine) {
      return;
    }

    // Update ENGINE selection (not ProseMirror)
    engine.selection = {
      kind: 'block',
      blockIds: [blockId],
    };

    // Ensure editor has focus (but don't move cursor)
    if (!editor.view.hasFocus()) {
      editor.view.focus();
    }

    // 🎯 EXCEPTION: For empty text blocks with explicit EDIT intent,
    // place cursor inside to enable immediate typing.
    // This is NOT for structural selection - it's for UX convenience.
    //
    // NOTE: This exception may be removed once Engine-driven cursor
    // placement is implemented. For now, it's a contained UX improvement.
    if (node.isTextblock && node.content.size === 0) {
      // Empty block: place cursor inside for editing
      editor
        .chain()
        .setTextSelection(pos + 1)
        .run();
    }
  };

  const handleDelete = () => {
    if (isMultiBlockSelection(editor)) {
      // Bulk delete all selected blocks
      const blocks = getSelectedBlocks(editor);

      // Delete in reverse order to preserve positions
      let tr = editor.state.tr;
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        // Delete the entire block including its wrapper
        tr = tr.delete(block.pos, block.pos + block.nodeSize);
      }

      // After deletion, place cursor inside the remaining content
      // This prevents "sticky halo" and allows immediate typing
      const pos = Math.min(tr.doc.content.size - 1, tr.selection.from);
      if (pos >= 0) {
        tr.setSelection(TextSelection.create(tr.doc, pos));
      }

      editor.view.dispatch(tr);
      editor.view.focus();
      setShowMenu(false);
      return;
    }

    // Single block delete
    const pos = getPos();
    if (pos === undefined) return;

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    // Delete the block
    const tr = editor.state.tr.deleteRange(pos, pos + node.nodeSize);

    // After deletion, place cursor inside the remaining content
    // This prevents "sticky halo" and allows immediate typing
    const cursorPos = Math.min(tr.doc.content.size - 1, pos);
    if (cursorPos >= 0) {
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));
    }

    editor.view.dispatch(tr);
    editor.view.focus();
    setShowMenu(false);
  };

  const handleDuplicate = () => {
    if (isMultiBlockSelection(editor)) {
      // Bulk duplicate all selected blocks
      const blocks = getSelectedBlocks(editor);
      if (blocks.length === 0) return;

      // Insert ALL duplicates as a group after the last selected block (Notion behavior)
      const lastBlock = blocks[blocks.length - 1];
      let insertPos = lastBlock.pos + lastBlock.nodeSize;

      let tr = editor.state.tr;

      // Insert each duplicate at the end position
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        // Clone the node and assign new blockId immediately
        const duplicateNode = block.node.copy(block.node.content);
        const newAttrs = {
          ...duplicateNode.attrs,
          blockId: crypto.randomUUID(), // 🔒 BLOCK IDENTITY LAW: Assign new ID eagerly
        };

        // Create new node with new blockId
        const newNode = duplicateNode.type.create(
          newAttrs,
          duplicateNode.content,
          duplicateNode.marks
        );

        tr = tr.insert(insertPos, newNode);
        insertPos += nodeWithoutId.nodeSize;
      }

      editor.view.dispatch(tr);
      editor.commands.focus();
      setShowMenu(false);
      return;
    }

    // Single block duplicate
    const pos = getPos();
    if (pos === undefined) return;

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize, node.toJSON())
      .run();
    setShowMenu(false);
  };

  const handleMoveUp = () => {
    if (isMultiBlockSelection(editor)) {
      // Bulk move all selected blocks up
      const blocks = getSelectedBlocks(editor);
      if (blocks.length === 0) return;

      const firstBlock = blocks[0];
      if (firstBlock.pos === 0) return; // Already at top

      const { doc } = editor.state;

      // Find the block immediately before the first selected block
      let prevBlockPos = -1;
      let prevBlockSize = 0;

      doc.forEach((node, offset) => {
        if (offset < firstBlock.pos) {
          prevBlockPos = offset;
          prevBlockSize = node.nodeSize;
        }
      });

      if (prevBlockPos === -1) return; // No previous block

      // Build transaction: delete selected blocks, then insert before previous
      let tr = editor.state.tr;

      // Collect the nodes before deleting
      const nodesToMove = blocks.map((b) => b.node.copy(b.node.content));

      // Delete blocks in reverse order
      for (let i = blocks.length - 1; i >= 0; i--) {
        tr = tr.delete(blocks[i].pos, blocks[i].pos + blocks[i].nodeSize);
      }

      // Insert blocks at new position (before the previous block)
      let insertPos = prevBlockPos;
      for (const node of nodesToMove) {
        tr = tr.insert(insertPos, node);
        insertPos += node.nodeSize;
      }

      editor.view.dispatch(tr);
      editor.commands.focus();
      setShowMenu(false);
      return;
    }

    // Single block move up
    const pos = getPos();
    if (pos === undefined || pos === 0) return;

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    const $pos = editor.state.doc.resolve(pos);
    const indexInParent = $pos.index($pos.depth);

    if (indexInParent === 0) return;

    const prevNode = $pos.parent.child(indexInParent - 1);
    const prevNodePos = pos - prevNode.nodeSize;

    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(prevNodePos, node.toJSON())
      .run();
    setShowMenu(false);
  };

  const handleMoveDown = () => {
    if (isMultiBlockSelection(editor)) {
      // Bulk move all selected blocks down
      const blocks = getSelectedBlocks(editor);
      if (blocks.length === 0) return;

      const { doc } = editor.state;
      const lastBlock = blocks[blocks.length - 1];
      const lastBlockEnd = lastBlock.pos + lastBlock.nodeSize;

      // Find the block immediately after the last selected block
      let nextBlockPos = -1;
      let nextBlockSize = 0;
      let found = false;

      doc.forEach((node, offset) => {
        if (!found && offset >= lastBlockEnd) {
          nextBlockPos = offset;
          nextBlockSize = node.nodeSize;
          found = true;
        }
      });

      if (nextBlockPos === -1) return; // No next block

      // Build transaction: delete selected blocks, then insert after next
      let tr = editor.state.tr;

      // Collect the nodes before deleting
      const nodesToMove = blocks.map((b) => b.node.copy(b.node.content));

      // Delete blocks in reverse order
      for (let i = blocks.length - 1; i >= 0; i--) {
        tr = tr.delete(blocks[i].pos, blocks[i].pos + blocks[i].nodeSize);
      }

      // Insert blocks at new position (after the next block)
      // Note: positions shift after deletion, so recalculate
      let insertPos =
        nextBlockPos - (lastBlockEnd - blocks[0].pos) + nextBlockSize;
      for (const node of nodesToMove) {
        tr = tr.insert(insertPos, node);
        insertPos += node.nodeSize;
      }

      editor.view.dispatch(tr);
      editor.commands.focus();
      setShowMenu(false);
      return;
    }

    // Single block move down
    const pos = getPos();
    if (pos === undefined) return;

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    const $pos = editor.state.doc.resolve(pos);
    const indexInParent = $pos.index($pos.depth);

    if (indexInParent >= $pos.parent.childCount - 1) return;

    const nextNode = $pos.parent.child(indexInParent + 1);
    const nextNodePos = pos + node.nodeSize;

    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(nextNodePos + nextNode.nodeSize, node.toJSON())
      .run();
    setShowMenu(false);
  };

  const handleTurnInto = () => {
    // Turn into doesn't make sense for multi-selection, so disable it
    if (isMultiBlockSelection(editor)) {
      return;
    }

    const pos = getPos();
    if (pos === undefined) return;

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    // Set selection to this block
    editor.chain().focus().setTextSelection(pos).run();

    // Open slash command menu
    if (editor.storage.slashCommands) {
      editor.storage.slashCommands.isOpen = true;
      editor.storage.slashCommands.query = '';
      editor.storage.slashCommands.startPos = pos;
      editor.storage.slashCommands.selectedIndex = 0;
      editor.storage.slashCommands.manuallyClosedAt = null;

      const tr = editor.view.state.tr;
      tr.setMeta('forceUpdate', true);
      editor.view.dispatch(tr);
    }
    setShowMenu(false);
  };

  // Calculate handle opacity based on multi-selection state and typing activity
  const getHandleOpacity = () => {
    if (isFirstInMultiSelection) {
      // First block in multi-selection: always visible (even while typing)
      return 1;
    }
    if (isInMultiSelection) {
      // Not first block in multi-selection: always hidden
      return 0;
    }
    if (isTyping || !hasMouseMovedAfterTyping) {
      // Hide handles while typing OR until mouse moves after typing (Notion behavior)
      return 0;
    }
    // Normal behavior: visible when menu is open, otherwise controlled by CSS hover
    return showMenu ? 1 : 0;
  };

  // Check if handles should be disabled (typing or waiting for mouse movement)
  const isHandleDisabled =
    (isTyping || !hasMouseMovedAfterTyping) && !isFirstInMultiSelection;

  return (
    <div
      ref={handleRef}
      contentEditable={false}
      data-menu-open={showMenu}
      data-is-typing={isHandleDisabled ? 'true' : undefined}
      data-in-multi-selection={
        isInMultiSelection && !isFirstInMultiSelection ? 'true' : undefined
      }
      style={{
        position: 'absolute',
        left: indent - 32, // Move with indented content
        top: 0, // Align with block content (no padding on container)
        height: 24,
        opacity: getHandleOpacity(),
        // No transition for instant response
        userSelect: 'none',
        pointerEvents: isHandleDisabled ? 'none' : 'auto', // Disable interaction while typing or until mouse moves
      }}
      className="block-handle"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
          // Don't toggle menu on Shift+Click (range selection)
          if (!e.shiftKey) {
            setShowMenu(!showMenu);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 4,
          cursor: 'pointer',
          backgroundColor: 'transparent', // No background on click (like Notion/Craft)
          transition: 'background-color 0.15s ease',
        }}
      >
        <DragHandle size={16} />
      </div>

      {/* Menu positioned to the right, vertically centered */}
      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            left: 32, // To the right of the handle (24px width + 8px gap)
            top: menuPosition.top,
            bottom: menuPosition.top === 'auto' ? '0px' : undefined,
            transform: menuPosition.transform,
            minWidth: 200,
            backgroundColor: colors.background.default,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 6,
            boxShadow: `0 4px 16px ${colors.shadow.md}`,
            padding: 4,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<Copy size={16} />}
            label="Duplicate"
            onClick={handleDuplicate}
            colors={colors}
          />
          {/* Turn into only available for single block */}
          {!isMultiBlockSelection(editor) && (
            <>
              <MenuItem
                icon={<Type size={16} />}
                label="Turn into"
                onClick={handleTurnInto}
                colors={colors}
              />
              <Divider colors={colors} />
            </>
          )}
          {isMultiBlockSelection(editor) && <Divider colors={colors} />}
          <MenuItem
            icon={<ChevronUp size={16} />}
            label="Move up"
            onClick={handleMoveUp}
            colors={colors}
          />
          <MenuItem
            icon={<ChevronDown size={16} />}
            label="Move down"
            onClick={handleMoveDown}
            colors={colors}
          />
          <Divider colors={colors} />
          <MenuItem
            icon={<Trash2 size={16} />}
            label="Delete"
            onClick={handleDelete}
            colors={colors}
            danger
          />
        </div>
      )}
    </div>
  );
}

// Helper components
function MenuItem({
  icon,
  label,
  onClick,
  colors,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  colors: any;
  danger?: boolean;
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 4,
        cursor: 'pointer',
        backgroundColor: isHovered ? colors.background.tertiary : 'transparent',
        transition: 'background-color 100ms ease',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: danger ? colors.semantic.error : colors.text.secondary,
        }}
      >
        {icon}
      </div>
      <span
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: 400,
          color: danger ? colors.semantic.error : colors.text.secondary,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Divider({ colors }: { colors: any }) {
  return (
    <div
      style={{
        width: '100%',
        height: 1,
        backgroundColor: colors.border.divider,
        margin: '4px 0',
      }}
    />
  );
}
