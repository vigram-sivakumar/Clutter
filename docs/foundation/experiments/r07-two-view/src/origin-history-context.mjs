import { UndoManager } from 'yjs';
import {
  Plugin,
  TextSelection,
  NodeSelection,
  AllSelection,
} from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import {
  ySyncPluginKey,
  yUndoPluginKey,
  defaultDeleteFilter,
  defaultProtectedNodes,
  initProseMirrorDoc,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from 'y-prosemirror';
const selectionKey = Symbol('context-selection');

// Authority-owned editing context. Holds Y history/bookmarks, never an EditorView,
// DOM node or binding. Only context disposal destroys the manager observation.
export class OriginHistoryContext {
  constructor(fragment, schema) {
    this.fragment = fragment;
    this.schema = schema;
    this.disposed = false;
    this.beforeSelection = null;
    this.actionSelection = null;
    this.restoreBookmark = null;
    this.manager = new UndoManager(fragment, {
      trackedOrigins: new Set([ySyncPluginKey]),
      deleteFilter: (item) => defaultDeleteFilter(item, defaultProtectedNodes),
      captureTransaction: (transaction) =>
        transaction.meta.get('addToHistory') !== false,
    });
    this.onAdded = ({ stackItem }) => {
      const bookmark = this.actionSelection ?? this.beforeSelection;
      if (bookmark) stackItem.meta.set(selectionKey, bookmark);
    };
    this.onPopped = ({ stackItem }) => {
      this.restoreBookmark = stackItem.meta.get(selectionKey) ?? null;
    };
    this.manager.on('stack-item-added', this.onAdded);
    this.manager.on('stack-item-popped', this.onPopped);
  }
  bookmark(state) {
    const { doc, mapping } = initProseMirrorDoc(this.fragment, this.schema);
    if (!doc.eq(state.doc)) throw new Error('HISTORY_STATE_OUT_OF_SYNC');
    const selection = state.selection;
    const type =
      selection instanceof CellSelection
        ? 'cell'
        : selection instanceof NodeSelection
          ? 'node'
          : selection instanceof AllSelection
            ? 'all'
            : 'text';
    const anchor =
      type === 'cell' ? selection.$anchorCell.pos : selection.anchor;
    const head = type === 'cell' ? selection.$headCell.pos : selection.head;
    return {
      type,
      anchor: absolutePositionToRelativePosition(
        anchor,
        this.fragment,
        mapping
      ),
      head: absolutePositionToRelativePosition(head, this.fragment, mapping),
    };
  }
  beforeEdit(state) {
    if (!this.disposed) this.beforeSelection = this.bookmark(state);
  }
  plugin() {
    const context = this;
    return new Plugin({
      // Published key keeps the sync plugin's addToHistory boundary integration.
      // This bridge intentionally has no view-owned manager destroy hook.
      key: yUndoPluginKey,
      state: {
        init: () => ({ undoManager: context.manager }),
        apply(tr, value, oldState) {
          if (tr.docChanged && !tr.getMeta(ySyncPluginKey)?.isChangeOrigin)
            context.beforeEdit(oldState);
          return value;
        },
      },
    });
  }
  run(direction, state) {
    if (this.disposed) throw new Error('HISTORY_CONTEXT_DISPOSED');
    if (!['undo', 'redo'].includes(direction))
      throw new Error('INVALID_HISTORY_DIRECTION');
    this.actionSelection = this.bookmark(state);
    this.restoreBookmark = null;
    try {
      return this.manager[direction]() !== null;
    } finally {
      this.actionSelection = null;
    }
  }
  restore(state, dispatch, bookmark = this.restoreBookmark) {
    this.restoreBookmark = null;
    if (!bookmark) return false;
    const { doc, mapping } = initProseMirrorDoc(this.fragment, this.schema);
    if (!doc.eq(state.doc)) throw new Error('HISTORY_STATE_OUT_OF_SYNC');
    let selection;
    if (bookmark.type === 'all') selection = new AllSelection(state.doc);
    else {
      const anchor = relativePositionToAbsolutePosition(
        this.fragment.doc,
        this.fragment,
        bookmark.anchor,
        mapping
      );
      const head = relativePositionToAbsolutePosition(
        this.fragment.doc,
        this.fragment,
        bookmark.head,
        mapping
      );
      if (anchor == null || head == null) return false;
      if (
        bookmark.type === 'cell' &&
        ['cell', 'header_cell'].includes(
          state.doc.nodeAt(anchor)?.type.spec.tableRole
        ) &&
        ['cell', 'header_cell'].includes(
          state.doc.nodeAt(head)?.type.spec.tableRole
        ) &&
        state.doc.resolve(anchor).node(-1) === state.doc.resolve(head).node(-1)
      )
        selection = CellSelection.create(state.doc, anchor, head);
      else if (
        bookmark.type === 'node' &&
        state.doc.nodeAt(anchor) &&
        NodeSelection.isSelectable(state.doc.nodeAt(anchor))
      )
        selection = NodeSelection.create(state.doc, anchor);
      else
        selection = TextSelection.between(
          state.doc.resolve(anchor),
          state.doc.resolve(head)
        );
    }
    if (dispatch)
      dispatch(state.tr.setSelection(selection).setMeta('addToHistory', false));
    return true;
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.manager.off('stack-item-added', this.onAdded);
    this.manager.off('stack-item-popped', this.onPopped);
    this.manager.clear();
    this.manager.destroy();
    this.beforeSelection = this.actionSelection = this.restoreBookmark = null;
  }
}
