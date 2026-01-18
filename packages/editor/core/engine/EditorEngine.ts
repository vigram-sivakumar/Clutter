/**
 * EditorEngine - The headless brain of the editor
 *
 * This is NOT a React component.
 * This is NOT TipTap.
 * This is NOT UI.
 *
 * This is pure editor state and logic.
 *
 * RESPONSIBILITIES:
 * - Hold document tree
 * - Manage selection/focus/cursor
 * - Track interaction mode
 * - Execute commands
 * - Manage history (undo/redo)
 *
 * React renders this. It does not control it.
 *
 * This is the Apple difference.
 */

import type {
  BlockTree,
  BlockId,
  EditorSelection,
  EditorFocus,
  EditorCursor,
  InteractionMode,
} from './types';
import type { EditorCommand } from './command';
import { ModeManager } from './mode';
import { UndoController } from './undoController';

export type EngineChangeListener = (_engine: EditorEngine) => void;

/**
 * EditorEngine - The single source of truth
 */
export class EditorEngine {
  // ===== DOCUMENT STATE =====
  public tree: BlockTree;
  public selection: EditorSelection;
  public focus: EditorFocus;
  public cursor: EditorCursor;

  // ===== INTERACTION STATE =====
  private modeManager: ModeManager;

  // ===== HISTORY =====
  public undoController: UndoController;

  // ===== LISTENERS =====
  private listeners: Set<EngineChangeListener> = new Set();

  // ===== BATCH UPDATES =====
  private isBatching = false;
  private batchedChanges = false;

  constructor(initialTree?: BlockTree) {
    // Initialize with empty document if not provided
    this.tree = initialTree || {
      rootId: 'root',
      nodes: {
        root: {
          id: 'root',
          type: 'doc',
          parentId: null,
          children: [],
          content: null,
        },
      },
    };

    this.selection = { kind: 'none' };
    this.focus = { blockId: null };
    this.cursor = null;
    this.modeManager = new ModeManager();
    this.undoController = new UndoController(this);
  }

  // ===== MODE MANAGEMENT =====

  getMode(): InteractionMode {
    return this.modeManager.getMode();
  }

  setMode(mode: InteractionMode, reason?: string): void {
    this.modeManager.setMode(mode, reason);
  }

  pushMode(mode: InteractionMode, reason?: string): void {
    this.modeManager.pushMode(mode, reason);
  }

  popMode(reason?: string): void {
    this.modeManager.popMode(reason);
  }

  resetMode(reason?: string): void {
    this.modeManager.reset(reason);
  }

  isIntentAllowed(intentType: string): boolean {
    return this.modeManager.isIntentAllowed(intentType);
  }

  // ===== COMMAND DISPATCH =====

  /**
   * Dispatch a command to the engine
   *
   * This is the ONLY way to mutate engine state.
   *
   * Every command:
   * - Goes through UndoController (grouping logic)
   * - Can be undone
   * - Triggers change listeners
   */
  dispatch(command: EditorCommand): void {
    // Apply the command
    command.apply(this);

    // Add to undo controller (handles grouping automatically)
    this.undoController.addCommand(command);

    // Notify listeners (unless batching)
    if (!this.isBatching) {
      this.notifyListeners();
    } else {
      this.batchedChanges = true;
    }
  }

  /**
   * Undo last command (or group)
   *
   * Delegates to UndoController which handles:
   * - Group flushing
   * - State restoration (cursor + selection)
   * - History management
   */
  undo(): boolean {
    const success = this.undoController.undo();
    if (success) {
      this.notifyListeners();
    }
    return success;
  }

  /**
   * Redo last undone command (or group)
   *
   * Delegates to UndoController which handles:
   * - State restoration (cursor + selection)
   * - History management
   */
  redo(): boolean {
    const success = this.undoController.redo();
    if (success) {
      this.notifyListeners();
    }
    return success;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoController.canUndo();
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.undoController.canRedo();
  }

  // ===== BATCH UPDATES =====

  /**
   * Batch multiple commands into one render cycle
   *
   * Example:
   * ```ts
   * engine.batch(() => {
   *   engine.dispatch(cmd1);
   *   engine.dispatch(cmd2);
   *   engine.dispatch(cmd3);
   * }); // Only notifies listeners once
   * ```
   */
  batch(fn: () => void): void {
    this.isBatching = true;
    this.batchedChanges = false;

    try {
      fn();
    } finally {
      this.isBatching = false;

      if (this.batchedChanges) {
        this.notifyListeners();
        this.batchedChanges = false;
      }
    }
  }

  // ===== LISTENERS =====

