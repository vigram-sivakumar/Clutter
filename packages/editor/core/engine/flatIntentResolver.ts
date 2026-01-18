/**
 * FlatIntentResolver - Canonical flat indent model
 *
 * PRINCIPLES:
 * 1. Document is a flat ordered list
 * 2. Indent is structure
 * 3. Collapse is view-only
 * 4. Never infer parents
 * 5. Never auto-fix structure
 */

import type { EditorEngine } from './EditorEngine';
import type { EditorIntent, IntentResult } from './intent';
import { collectSubtreeFromIndex, type BlockWithPosition } from '../../utils/subtreeUtils';
import {
  placeCursorAtBlockStart as _placeCursorAtBlockStart,
  placeCursorAtBlockEnd as _placeCursorAtBlockEnd,
  placeCursorAtSafePosition as _placeCursorAtSafePosition,
} from '../../utils/cursorUtils';

export class FlatIntentResolver {
  constructor(
    private _engine: EditorEngine,
    private _editor?: any // Optional TipTap editor for direct mutations
  ) {}

  resolve(intent: EditorIntent): IntentResult {
    const mode = this._engine.getMode();

    try {
      switch (intent.type) {
        case 'indent-block':
          return this.handleIndentBlock(intent);

        case 'outdent-block':
          return this.handleOutdentBlock(intent);

        case 'delete-block':
          return this.handleDeleteBlock(intent);

        default:
          return {
            success: false,
            intent,
            reason: `Intent '${intent.type}' not implemented in flat model yet`,
            mode,
          };
      }
    } catch (error) {
      // Error handled
      return {
        success: false,
        intent,
        reason: `Exception: ${error}`,
        mode,
      };
    }
  }

  /**
   * Indent block (Tab)
   *
   * 🔥 FLAT MODEL RANGE RULE (SYMMETRY WITH OUTDENT):
   * Indent operates on the selected block AND its contiguous visual subtree
   * (all following blocks with indent > baseIndent)
   *
   * Example:
   * 1
   *     2  indent-1  ← Select this
   *     3  indent-1
   * 4
   *     5  indent-1
   *
   * After Tab:
   * 1
   *     2  indent-1
   *     3  indent-1
   *     4  indent-1  ← Moved with subtree
   *         5  indent-2  ← Moved with parent
   *
   * This ensures indent/outdent are perfect inverses.
   */
  private handleIndentBlock(
    intent: Extract<EditorIntent, { type: 'indent-block' }>
  ): IntentResult {
    const { blockId } = intent;

    if (!this._editor || !this._editor.state) {
      return {
        success: false,
        intent,
        reason: 'Editor not available',
      };
    }

    const { state, view } = this._editor;
    const doc = state.doc;
    const tr = state.tr;

    // Collect all blocks in document order
    const blocks: Array<{ pos: number; node: any; indent: number }> = [];
    doc.descendants((node: any, pos: number) => {
      if (node.attrs?.blockId) {
        blocks.push({
          pos,
          node,
          indent: node.attrs.indent ?? 0,
        });
      }
      return true;
    });

    // Find selected block index
    const selectedIndex = blocks.findIndex(
      (b) => b.node.attrs.blockId === blockId
    );
    if (selectedIndex === -1) {
      return {
        success: false,
        intent,
        reason: 'Block not found',
      };
    }

    const selectedBlock = blocks[selectedIndex];
    const baseIndent = selectedBlock.indent;

    // 🔥 INDENT VALIDATION: Can only indent to prevBlock.indent + 1
    // This prevents indent jumps and maintains flat list invariant
    const prevBlock = selectedIndex > 0 ? blocks[selectedIndex - 1] : null;
    const maxAllowedIndent = prevBlock ? prevBlock.indent + 1 : 0;
    const newIndent = baseIndent + 1;

    if (newIndent > maxAllowedIndent) {
      return {
        success: false,
        intent,
        reason: `Cannot indent beyond previous block level (max: ${maxAllowedIndent})`,
      };
    }

    // 🔥 RANGE DETECTION: Find all contiguous blocks with indent > baseIndent
    // This is the "visual subtree" that moves with the selected block
    const affectedRange = [selectedIndex];
    for (let i = selectedIndex + 1; i < blocks.length; i++) {
      if (blocks[i].indent > baseIndent) {
        affectedRange.push(i);
      } else {
        break; // Stop at first block not deeper than base
      }
    }

    // 🔥 RANGE MUTATION: Indent all affected blocks
    for (const index of affectedRange) {
      const block = blocks[index];
      tr.setNodeMarkup(block.pos, undefined, {
        ...block.node.attrs,
        indent: block.indent + 1,
      });
    }

    // Mark for undo
    tr.setMeta('addToHistory', true);
    tr.setMeta('historyGroup', 'indent-block');

    // Apply
    view.dispatch(tr);

    return {
      success: true,
      intent,
      mode: this._engine.getMode(),
    };
  }

