import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { tableEditing } from 'prosemirror-tables';
import {
  ySyncPlugin,
  yUndoPlugin,
  undo,
  redo,
  yUndoPluginKey,
} from 'y-prosemirror';
import { OriginAuthority } from './origin-authority.mjs';
import { schema, textPosition } from './schema.mjs';
import {
  nextCell,
  previousCell,
  nextRowSameColumn,
  cellLineBreak,
} from './table-command.mjs';
import { tableView, focusTableHandle } from './table-view.mjs';
import { reconcileNativeTextSelection } from './selection-preflight.mjs';

const structuralGuard =
  new URLSearchParams(location.search).get('history') !== 'raw';
const structuralTag = 'r07-table-handle';
let historyWarnings = {};
function historyCommand(id, direction) {
  const view = views[id],
    manager = yUndoPluginKey.getState(view.state).undoManager;
  const stack = direction === 'undo' ? manager.undoStack : manager.redoStack,
    tag = stack.at(-1)?.meta.get(structuralTag);
  historyWarnings[id] = null;
  if (structuralGuard && tag && authority.hasForeignSince(id, tag.version)) {
    historyWarnings[id] = 'UNDO_BLOCKED_FOREIGN_TABLE_EDIT';
    authority.onStatus();
    return false;
  }
  const changed = (direction === 'undo' ? undo : redo)(view.state);
  if (changed && tag) {
    const opposite =
      direction === 'undo' ? manager.redoStack : manager.undoStack;
    opposite
      .at(-1)
      ?.meta.set(structuralTag, { ...tag, version: authority.version });
  }
  authority.onStatus();
  return changed;
}
function tableBoundary(id, view, phase, axis) {
  const manager = yUndoPluginKey.getState(view.state).undoManager;
  manager.stopCapturing();
  if (phase === 'after')
    manager.undoStack
      .at(-1)
      ?.meta.set(structuralTag, { axis, version: authority.version });
}
let authority,
  peers,
  views = {},
  active = 'A';
const status = (text) => {
  document.querySelector('#origin-status').textContent = text;
};
function reset() {
  for (const view of Object.values(views)) view.destroy();
  authority?.destroy();
  views = {};
  authority = new OriginAuthority();
  peers = {};
  historyWarnings = {};
  authority.onStatus = () =>
    status(
      Object.values(historyWarnings).find(Boolean) ??
        [...authority.peers.values()].map((p) => p.error).find(Boolean) ??
        `Accepted revision ${authority.version} · local origin-aware candidate · ${active}`
    );
  for (const id of ['A', 'B']) {
    const peer = authority.attach(id);
    peers[id] = peer;
    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(peer.doc.getXmlFragment('prosemirror')),
        yUndoPlugin(),
        keymap({
          'Mod-z': () => {
            historyCommand(id, 'undo');
            return true;
          },
          'Mod-Shift-z': () => {
            historyCommand(id, 'redo');
            return true;
          },
          'Mod-y': () => {
            historyCommand(id, 'redo');
            return true;
          },
          'Mod-b': toggleMark(schema.marks.strong),
          Tab: nextCell,
          'Shift-Tab': previousCell,
          Enter: nextRowSameColumn,
          'Shift-Enter': cellLineBreak,
          Escape: focusTableHandle,
        }),
        keymap(baseKeymap),
        tableEditing(),
      ],
    });
    let view;
    view = new EditorView(
      document.querySelector('#origin-' + id.toLowerCase()),
      {
        state,
        nodeViews: {
          table: (node, current, getPos) =>
            tableView(node, current, getPos, (phase, axis) =>
              tableBoundary(id, current, phase, axis)
            ),
        },
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': 'Origin editor ' + id,
        },
        editable: () => !peer.error,
        dispatchTransaction(tr) {
          this.updateState(this.state.apply(tr));
        },
        handleDOMEvents: {
          focus() {
            active = id;
            return false;
          },
          keydown(view, event) {
            reconcileNativeTextSelection(view, event);
            return false;
          },
          beforeinput(view, event) {
            if (
              ['historyUndo', 'historyRedo'].includes(event.inputType) &&
              !view.composing &&
              !event.isComposing
            ) {
              event.preventDefault();
              historyCommand(
                id,
                event.inputType === 'historyUndo' ? 'undo' : 'redo'
              );
              return true;
            }
            return false;
          },
        },
      }
    );
    views[id] = view;
  }
  authority.onStatus();
}
reset();
document.querySelector('#origin-reset').onclick = reset;
document.querySelector('#origin-undo').onpointerdown = (e) =>
  e.preventDefault();
document.querySelector('#origin-undo').onclick = () =>
  historyCommand(active, 'undo');
document.querySelector('#origin-redo').onpointerdown = (e) =>
  e.preventDefault();
document.querySelector('#origin-redo').onclick = () =>
  historyCommand(active, 'redo');
window.originLab = {
  view: (id) => views[id],
  reset,
  snapshot: () => ({
    doc: authority.read().toJSON(),
    version: authority.version,
    contexts: Object.fromEntries(
      Object.entries(views).map(([id, v]) => [
        id,
        {
          doc: v.state.doc.toJSON(),
          anchor: v.state.selection.anchor,
          head: v.state.selection.head,
          error: peers[id].error,
          historyWarning: historyWarnings[id] ?? null,
        },
      ])
    ),
  }),
  select(id, text, from = 0, to = from) {
    const v = views[id],
      a = textPosition(v.state.doc, text, from),
      b = textPosition(v.state.doc, text, to);
    v.dispatch(
      v.state.tr.setSelection(TextSelection.create(v.state.doc, a, b))
    );
    v.focus();
  },
  boundary(id) {
    yUndoPluginKey.getState(views[id].state).undoManager.stopCapturing();
  },
  pause: (id) => authority.pause(id),
  resume: (id) => authority.resume(id),
};
