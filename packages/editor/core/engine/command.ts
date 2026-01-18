/**
 * EditorCommand - A reversible state change
 *
 * Commands are how ALL state changes happen.
 *
 * Every command must:
 * 1. Know how to apply itself
 * 2. Know how to undo itself
 * 3. Be deterministic (same input = same output)
 *
 * This is how Apple-level undo works.
 * Not DOM-based. Not event-based. Structural.
 */

import type { EditorEngine } from './EditorEngine';
import type {
  BlockId,
  EditorSelection,
  EditorFocus,
  EditorCursor,
} from './types';

/**
 * Intent Categories - For grouping commands
 *
 * These determine whether commands can be grouped into single undo steps.
 * See UNDO_GROUPING_LAW.md for compatibility rules.
 */
export type IntentCategory =
  | 'text-insert'
  | 'text-delete-forward'
  | 'text-delete-backward'
  | 'format'
  | 'block-create'
  | 'block-delete'
  | 'block-convert'
  | 'block-move'
  | 'block-indent'
  | 'block-outdent'
  | 'toggle-adoption'
  | 'selection-change'
  | 'paste'
  | 'external';

/**
 * Command Metadata - Required for Emotional Undo
 *
 * This metadata allows the UndoController to:
 * - Group related commands
 * - Restore full editor state (cursor + selection)
 * - Make undo deterministic
 */
export interface CommandMetadata {
  /** Intent category for grouping */
  intentCategory: IntentCategory;

  /** Target block ID */
  targetBlockId: BlockId;

  /** When this command was created (for time-based grouping) */
  timestamp: number;

  /** Selection state before command */
  beforeSelection: EditorSelection;

  /** Selection state after command */
  afterSelection: EditorSelection;

  /** Focus state before command */
  beforeFocus: EditorFocus;

  /** Focus state after command */
  afterFocus: EditorFocus;

  /** Cursor state before command */
  beforeCursor: EditorCursor | null;

  /** Cursor state after command */
  afterCursor: EditorCursor | null;
}

/**
 * EditorCommand interface
 *
 * Every mutation becomes a command.
 * Every command goes through history.
 *
 * UPGRADED: Now includes metadata for Emotional Undo.
 */
export interface EditorCommand {
  /** Unique identifier for debugging */
  readonly id: string;

  /** Human-readable description */
  readonly description: string;

  /** Metadata for grouping and state restoration */
  readonly metadata: CommandMetadata;

  /** Apply this command to the engine */
  apply(_engine: EditorEngine): void;

  /** Reverse this command */
  undo(_engine: EditorEngine): void;

  /** DEPRECATED: Use metadata.intentCategory instead */
  canMerge?(_other: EditorCommand): boolean;
  merge?(_other: EditorCommand): EditorCommand;
}

/**
 * Helper: Capture current editor state for command metadata
 */
function captureEditorState(engine: EditorEngine): {
  selection: EditorSelection;
  focus: EditorFocus;
  cursor: EditorCursor | null;
} {
  return {
    selection: { ...engine.selection },
    focus: { ...engine.focus },
    cursor: engine.cursor ? { ...engine.cursor } : null,
  };
}

/**
 * Helper: Create base metadata from before/after states
 */
function createMetadata(
  intentCategory: IntentCategory,
  targetBlockId: BlockId,
  before: ReturnType<typeof captureEditorState>,
  after: ReturnType<typeof captureEditorState>
): CommandMetadata {
  return {
    intentCategory,
    targetBlockId,
    timestamp: Date.now(),
    beforeSelection: before.selection,
    afterSelection: after.selection,
    beforeFocus: before.focus,
    afterFocus: after.focus,
    beforeCursor: before.cursor,
    afterCursor: after.cursor,
  };
}

/**
 * InsertTextCommand - Insert text into a block
 *
 * TODO: Upgrade to full metadata implementation
 */
export class InsertTextCommand implements EditorCommand {
  readonly id = 'insert-text';
  readonly description: string;
  readonly metadata: CommandMetadata;

  constructor(
    private _blockId: BlockId,
    private _text: string,
    private _offset: number
  ) {
    this.description = `Insert "${_text}" at ${_offset}`;

    // TODO: Capture real before/after state
    const stubState = {
      selection: { kind: 'none' as const },
      focus: { blockId: null },
      cursor: null,
    };

    this.metadata = {
      intentCategory: 'text-insert',
      targetBlockId: _blockId,
      timestamp: Date.now(),
      beforeSelection: stubState.selection,
      afterSelection: stubState.selection,
      beforeFocus: stubState.focus,
      afterFocus: stubState.focus,
      beforeCursor: stubState.cursor,
      afterCursor: stubState.cursor,
    };
  }