  /**
   * Outdent block (Shift+Tab)
   *
   * 🔥 FLAT MODEL RANGE RULE:
   * Outdent operates on the selected block AND its contiguous visual subtree
   * (all following blocks with indent > baseIndent)
   *
   * This ensures the flat-list invariant:
   * "A block can never be more than +1 indent deeper than the block above it"
   */
  private handleOutdentBlock(
    intent: Extract<EditorIntent, { type: 'outdent-block' }>
  ): IntentResult {
    const { blockId } = intent;

    if (!this._editor || !this._editor.state) {
      return {
        success: false,
        intent,
        reason: 'Editor not available',
      };
    }

    const { state, view } = this._editor;
    const doc = state.doc;
    const tr = state.tr;

    // Collect all blocks in document order
    const blocks: Array<{ pos: number; node: any; indent: number }> = [];
    doc.descendants((node: any, pos: number) => {
      if (node.attrs?.blockId) {
        blocks.push({
          pos,
          node,
          indent: node.attrs.indent ?? 0,
        });
      }
      return true;
    });

    // Find selected block index
    const selectedIndex = blocks.findIndex(
      (b) => b.node.attrs.blockId === blockId
    );
    if (selectedIndex === -1) {
      return {
        success: false,
        intent,
        reason: 'Block not found',
      };
    }

    const selectedBlock = blocks[selectedIndex];
    const baseIndent = selectedBlock.indent;

    // Block if already at root
    if (baseIndent === 0) {
      return {
        success: false,
        intent,
        reason: 'Already at root level',
      };
    }

    // 🔥 RANGE DETECTION: Find all contiguous blocks with indent > baseIndent
    // This is the "visual subtree" that moves with the selected block
    const affectedRange = [selectedIndex];
    for (let i = selectedIndex + 1; i < blocks.length; i++) {
      if (blocks[i].indent > baseIndent) {
        affectedRange.push(i);
      } else {
        break; // Stop at first block not deeper than base
      }
    }

    // 🔥 RANGE MUTATION: Outdent all affected blocks
    for (const index of affectedRange) {
      const block = blocks[index];
      tr.setNodeMarkup(block.pos, undefined, {
        ...block.node.attrs,
        indent: Math.max(0, block.indent - 1),
      });
    }

    // Mark for undo
    tr.setMeta('addToHistory', true);
    tr.setMeta('historyGroup', 'outdent-block');

    // Apply
    view.dispatch(tr);

    return {
      success: true,
      intent,
      mode: this._engine.getMode(),
    };
  }

