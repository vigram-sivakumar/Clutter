import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import {
  ySyncPlugin,
  yUndoPlugin,
  undo,
  redo,
  yUndoPluginKey,
} from 'y-prosemirror';
import { OriginAuthority } from './origin-authority.mjs';
import { schema, textPosition } from './schema.mjs';
import { nextCellOrRow } from './table-command.mjs';
import { reconcileNativeTextSelection } from './selection-preflight.mjs';

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
  authority.onStatus = () =>
    status(
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
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          'Mod-y': redo,
          'Mod-b': toggleMark(schema.marks.strong),
          Tab: nextCellOrRow,
          'Shift-Tab': goToNextCell(-1),
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
              (event.inputType === 'historyUndo' ? undo : redo)(view.state);
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
  undo(views[active].state);
document.querySelector('#origin-redo').onpointerdown = (e) =>
  e.preventDefault();
document.querySelector('#origin-redo').onclick = () =>
  redo(views[active].state);
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