  /**
   * Subscribe to engine changes
   *
   * Returns unsubscribe function
   */
  onChange(fn: EngineChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => fn(this));
  }

  // ===== HELPERS =====

  /**
   * Get block by ID
   */
  getBlock(blockId: BlockId) {
    return this.tree.nodes[blockId] || null;
  }

  /**
   * Get all children of a block
   */
  getChildren(blockId: BlockId) {
    const block = this.getBlock(blockId);
    if (!block) return [];
    return block.children.map((id) => this.tree.nodes[id]).filter(Boolean);
  }

  /**
   * Get parent of a block
   */
  getParent(blockId: BlockId) {
    const block = this.getBlock(blockId);
    if (!block || !block.parentId) return null;
    return this.tree.nodes[block.parentId] || null;
  }

  /**
   * Get siblings of a block (including itself)
   */
  getSiblings(blockId: BlockId) {
    const parent = this.getParent(blockId);
    if (!parent) return [];
    return parent.children.map((id) => this.tree.nodes[id]).filter(Boolean);
  }

  /**
   * Get index of block within its parent
   */
  getIndexInParent(blockId: BlockId): number {
    const parent = this.getParent(blockId);
    if (!parent) return -1;
    return parent.children.indexOf(blockId);
  }

  /**
   * Check if block has children
   */
  hasChildren(blockId: BlockId): boolean {
    const block = this.getBlock(blockId);
    return block ? block.children.length > 0 : false;
  }

  /**
   * Get depth of block (0 = root)
   */
  getDepth(blockId: BlockId): number {
    let depth = 0;
    let current = this.getBlock(blockId);

    while (current && current.parentId) {
      depth++;
      current = this.getBlock(current.parentId);
    }

    return depth;
  }

  /**
   * Get debug snapshot
   */
  getDebugInfo() {
    return {
      tree: this.tree,
      selection: this.selection,
      focus: this.focus,
      cursor: this.cursor,
      mode: this.modeManager.getDebugInfo(),
      history: {
        past: this.history.length,
        future: this.future.length,
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
      },
    };
  }

  // ===== STATE SETTERS =====

  /**
   * Set cursor position
   */
  setCursor(cursor: EditorCursor | null): void {
    this.cursor = cursor;
  }

  /**
   * Set selection state
   */
  setSelection(selection: EditorSelection): void {
    this.selection = selection;
  }

  /**
   * Set focus block
   */
  setFocus(focus: EditorFocus): void {
    this.focus = focus;
  }

  /**
   * Update entire block tree
   */
  updateBlockTree(tree: BlockTree): void {
    this.tree = tree;
  }

  // ===== STRUCTURAL POLICIES =====

  /**
   * Check if a block can be nested under another block
   *
   * Policy hook for indent operations.
   * Returns false if nesting would violate structural rules.
   */
  canNest(_childId: BlockId, _parentId: BlockId): boolean {
    // For now, allow all nesting
    // Future: check block type policies (e.g., can't nest heading under heading)
    return true;
  }

  /**
   * Check if a block can be outdented
   *
   * Policy hook for outdent operations.
   * Returns false if outdenting would violate structural rules.
   */
  canOutdent(blockId: BlockId): boolean {
    const parent = this.getParent(blockId);
    if (!parent) return false; // Already at root

    const grandParent = this.getParent(parent.id);
    if (!grandParent) return false; // Parent is root, can't outdent

    return true;
  }

  /**
   * Set cursor position after a structural move
   *
   * Conservative cursor placement: keep cursor in same block, same offset if possible.
   * Never jumps to parent or sibling.
   */
  setCursorAfterStructuralMove(blockId: BlockId): void {
    const block = this.getBlock(blockId);
    if (!block) return;

    // Keep cursor in the moved block
    // If cursor was already there, preserve offset
    if (this.cursor && this.cursor.blockId === blockId) {
      // Cursor stays where it was (offset preserved)
      return;
    }

    // Otherwise, place cursor at start of block
    this.setCursor({
      blockId,
      offset: 0,
    });

    this.setFocus({ blockId });
  }

  // ===== DELETION PRIMITIVES =====

  /**
   * Delete a block with automatic child promotion
   *
   * EDITOR LAW #8: Child Promotion Invariant
   * - When a block is deleted, its direct children are promoted to the deleted block's parent
   * - No child is ever orphaned
   * - No subtree is deleted implicitly
   *
   * This is the ONLY way blocks should be deleted in the editor.
   *
   * @param blockId - The block to delete
   * @returns Deletion metadata for undo (or null if deletion failed)
   *
   * IMPLEMENTATION FOLLOWS: ENGINE_CHILD_DELETION_CONTRACT.md
   * Order of operations (atomic):
   * 1. Get block to delete
   * 2. Get block's children (if any)
   * 3. Get block's parent
   * 4. Get block's index in parent.children
   * 5. Remove block from parent.children
   * 6. Insert children at same index in parent.children
   * 7. Update each child's parentBlockId to new parent
   * 8. Store original state for undo
   * 9. Delete block from tree
   */
  deleteBlock(blockId: BlockId): {
    deletedBlock: import('./types').BlockNode;
    promotedChildren: BlockId[];
    originalParentId: BlockId | null;
    originalIndex: number;
  } | null {
    // Step 1: Get block to delete
    const block = this.getBlock(blockId);
    if (!block) {
      return null;
    }

    // Step 2: Get block's children (if any)
    const children = [...block.children]; // Clone array for safety

    // Step 3: Get block's parent
    const parent = this.getParent(blockId);
    if (!parent) {
      return null;
    }

    // Step 4: Get block's index in parent.children
    const indexInParent = parent.children.indexOf(blockId);
    if (indexInParent === -1) {
      return null;
    }

    // Store original state for undo
    const deletionMetadata = {
      deletedBlock: { ...block },
      promotedChildren: children,
      originalParentId: block.parentId,
      originalIndex: indexInParent,
    };

    // Step 5: Remove block from parent.children
    parent.children = parent.children.filter((id) => id !== blockId);

    // Step 6: Insert children at same index in parent.children
    // Children replace the deleted block's position
    parent.children.splice(indexInParent, 0, ...children);

    // Step 7: Update each child's parentBlockId to new parent
    for (const childId of children) {
      const child = this.tree.nodes[childId];
      if (child) {
        child.parentId = parent.id;
      }
    }

    // Step 9: Delete block from tree
    delete this.tree.nodes[blockId];

    return deletionMetadata;
  }
}