  /**
   * Delete block (Backspace at start / Delete key)
   *
   * 🔥 STRUCTURAL REATTACHMENT LAW (FLAT MODEL):
   * When deleting a block with children:
   * - Children do NOT inherit the deleted block's indent
   * - Children attach to the nearest surviving structural ancestor
   *
   * Rules:
   * 1. Find previous visible block BEFORE the deleted subtree
   * 2. If found → attachIndent = prev.indent + 1
   * 3. Clamp: newIndent = Math.min(attachIndent, deletedBlock.indent + 1)
   * 4. If no previous block → newIndent = 0
   *
   * This applies to:
   * - Backspace delete
   * - Delete key
   * - Halo delete
   * - Multi-block delete
   * - Cut
   *
   * 🔒 SELECTION TYPE RESET LAW:
   * Delete mutations MUST NOT include cursor placement in the same transaction.
   * Caller is responsible for placing cursor in a separate, final transaction.
   *
   * Example (Why simple indent-1 fails):
   * A (0)
   *   B (1)
   *   C (1)
   * D (0)  ← delete this
   *   E (1)
   *
   * Simple indent-1:
   *   E becomes 0 ❌ (wrong - floats to root)
   *
   * Structural reattachment:
   *   prev = C (indent 1)
   *   attachIndent = 1 + 1 = 2
   *   newIndent = Math.min(2, 0 + 1) = 1 ✅ (correct - attaches to C)
   */
  private handleDeleteBlock(
    intent: Extract<EditorIntent, { type: 'delete-block' }>
  ): IntentResult {
    const { blockId } = intent;

    if (!this._editor || !this._editor.state) {
      return {
        success: false,
        intent,
        reason: 'Editor not available',
      };
    }

    const { state, view } = this._editor;
    const doc = state.doc;
    const tr = state.tr;

    // Collect all blocks in document order
    const blocks: BlockWithPosition[] = [];
    doc.descendants((node: any, pos: number) => {
      if (node.attrs?.blockId) {
        blocks.push({
          pos,
          node,
          indent: node.attrs.indent ?? 0,
        });
      }
      return true;
    });

    // Find selected block index
    const selectedIndex = blocks.findIndex(
      (b) => b.node.attrs.blockId === blockId
    );

    if (selectedIndex === -1) {
      return {
        success: false,
        intent,
        reason: 'Block not found',
      };
    }

    const selectedBlock = blocks[selectedIndex];
    const baseIndent = selectedBlock.indent;

    // 🔥 PROMOTION RULE: Use canonical subtree utility (SUBTREE LAW)
    // Collect the visual subtree using shared algorithm
    const subtree = collectSubtreeFromIndex(blocks, selectedIndex);
    
    // Extract children (everything except the anchor)
    const children = subtree.slice(1);
    const childrenToPromote = children.map((_, i) => selectedIndex + 1 + i);

    // 🔥 STEP 1: Promote children BEFORE deleting parent
    // (Positions remain valid because we haven't deleted anything yet)
    //
    // 🔒 STRUCTURAL REATTACHMENT LAW:
    // Children attach to the nearest surviving block, not the deleted block.
    
    // Find attachment indent from surviving structure
    let attachmentIndent = 0; // Default: root level
    let previousBlock = null;
    
    if (selectedIndex > 0) {
      // Previous block exists → children attach to it
      previousBlock = blocks[selectedIndex - 1];
      attachmentIndent = previousBlock.indent + 1;
    }
    
    // Clamp attachment indent:
    // Can't be deeper than deletedBlock.indent + 1
    // (Prevents children from jumping too far)
    const maxAttachIndent = baseIndent + 1;
    const finalAttachIndent = Math.min(attachmentIndent, maxAttachIndent);
    
    for (const index of childrenToPromote) {
      const child = blocks[index];
      
      // 🔒 STRUCTURAL REATTACHMENT:
      // Each child maintains its relative depth but attaches to surviving structure
      const relativeDepth = child.indent - baseIndent - 1; // Depth relative to deleted parent
      const newIndent = finalAttachIndent + relativeDepth;
      
      tr.setNodeMarkup(child.pos, undefined, {
        ...child.node.attrs,
        indent: newIndent,
      });
    }

    // 🔥 STEP 2: Delete the selected block
    const blockPos = selectedBlock.pos;
    const blockSize = selectedBlock.node.nodeSize;
    tr.delete(blockPos, blockPos + blockSize);
    
    // 🛡️ DEV INVARIANT: Validate promotion worked correctly
    if (process.env.NODE_ENV !== 'production' && childrenToPromote.length > 0) {
      // Check the NEW document after promotion and delete
      const newBlocks: Array<{ node: any; indent: number; blockId: string }> = [];
      tr.doc.descendants((node: any, _pos: number) => {
        if (node.attrs?.blockId) {
          newBlocks.push({
            node,
            indent: node.attrs.indent ?? 0,
            blockId: node.attrs.blockId,
          });
        }
        return true;
      });
      
      // Validate no invalid indent jumps
      for (let i = 1; i < newBlocks.length; i++) {
        const prev = newBlocks[i - 1];
        const curr = newBlocks[i];
        
        if (curr.indent > prev.indent + 1) {
          // Invalid indent jump detected
        }
        
        if (curr.indent < 0) {
          // Negative indent detected
        }
      }
    }

    // 🔥 STEP 3: DETERMINE CURSOR TARGET (BUT DO NOT PLACE IT YET)
    //
    // 🔒 DELETION CURSOR LAW (MANDATORY):
    // After a block is deleted:
    // 1. Cursor moves to the END of the nearest surviving block ABOVE the deletion
    // 2. If no block exists above → cursor moves to START of first remaining block
    // 3. Cursor NEVER lands inside promoted children automatically
    //
    // Rationale:
    // - Promotion is a STRUCTURAL concern
    // - Cursor placement is a NAVIGATIONAL concern
    // - They must be decoupled
    //
    // This matches modern note-taking apps (Craft, Notion) behavior.
    //
    // 🔒 SELECTION TYPE RESET LAW:
    // Cursor placement MUST happen in a separate transaction to prevent
    // ProseMirror's post-transaction reconciliation from overriding it.

    let cursorTarget: { blockId: string; placement: 'start' | 'end' | 'safe' } | null = null;

    // Compute cursor anchor BEFORE deletion (using original block array)
    const cursorAnchorIndex = selectedIndex - 1;

    if (cursorAnchorIndex >= 0) {
      // ✅ NORMAL PATH: Previous block exists
      // Cursor goes to END of previous surviving block
      const prevBlock = blocks[cursorAnchorIndex];
      const prevBlockId = prevBlock.node.attrs?.blockId;
      
      if (!prevBlockId) {
        return {
          success: false,
          intent,
          reason: 'Previous block missing blockId',
        };
      }
      
      cursorTarget = {
        blockId: prevBlockId,
        placement: 'end',
      };
    } else {
      // ✅ EXCEPTION: First block deleted, no previous block exists
      // Cursor goes to START of first remaining block
      cursorTarget = {
        blockId: '', // Will use safe position finder
        placement: 'safe',
      };
    }

    // Mark for undo
    tr.setMeta('addToHistory', true);
    tr.setMeta('historyGroup', 'delete-block');

    // 🔒 PHASE 2: Apply delete + promotion ONLY (NO CURSOR)
    view.dispatch(tr);

    return {
      success: true,
      intent,
      mode: this._engine.getMode(),
      cursorTarget, // 🔒 Return cursor info for Phase 3
    };
  }
}