  apply(_engine: EditorEngine): void {
    // TODO: Implement when we connect to ProseMirror
  }

  undo(_engine: EditorEngine): void {
    // TODO: Implement when we connect to ProseMirror
  }

  // Allow merging consecutive typing
  canMerge(_other: EditorCommand): boolean {
    if (!(_other instanceof InsertTextCommand)) return false;
    if (_other._blockId !== this._blockId) return false;
    // Only merge if typing at the end of previous insertion
    return _other._offset === this._offset + this._text.length;
  }

  merge(_other: EditorCommand): EditorCommand {
    const otherCmd = _other as InsertTextCommand;
    return new InsertTextCommand(
      this._blockId,
      this._text + otherCmd._text,
      this._offset
    );
  }
}

/**
 * DeleteTextCommand - Delete text from a block
 *
 * TODO: Upgrade to full metadata implementation
 */
export class DeleteTextCommand implements EditorCommand {
  readonly id = 'delete-text';
  readonly description: string;
  readonly metadata: CommandMetadata;

  constructor(
    private _blockId: BlockId,
    private _from: number,
    private _to: number,
    private _deletedText: string // Store for undo
  ) {
    this.description = `Delete "${_deletedText}" from ${_from} to ${_to}`;

    // TODO: Capture real before/after state
    const stubState = {
      selection: { kind: 'none' as const },
      focus: { blockId: null },
      cursor: null,
    };

    this.metadata = {
      intentCategory: 'text-delete-forward', // TODO: detect direction
      targetBlockId: _blockId,
      timestamp: Date.now(),
      beforeSelection: stubState.selection,
      afterSelection: stubState.selection,
      beforeFocus: stubState.focus,
      afterFocus: stubState.focus,
      beforeCursor: stubState.cursor,
      afterCursor: stubState.cursor,
    };
  }

  apply(_engine: EditorEngine): void {
    // TODO: Implement when we connect to ProseMirror
  }

  undo(_engine: EditorEngine): void {
    // TODO: Implement when we connect to ProseMirror
  }
}

/**
 * MoveBlockCommand - Move a block to a new position
 *
 * This is used for indent/outdent operations.
 * Captures full editor state for proper undo/redo.
 */
export class MoveBlockCommand implements EditorCommand {
  readonly id = 'move-block';
  readonly description: string;
  readonly metadata: CommandMetadata;

  constructor(params: {
    blockId: BlockId;
    oldParentId: BlockId | null;
    oldIndex: number;
    newParentId: BlockId | null;
    newIndex: number;
    intentCategory?: IntentCategory;
    engine: EditorEngine;
    editor?: any; // Optional TipTap editor to sync PM attributes
  }) {
    const {
      blockId,
      oldParentId,
      oldIndex,
      newParentId,
      newIndex,
      intentCategory = 'block-move',
      engine,
      editor,
    } = params;

    this.editor = editor;

    this.description = `Move block ${blockId} from ${oldParentId}[${oldIndex}] to ${newParentId}[${newIndex}]`;

    // Capture state before move
    const beforeState = captureEditorState(engine);

    // Apply move temporarily to capture after state
    // (We'll revert and let apply() do it for real)
    const block = engine.tree.nodes[blockId];
    if (block) {
      if (oldParentId) {
        const oldParent = engine.tree.nodes[oldParentId];
        oldParent.children = oldParent.children.filter((id) => id !== blockId);
      }
      if (newParentId) {
        const newParent = engine.tree.nodes[newParentId];
        newParent.children.splice(newIndex, 0, blockId);
      }
      block.parentId = newParentId;
    }

    const afterState = captureEditorState(engine);

    // Revert the temporary change
    if (block) {
      if (newParentId) {
        const newParent = engine.tree.nodes[newParentId];
        newParent.children = newParent.children.filter((id) => id !== blockId);
      }
      if (oldParentId) {
        const oldParent = engine.tree.nodes[oldParentId];
        oldParent.children.splice(oldIndex, 0, blockId);
      }
      block.parentId = oldParentId;
    }

    this.metadata = createMetadata(
      intentCategory,
      blockId,
      beforeState,
      afterState
    );

    // Store params for apply/undo
    this.blockId = blockId;
    this.oldParentId = oldParentId;
    this.oldIndex = oldIndex;
    this.newParentId = newParentId;
    this.newIndex = newIndex;
  }

  private blockId: BlockId;
  private oldParentId: BlockId | null;
  private oldIndex: number;
  private newParentId: BlockId | null;
  private newIndex: number;
  private editor?: any; // Optional TipTap editor

