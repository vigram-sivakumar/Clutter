/**
 * UndoController - Emotional Undo Implementation
 *
 * This implements the UNDO_GROUPING_LAW.md exactly.
 *
 * Responsibilities:
 * - Own command history (past + future)
 * - Group commands according to law
 * - Restore full state (cursor + selection) on undo/redo
 * - Expose undo() and redo() to UI
 *
 * DOES NOT:
 * - Care about TipTap
 * - Care about React
 * - Care about keyboard shortcuts
 *
 * It is a pure state machine.
 */

import type { EditorEngine } from './EditorEngine';
import type { EditorCommand, IntentCategory } from './command';
import { CommandGroup } from './command';

/**
 * Undo Controller Configuration
 */
interface UndoControllerConfig {
  /** Time window for grouping (ms) */
  groupingWindowMs?: number;

  /** Maximum history size */
  maxHistorySize?: number;
}

/**
 * UndoController - Manages command history and grouping
 */
export class UndoController {
  private _engine: EditorEngine;
  private _config: Required<UndoControllerConfig>;

  // History stacks
  private _past: EditorCommand[] = [];
  private _future: EditorCommand[] = [];

  // Grouping state
  private _pendingGroup: EditorCommand[] = [];
  private _lastCommandTime: number = 0;

  constructor(engine: EditorEngine, config?: UndoControllerConfig) {
    this._engine = engine;
    this._config = {
      groupingWindowMs: config?.groupingWindowMs ?? 500,
      maxHistorySize: config?.maxHistorySize ?? 1000,
    };
  }

  /**
   * Add a command to history
   *
   * This automatically handles grouping according to UNDO_GROUPING_LAW.md
   */
  addCommand(command: EditorCommand): void {
    const now = Date.now();

    // Check if this command should be grouped with pending commands
    if (this._pendingGroup.length > 0) {
      const lastCommand = this._pendingGroup[this._pendingGroup.length - 1];

      if (this._shouldGroupWithPending(lastCommand, command, now)) {
        // Add to pending group
        this._pendingGroup.push(command);
        this._lastCommandTime = now;
        return;
      } else {
        // Flush pending group to history
        this._flushPendingGroup();
      }
    }

    // Start new pending group
    this._pendingGroup = [command];
    this._lastCommandTime = now;

    // Clear future (new command invalidates redo stack)
    this._future = [];

    // Check if grouping window has expired (for auto-flush)
    this._scheduleGroupFlush();
  }

  /**
   * Flush pending group after inactivity
   */
  private _scheduleGroupFlush(): void {
    setTimeout(() => {
      if (this._pendingGroup.length > 0) {
        const timeSinceLastCommand = Date.now() - this._lastCommandTime;
        if (timeSinceLastCommand >= this._config.groupingWindowMs) {
          this._flushPendingGroup();
        }
      }
    }, this._config.groupingWindowMs + 50); // Small buffer
  }

  /**
   * Determine if command should group with pending commands
   */
  private _shouldGroupWithPending(
    prevCommand: EditorCommand,
    newCommand: EditorCommand,
    timestamp: number
  ): boolean {
    const timeDelta = timestamp - prevCommand.metadata.timestamp;

    // Rule 1: Time window
    if (timeDelta > this._config.groupingWindowMs) {
      return false;
    }

    // Rule 2: Intent compatibility
    if (
      !this._areIntentsCompatible(
        prevCommand.metadata.intentCategory,
        newCommand.metadata.intentCategory
      )
    ) {
      return false;
    }

    // Rule 3: Same target block
    if (
      prevCommand.metadata.targetBlockId !== newCommand.metadata.targetBlockId
    ) {
      return false;
    }

    // Rule 4: Structural changes never group
    const structuralCategories: IntentCategory[] = [
      'block-create',
      'block-delete',
      'block-convert',
      'block-move',
      'block-indent',
      'block-outdent',
    ];

    if (structuralCategories.includes(newCommand.metadata.intentCategory)) {
      return false;
    }

    return true;
  }

  /**
   * Check if two intent categories are compatible for grouping
   */
  private _areIntentsCompatible(a: IntentCategory, b: IntentCategory): boolean {
    // Text insertion groups with text insertion
    if (a === 'text-insert' && b === 'text-insert') return true;

    // Deletion groups with deletion in same direction
    if (a === 'text-delete-forward' && b === 'text-delete-forward') return true;
    if (a === 'text-delete-backward' && b === 'text-delete-backward')
      return true;

    // Formatting groups with formatting
    if (a === 'format' && b === 'format') return true;

    // Nothing else groups
    return false;
  }

  /**
   * Flush pending group to history
   */
  private _flushPendingGroup(): void {
    if (this._pendingGroup.length === 0) return;

    let commandToAdd: EditorCommand;

    if (this._pendingGroup.length === 1) {
      // Single command - add directly
      commandToAdd = this._pendingGroup[0];
    } else {
      // Multiple commands - wrap in CommandGroup
      commandToAdd = new CommandGroup(
        this._pendingGroup,
        `${this._pendingGroup.length} grouped ${this._pendingGroup[0].metadata.intentCategory} actions`
      );
    }

    this._past.push(commandToAdd);

    // Enforce history size limit
    if (this._past.length > this._config.maxHistorySize) {
      this._past.shift();
    }

    this._pendingGroup = [];
  }

  /**
   * Undo the last command (or group)
   */
  undo(): boolean {
    // Flush any pending group first
    this._flushPendingGroup();

    if (this._past.length === 0) {
      return false;
    }

    const command = this._past.pop()!;

    // Apply undo
    command.undo(this._engine);

    // Add to future for redo
    this._future.push(command);

    // Restore before-state (cursor + selection)
    // This is critical for emotional undo
    this._engine.selection = command.metadata.beforeSelection;
    this._engine.focus = command.metadata.beforeFocus;
    this._engine.cursor = command.metadata.beforeCursor;

    return true;
  }

  /**
   * Redo the last undone command
   */
  redo(): boolean {
    if (this._future.length === 0) {
      return false;
    }

    const command = this._future.pop()!;

    // Re-apply command
    command.apply(this._engine);

    // Add back to past
    this._past.push(command);

    // Restore after-state (cursor + selection)
    this._engine.selection = command.metadata.afterSelection;
    this._engine.focus = command.metadata.afterFocus;
    this._engine.cursor = command.metadata.afterCursor;

    return true;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this._past.length > 0 || this._pendingGroup.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this._future.length > 0;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this._past = [];
    this._future = [];
    this._pendingGroup = [];
    this._lastCommandTime = 0;
  }

  /**
   * Get history size (for debugging)
   */
  getHistorySize(): { past: number; future: number; pending: number } {
    return {
      past: this._past.length,
      future: this._future.length,
      pending: this._pendingGroup.length,
    };
  }

  /**
   * Force flush pending group (for testing or before major operations)
   */
  flushPending(): void {
    this._flushPendingGroup();
  }
}
