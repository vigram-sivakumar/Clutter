/**
 * State + history + dispatch. Single editing pipeline.
 */

import type { EditorState, PrimitiveOp } from '../engine/engine';
import { applyOp } from '../engine/engine';
import { pushEntry, undo, redo } from '../engine/history';
import type { HistoryState } from '../engine/history';
import { renderEditor } from './renderer';
import { setSelection } from './selection';
import type { Selection } from './selection';

export class EditorController {
  private state: EditorState;
  private history: HistoryState = { past: [], future: [] };
  private rootEl: HTMLElement;
  private lastSelection: Selection | null = null;

  constructor(initialState: EditorState, rootEl: HTMLElement) {
    this.state = initialState;
    this.rootEl = rootEl;
    renderEditor(this.state, this.rootEl, this);
  }

  setLastSelection(sel: Selection | null) {
    this.lastSelection = sel;
  }

  dispatch(label: string, ops: PrimitiveOp[]) {
    if (ops.length === 0) return;

    for (const op of ops) {
      this.state = applyOp(this.state, op);
    }

    this.history = pushEntry(this.history, { label, ops });

    renderEditor(this.state, this.rootEl, this);

    if (this.lastSelection) {
      setSelection(this.rootEl, this.lastSelection);
    }
  }

  undo() {
    const result = undo(this.state, this.history);
    this.state = result.state;
    this.history = result.history;

    renderEditor(this.state, this.rootEl, this);

    if (this.lastSelection) {
      setSelection(this.rootEl, this.lastSelection);
    }
  }

  redo() {
    const result = redo(this.state, this.history);
    this.state = result.state;
    this.history = result.history;

    renderEditor(this.state, this.rootEl, this);

    if (this.lastSelection) {
      setSelection(this.rootEl, this.lastSelection);
    }
  }

  getState(): EditorState {
    return this.state;
  }

  getRootEl(): HTMLElement {
    return this.rootEl;
  }
}