  apply(engine: EditorEngine): void {
    const block = engine.tree.nodes[this.blockId];
    if (!block) return;

    // Remove from old parent
    if (this.oldParentId) {
      const oldParent = engine.tree.nodes[this.oldParentId];
      oldParent.children = oldParent.children.filter(
        (id) => id !== this.blockId
      );
    }

    // Add to new parent
    if (this.newParentId) {
      const newParent = engine.tree.nodes[this.newParentId];
      newParent.children.splice(this.newIndex, 0, this.blockId);
    }

    block.parentId = this.newParentId;

    // 🔥 SYNC TO PROSEMIRROR: Update parentBlockId attribute
    // BlockIdGenerator will automatically update level based on this
    if (this.editor && this.editor.state) {
      this.updatePMParentBlockId(this.blockId, this.newParentId);
    }

    // Restore after-state (cursor + selection)
    engine.selection = this.metadata.afterSelection;
    engine.focus = this.metadata.afterFocus;
    engine.cursor = this.metadata.afterCursor;
  }

  /**
   * Update ProseMirror node's parentBlockId attribute
   * BlockIdGenerator will automatically sync level based on this
   *
   * CRITICAL: Also restores cursor to the moved block to prevent
   * selection from becoming stale/stuck in child blocks
   */
  private updatePMParentBlockId(
    blockId: BlockId,
    newParentId: BlockId | null
  ): void {
    if (!this.editor) return;

    const { state, view } = this.editor;
    const tr = state.tr;
    let blockPos: number | null = null;

    state.doc.descendants((node: any, pos: number) => {
      if (node.attrs?.blockId === blockId) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          parentBlockId: newParentId,
        });
        blockPos = pos;
        return false; // Stop traversing
      }
      return true;
    });

    if (blockPos !== null) {
      view.dispatch(tr);

      // Restore cursor to the moved block after PM processes the change
      requestAnimationFrame(() => {
        if (!this.editor) return;

        // Use TipTap's high-level command to set cursor position
        this.editor.commands.focus();
        this.editor.commands.setTextSelection(blockPos + 1);
      });
    }
  }

  undo(engine: EditorEngine): void {
    const block = engine.tree.nodes[this.blockId];
    if (!block) return;

    // Remove from new parent
    if (this.newParentId) {
      const newParent = engine.tree.nodes[this.newParentId];
      newParent.children = newParent.children.filter(
        (id) => id !== this.blockId
      );
    }

    // Restore to old parent
    if (this.oldParentId) {
      const oldParent = engine.tree.nodes[this.oldParentId];
      oldParent.children.splice(this.oldIndex, 0, this.blockId);
    }

    block.parentId = this.oldParentId;

    // 🔥 SYNC TO PROSEMIRROR: Restore old parentBlockId
    if (this.editor && this.editor.state) {
      this.updatePMParentBlockId(this.blockId, this.oldParentId);
    }

    // Restore before-state (cursor + selection)
    engine.selection = this.metadata.beforeSelection;
    engine.focus = this.metadata.beforeFocus;
    engine.cursor = this.metadata.beforeCursor;
  }
}

/**
 * CreateBlockCommand - Create a new block
 *
 * TODO: Upgrade to full metadata implementation
 */
export class CreateBlockCommand implements EditorCommand {
  readonly id = 'create-block';
  readonly description: string;
  readonly metadata: CommandMetadata;

  constructor(
    private blockId: BlockId,
    private blockType: string,
    private _parentId: BlockId | null,
    private _index: number,
    private _content: unknown
  ) {
    this.description = `Create ${blockType} block ${blockId}`;

    // TODO: Capture real before/after state
    const stubState = {
      selection: { kind: 'none' as const },
      focus: { blockId: null },
      cursor: null,
    };

    this.metadata = {
      intentCategory: 'block-create',
      targetBlockId: blockId,
      timestamp: Date.now(),
      beforeSelection: stubState.selection,
      afterSelection: stubState.selection,
      beforeFocus: stubState.focus,
      afterFocus: stubState.focus,
      beforeCursor: stubState.cursor,
      afterCursor: stubState.cursor,
    };
  }

  apply(engine: EditorEngine): void {
    // Create the block
    engine.tree.nodes[this.blockId] = {
      id: this.blockId,
      type: this.blockType,
      parentId: this._parentId,
      children: [],
      content: this._content,
    };

    // Add to parent's children
    if (this._parentId) {
      const parent = engine.tree.nodes[this._parentId];
      parent.children.splice(this._index, 0, this.blockId);
    }
  }

