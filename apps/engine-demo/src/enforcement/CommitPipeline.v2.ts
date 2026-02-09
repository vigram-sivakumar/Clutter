/**
 * 🔒 COMMIT PIPELINE — Instance-Based (NO SINGLETONS)
 *
 * CRITICAL ARCHITECTURAL CHANGE:
 * - Bound to specific EditorModel instance
 * - Bound to specific TypingBuffer instance
 * - No global state
 * - Multi-document isolation GUARANTEED
 */

import type { Node, CursorPosition } from '../engine/NodeKernel';
import type { EditorModel } from '../editor/EditorModel.v2';
// ✂️ PHASE 2.5: TypingBuffer type import DELETED
import { assertEditorInvariants, deepFreeze } from './invariants';
import { _allowMutation, _blockMutation } from './StateWrapper';

/**
 * CommitPipeline Class (Instance-Based)
 */
export class CommitPipeline {
  private readonly model: EditorModel;
  // ✂️ PHASE 2.5: typingBuffer DELETED (experimental v2 file, not in use)
  // private readonly typingBuffer: any; // TypingBuffer;
  private setEditorState: ((state: any) => void) | null = null;
  private requestCaretPlacement: (() => void) | null = null;
  private isLocked: boolean = false;
  private caretPlacementPending: boolean = false;
  private readonly instanceId: string;

  constructor(model: EditorModel /*, typingBuffer: any*/) {
    this.model = model;
    // this.typingBuffer = typingBuffer;
    this.instanceId = `pipeline-${Math.random().toString(36).slice(2, 11)}`;

    if (__DEV__) {
      console.log(`🔒 CommitPipeline created: ${this.instanceId}`);
      console.log(`   Bound to model: ${model.getInstanceId()}`);
      // console.log(`   Bound to typing: ${typingBuffer.getInstanceId()}`);
    }
  }

  /**
   * Initialize with React setState and caret placement
   */
  initialize(
    setEditorState: (state: any) => void,
    requestCaretPlacement: () => void
  ): void {
    this.setEditorState = setEditorState;
    this.requestCaretPlacement = requestCaretPlacement;

    if (__DEV__) {
      console.log(`🔒 CommitPipeline [${this.instanceId}]: Initialized`);
    }
  }

  /**
   * Execute an editor operation (ONLY way to mutate state)
   */
  performOperation(operation: EditorOperation): void {
    if (!this.setEditorState || !this.requestCaretPlacement) {
      throw new Error('CommitPipeline not initialized');
    }

    // GUARD 1: Reentrancy check
    if (this.isLocked) {
      throw new Error(
        `PIPELINE VIOLATION: Reentrant operation "${operation.type}"\n` +
          `Pipeline is already locked.`
      );
    }

    // GUARD 2: Model exists check
    const modelState = this.model.getState();
    if (!modelState) {
      throw new Error('PIPELINE VIOLATION: Model not initialized');
    }

    // Lock pipeline
    this.lock(operation.type);

    try {
      // ✂️ PHASE 2.5: typingBuffer DELETED
      // STEP 1: Stop typing
      // this.typingBuffer.stopTyping();

      // STEP 2: Flush typing buffer
      const flushedNodes = this.flushTypingChanges();
      if (flushedNodes) {
        this.model.updateNodes(flushedNodes);
      }

      // STEP 3: Execute operation (reads from model instance)
      const result = operation.execute(this.model);

      // STEP 4: Freeze in dev (immutability check)
      if (__DEV__) {
        deepFreeze(result.nodes);
        deepFreeze(result.cursor);
      }

      // STEP 5: Update model
      this.model.updateState(result.nodes, result.cursor);

      // STEP 6: Validate
      if (__DEV__) {
        assertEditorInvariants(result.nodes, result.cursor, operation.type);
      }

      // STEP 7: Mirror to React
      _allowMutation(operation.type);

      try {
        this.setEditorState({
          nodes: result.nodes,
          cursor: result.cursor,
        });
      } finally {
        _blockMutation();
      }

      // STEP 8: Request caret placement
      this.caretPlacementPending = true;
      this.requestCaretPlacement();
    } catch (error) {
      console.error(`❌ Operation "${operation.type}" failed:`, error);
      _blockMutation();
      throw error;
    } finally {
      // STEP 9: Unlock (ALWAYS runs)
      this.unlock();
    }
  }

  /**
   * Check if pipeline is locked
   */
  isPipelineLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Check if caret placement is pending
   */
  isCaretPlacementPending(): boolean {
    return this.caretPlacementPending;
  }

  /**
   * Mark caret as placed
   */
  markCaretPlaced(): void {
    this.caretPlacementPending = false;
  }

  /**
   * Get instance ID (for debugging)
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Destroy instance (cleanup)
   */
  destroy(): void {
    this.setEditorState = null;
    this.requestCaretPlacement = null;

    if (__DEV__) {
      console.log(`🔒 CommitPipeline destroyed: ${this.instanceId}`);
    }
  }

  // Private methods

  private lock(operation: string): void {
    this.isLocked = true;
    this.caretPlacementPending = false;

    if (__DEV__) {
      console.log(`🔒 Pipeline [${this.instanceId}] LOCKED for: ${operation}`);
    }
  }

  private unlock(): void {
    this.isLocked = false;

    if (__DEV__) {
      console.log(`🔓 Pipeline [${this.instanceId}] UNLOCKED`);
    }
  }

  private flushTypingChanges(): Node[] | null {
    // ✂️ PHASE 2.5: Entire method DELETED - no typing buffer to flush
    // With MutationObserver, DOM is extracted at commit boundaries
    // const pendingNodeIds = this.typingBuffer.getAllPendingNodeIds();

    // No-op - return null (no changes to flush)
    return null;
  }
}

/**
 * EditorOperation interface (reads from model instance)
 */
export interface EditorOperation {
  type: string;
  execute: (model: EditorModel) => {
    nodes: Node[];
    cursor: CursorPosition;
  };
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
