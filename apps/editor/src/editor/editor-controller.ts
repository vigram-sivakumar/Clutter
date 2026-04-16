/**
 * State + history + dispatch. Single editing pipeline.
 */

import type { EditorState, PrimitiveOp } from '../engine/engine';
import {
  applyOp,
  getVisibleNodeIds,
  repairSelectionAfterDelete,
  validateStructure,
} from '../engine/engine';
import { pushEntry, undo, redo } from '../engine/history';
import type { HistoryState } from '../engine/history';
import { genId } from './keymap';
import { renderEditor } from './renderer';
import { syncDomSelectionToState, validateSelection } from './selection';
import type { Selection } from './selection';

export class EditorController {
  private state: EditorState;
  private history: HistoryState = { past: [], future: [] };
  private rootEl: HTMLElement;
  private isRestoring = false;

  isRestoringSelection() {
    return this.isRestoring;
  }

  constructor(initialState: EditorState, rootEl: HTMLElement) {
    this.state = initialState;
    this.rootEl = rootEl;
    renderEditor(this.state, this.rootEl, this);
  }

  private generateEmptyId(): string {
    return genId();
  }

  private getRootInvariantOps(state: EditorState): PrimitiveOp[] {
    const root = state.nodes[state.rootId];
    if (!root) return [];

    const children = root.children;
    const ops: PrimitiveOp[] = [];

    // If no children → insert empty node
    if (children.length === 0) {
      const newId = this.generateEmptyId();

      ops.push({
        type: 'InsertNode',
        id: newId,
        parentId: state.rootId,
        index: 0,
        node: {
          id: newId,
          parentId: state.rootId,
          blockType: 'paragraph',
          inlines: [{ type: 'text', text: '', marks: [] }],
          children: [],
          collapsed: false,
        },
      });

      return ops;
    }

    const lastId = children[children.length - 1];
    if (!lastId) return ops;

    const lastNode = state.nodes[lastId];
    if (!lastNode) return ops;

    const firstInline = lastNode.inlines[0];
    const isEmpty =
      lastNode.blockType === 'paragraph' &&
      lastNode.inlines.length === 1 &&
      firstInline?.type === 'text' &&
      firstInline.text.trim() === '';

    if (!isEmpty) {
      const newId = this.generateEmptyId();

      ops.push({
        type: 'InsertNode',
        id: newId,
        parentId: state.rootId,
        index: children.length,
        node: {
          id: newId,
          parentId: state.rootId,
          blockType: 'paragraph',
          inlines: [{ type: 'text', text: '', marks: [] }],
          children: [],
          collapsed: false,
        },
      });
    }

    return ops;
  }

