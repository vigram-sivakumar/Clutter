import { EditorState, TextSelection, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { tableEditing, CellSelection, cellAround } from 'prosemirror-tables';
import {
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  undo,
  redo,
  yUndoPluginKey,
} from 'y-prosemirror';
import { OriginAuthority } from './origin-authority.mjs';
import { liveCommands } from './live-command.mjs';
import { schema, textPosition } from './schema.mjs';
import {
  nextCell,
  previousCell,
  nextRowSameColumn,
  cellLineBreak,
  selectCurrentCell,
} from './table-command.mjs';
import { tableView, tableCellHighlight } from './table-view.mjs';
import { reconcileNativeTextSelection } from './selection-preflight.mjs';

const structuralGuard =
  new URLSearchParams(location.search).get('history') !== 'raw';
const structuralTag = 'r07-table-handle';
let historyWarnings = {};
function historyManager(id) {
  return (
    peers[id].history?.manager ??
    yUndoPluginKey.getState(views[id].state).undoManager
  );
}
function historyCommand(id, direction) {
  const view = views[id],
    manager = historyManager(id);
  const stack = direction === 'undo' ? manager.undoStack : manager.redoStack,
    tag = stack.at(-1)?.meta.get(structuralTag);
  historyWarnings[id] = null;
  if (structuralGuard && tag?.pending) {
    historyWarnings[id] = 'UNDO_PENDING_DURABILITY';
    authority.onStatus();
    return false;
  }
  if (
    structuralGuard &&
    tag &&
    authority.hasForeignInScope(id, tag.version, tag.scope)
  ) {
    historyWarnings[id] = 'UNDO_BLOCKED_FOREIGN_TABLE_EDIT';
    authority.onStatus();
    return false;
  }
  const context = peers[id].history;
  const changed = context
    ? context.run(direction, view.state)
    : (direction === 'undo' ? undo : redo)(view.state);
  if (changed && context)
    context.restore(view.state, (tr) => view.dispatch(tr));
  if (changed && tag) {
    const opposite =
      direction === 'undo' ? manager.redoStack : manager.undoStack;
    opposite.at(-1)?.meta.set(structuralTag, {
      ...tag,
      scope: authority.mapScopeSince(tag.version, tag.scope),
      version: authority.version,
    });
  }
  authority.onStatus();
  return changed;
}
function tableBoundary(id, view, phase, axis, tablePos) {
  const manager = historyManager(id);
  manager.stopCapturing();
  if (phase === 'after')
    manager.undoStack.at(-1)?.meta.set(structuralTag, {
      axis,
      version: authority.version,
      scope: {
        from: tablePos,
        to: tablePos + view.state.doc.nodeAt(tablePos).nodeSize,
      },
    });
  if (phase === 'after') {
    const tag = manager.undoStack.at(-1)?.meta.get(structuralTag);
    if (tag) authority.tagHistory?.(id, tag);
  }
}
let commandIngress, ingressSession;
let authority,
  peers,
  views = {},
  detachedViews = new Map(),
  active = 'A';
const status = (text) => {
  document.querySelector('#origin-status').textContent = text;
};
function reset() {
  for (const view of Object.values(views)) view.destroy();
  authority?.destroy();
  views = {};
  detachedViews.clear();
  authority = window.clutterAuthorityFactory?.() ?? new OriginAuthority();
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
        structuralGuard ? authority.historyContext(id).plugin() : yUndoPlugin(),
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
          Escape: selectCurrentCell,
        }),
        keymap(baseKeymap),
        // The public Y binding restores non-node selections as text ranges.
        // Reconstruct the local cell selection from those relative-mapped endpoints
        // on a sync transaction; mode is view state, never shared document data.
        new Plugin({
          appendTransaction(transactions, previous, current) {
            if (
              !(previous.selection instanceof CellSelection) ||
              current.selection instanceof CellSelection ||
              !transactions.some(
                (tr) => tr.getMeta(ySyncPluginKey)?.isChangeOrigin
              )
            )
              return null;
            const anchor = cellAround(current.selection.$anchor),
              head = cellAround(current.selection.$head);
            if (!anchor || !head || anchor.node(-1) !== head.node(-1))
              return null;
            return current.tr
              .setSelection(new CellSelection(anchor, head))
              .setMeta('addToHistory', false);
          },
        }),
        tableCellHighlight(),
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
            tableView(node, current, getPos, (phase, axis, tablePos) =>
              tableBoundary(id, current, phase, axis, tablePos)
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
  ingressSession = crypto.randomUUID();
  commandIngress = liveCommands(
    {
      read: () => ({
        version: authority.version,
        doc: authority.read().toJSON(),
      }),
      insert: (command) => authority.insertExternal(command),
    },
    ingressSession
  );
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
  liveCommand: (command) => commandIngress(command),
  commandSession: () => ingressSession,
  // Real view destruction leaves only model/props/container for remount. The
  // authority-owned history context has no view or binding reference.
  detachView(id) {
    const old = views[id];
    detachedViews.set(id, {
      state: old.state,
      props: old.props,
      place: old.dom.parentNode,
    });
    old.destroy();
    delete views[id];
  },
  attachView(id) {
    const saved = detachedViews.get(id);
    if (!saved) throw new Error('VIEW_NOT_DETACHED');
    views[id] = new EditorView(saved.place, {
      ...saved.props,
      state: saved.state,
    });
    detachedViews.delete(id);
    return views[id];
  },
  recreateView(id) {
    window.originLab.detachView(id);
    return window.originLab.attachView(id);
  },
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
    historyManager(id).stopCapturing();
  },
  pause: (id) => authority.pause(id),
  resume: (id) => authority.resume(id),
};