  undo(engine: EditorEngine): void {
    // Remove from parent's children
    if (this._parentId) {
      const parent = engine.tree.nodes[this._parentId];
      parent.children = parent.children.filter((id) => id !== this.blockId);
    }

    // Delete the block
    delete engine.tree.nodes[this.blockId];
  }
}

/**
 * DeleteBlockCommand - Delete a block with child promotion
 *
 * UPGRADED: Now uses engine.deleteBlock() primitive which implements
 * Editor Law #8: Child Promotion Invariant
 *
 * When a block is deleted:
 * - Direct children are promoted to the deleted block's parent
 * - No child is ever orphaned
 * - Undo restores exact original state (block + child relationships)
 *
 * See: ENGINE_CHILD_DELETION_CONTRACT.md
 */
export class DeleteBlockCommand implements EditorCommand {
  readonly id = 'delete-block';
  readonly description: string;
  readonly metadata: CommandMetadata;

  // Deletion metadata for undo
  private deletionMetadata: {
    deletedBlock: import('./types').BlockNode;
    promotedChildren: BlockId[];
    originalParentId: BlockId | null;
    originalIndex: number;
  } | null = null;

  constructor(private _blockId: BlockId) {
    this.description = `Delete block ${_blockId}`;

    // TODO: Capture real before/after state
    const stubState = {
      selection: { kind: 'none' as const },
      focus: { blockId: null },
      cursor: null,
    };

    this.metadata = {
      intentCategory: 'block-delete',
      targetBlockId: _blockId,
      timestamp: Date.now(),
      beforeSelection: stubState.selection,
      afterSelection: stubState.selection,
      beforeFocus: stubState.focus,
      afterFocus: stubState.focus,
      beforeCursor: stubState.cursor,
      afterCursor: stubState.cursor,
    };
  }

  apply(engine: EditorEngine): void {
    // Use engine primitive which implements child promotion
    this.deletionMetadata = engine.deleteBlock(this._blockId);
  }

  undo(engine: EditorEngine): void {
    if (!this.deletionMetadata) {
      return;
    }

    const { deletedBlock, promotedChildren, originalParentId, originalIndex } =
      this.deletionMetadata;

    // Step 1: Restore the deleted block to tree
    engine.tree.nodes[this._blockId] = { ...deletedBlock };

    // Step 2: Get parent
    if (!originalParentId) {
      return;
    }

    const parent = engine.tree.nodes[originalParentId];
    if (!parent) {
      return;
    }

    // Step 3: Remove promoted children from parent.children
    // (They were inserted where the deleted block was)
    parent.children = parent.children.filter(
      (id) => !promotedChildren.includes(id)
    );

    // Step 4: Restore block at original position
    parent.children.splice(originalIndex, 0, this._blockId);

    // Step 5: Restore children's parentBlockId to point back to deleted block
    for (const childId of promotedChildren) {
      const child = engine.tree.nodes[childId];
      if (child) {
        child.parentId = this._blockId;
      }
    }
  }
}

/**
 * CommandGroup - Multiple commands that undo as one unit
 *
 * This is what emotional undo produces - grouped commands.
 */
export class CommandGroup implements EditorCommand {
  readonly id = 'command-group';
  readonly description: string;
  readonly metadata: CommandMetadata;

  constructor(
    private commands: EditorCommand[],
    description?: string
  ) {
    this.description = description || `Group of ${commands.length} commands`;

    // Use first command's metadata as representative
    // (All commands in group should have compatible metadata)
    if (commands.length > 0) {
      const first = commands[0];
      const last = commands[commands.length - 1];

      this.metadata = {
        ...first.metadata,
        // Use first command's before state and last command's after state
        afterSelection: last.metadata.afterSelection,
        afterFocus: last.metadata.afterFocus,
        afterCursor: last.metadata.afterCursor,
      };
    } else {
      // Empty group fallback (shouldn't happen)
      const stubState = {
        selection: { kind: 'none' as const },
        focus: { blockId: null },
        cursor: null,
      };
      this.metadata = {
        intentCategory: 'external',
        targetBlockId: 'unknown',
        timestamp: Date.now(),
        beforeSelection: stubState.selection,
        afterSelection: stubState.selection,
        beforeFocus: stubState.focus,
        afterFocus: stubState.focus,
        beforeCursor: stubState.cursor,
        afterCursor: stubState.cursor,
      };
    }
  }

  apply(engine: EditorEngine): void {
    for (const cmd of this.commands) {
      cmd.apply(engine);
    }
  }

  undo(engine: EditorEngine): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo(engine);
    }
  }
}