  dispatch(ops: PrimitiveOp[], nextSelection?: Selection | null) {
    const action = ops.length === 0 ? 'selection-only' : ops;
    console.group('DISPATCH');
    console.log('Action:', action);
    console.log('Prev Selection:', this.state.selection);
    console.log('Prev Nodes:', getVisibleNodeIds(this.state));

    if (ops.length === 0) {
      if (nextSelection) {
        const current = this.state.selection;

        const isSame =
          JSON.stringify(current) === JSON.stringify(nextSelection);

        if (isSame) {
          console.groupEnd();
          return;
        }

        const valid = validateSelection(this.state, nextSelection);
        if (!valid) {
          console.groupEnd();
          return;
        }

        const prevIsBlock = current?.type === 'block-range';
        const nextIsBlock = valid.type === 'block-range';

        this.state = {
          ...this.state,
          selection: valid,
        };

        syncDomSelectionToState(this.rootEl, valid);

        if (prevIsBlock || nextIsBlock) {
          renderEditor(this.state, this.rootEl, this);
        }
      }

      console.log('STATE SNAPSHOT', {
        selection: this.state.selection,
        visible: getVisibleNodeIds(this.state),
      });

      console.groupEnd();
      return;
    }

    const beforeSelection = this.state.selection
      ? JSON.parse(JSON.stringify(this.state.selection))
      : null;

    const stateBefore = this.state;

    let nextState = this.state;

    for (const op of ops) {
      nextState = applyOp(nextState, op);
    }

    // Apply invariant ops
    const invariantOps = this.getRootInvariantOps(nextState);

    for (const op of invariantOps) {
      nextState = applyOp(nextState, op);
    }

    const allOps = [...ops, ...invariantOps];

    const repairedSelection = repairSelectionAfterDelete(
      nextState,
      stateBefore,
      allOps,
      beforeSelection
    );

    const afterSelection = nextSelection
      ? JSON.parse(JSON.stringify(nextSelection))
      : repairedSelection
        ? JSON.parse(JSON.stringify(repairedSelection))
        : beforeSelection
          ? JSON.parse(JSON.stringify(beforeSelection))
          : null;

    this.history = pushEntry(this.history, {
      label: 'edit',
      ops, // invariant ops are structural maintenance — not part of undo/redo history
      beforeSelection,
      afterSelection,
    });

    const finalSelection =
      nextSelection ??
      repairedSelection ??
      beforeSelection ??
      this.state.selection;

    const validated = validateSelection(nextState, finalSelection);
    if (!validated) {
      throw new Error('Selection invariant violated after dispatch');
    }

    nextState = {
      ...nextState,
      selection: validated,
    };

    this.state = nextState;

    if (process.env.NODE_ENV !== 'production') {
      validateStructure(this.state);
      Object.freeze(this.state.nodes);
    }

    renderEditor(this.state, this.rootEl, this);

    const selToRestore = this.state.selection;
    if (selToRestore?.type === 'collapsed') {
      this.isRestoring = true;
      requestAnimationFrame(() => {
        syncDomSelectionToState(this.rootEl, selToRestore);
        this.isRestoring = false;
      });
    }

    const hasDelete = allOps.some((o) => o.type === 'DeleteNode');
    if (hasDelete) {
      console.log('DELETE RESULT', this.state.selection);
    }

    console.log('STATE SNAPSHOT', {
      selection: this.state.selection,
      visible: getVisibleNodeIds(this.state),
    });
    console.groupEnd();
  }

  undo() {
    if (this.history.past.length === 0) return;

    const lastEntry = this.history.past[this.history.past.length - 1];

    const result = undo(this.state, this.history);

    this.state = result.state;
    this.history = result.history;

    const invariantOps = this.getRootInvariantOps(this.state);
    for (const op of invariantOps) {
      this.state = applyOp(this.state, op);
    }

    // Restore selection FIRST
    const restored = lastEntry?.beforeSelection ?? null;

    const validSelection = restored
      ? validateSelection(this.state, restored)
      : null;

    if (!validSelection && restored !== null) {
      throw new Error('Undo restored invalid selection');
    }

    this.state = {
      ...this.state,
      selection: validSelection,
    };

    if (process.env.NODE_ENV !== 'production') {
      validateStructure(this.state);
    }

    renderEditor(this.state, this.rootEl, this);

    if (this.state.selection) {
      syncDomSelectionToState(this.rootEl, this.state.selection);
    }
  }

  redo() {
    if (this.history.future.length === 0) return;

    const nextEntry = this.history.future[0];

    const result = redo(this.state, this.history);

    this.state = result.state;
    this.history = result.history;

    const invariantOps = this.getRootInvariantOps(this.state);
    for (const op of invariantOps) {
      this.state = applyOp(this.state, op);
    }

    // Restore selection FIRST
    const restored = nextEntry?.afterSelection ?? null;

    const validSelection = restored
      ? validateSelection(this.state, restored)
      : null;

    if (!validSelection && restored !== null) {
      throw new Error('Undo restored invalid selection');
    }

    this.state = {
      ...this.state,
      selection: validSelection,
    };

    if (process.env.NODE_ENV !== 'production') {
      validateStructure(this.state);
    }

    renderEditor(this.state, this.rootEl, this);

    if (this.state.selection) {
      syncDomSelectionToState(this.rootEl, this.state.selection);
    }
  }

  getState(): EditorState {
    return this.state;
  }

  getRootEl(): HTMLElement {
    return this.rootEl;
  }
}
