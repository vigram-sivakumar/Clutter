import { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { Authority } from './authority.mjs';
import { Context, settle } from './context.mjs';
import { fixture, schema, textPosition } from './schema.mjs';
import { execute } from './api.mjs';
import { nextCellOrRow } from './table-command.mjs';

const prefix = 'clutter-r07-lab:';
class BrowserStore {
  constructor() {
    this.failSave = false;
    this.failProtect = false;
  }
  read() {
    return (
      ['snapshot', 'recovery']
        .map((k) => JSON.parse(localStorage.getItem(prefix + k) ?? 'null'))
        .filter(Boolean)
        .sort((a, b) => b.steps.length - a.steps.length)[0] ?? null
    );
  }
  write(snapshot) {
    if (this.failSave) throw new Error('Injected failure');
    localStorage.setItem(prefix + 'snapshot', JSON.stringify(snapshot));
    localStorage.removeItem(prefix + 'recovery');
  }
  protect(snapshot) {
    if (this.failProtect) throw new Error('Injected failure');
    localStorage.setItem(prefix + 'recovery', JSON.stringify(snapshot));
  }
}
const store = new BrowserStore();
let authority = Authority.restore(store, fixture()),
  clients,
  views = {},
  active = 'A',
  paused = new Set(),
  sequence = 0;
const trace = [];
const status = (text) => {
  document.querySelector('#status').textContent = text;
};
const record = (type, detail) => {
  trace.push({ time: Math.round(performance.now()), type, ...detail });
  if (trace.length > 80) trace.shift();
  document.querySelector('#trace').textContent = JSON.stringify(trace, null, 2);
};
function pump() {
  try {
    const online = Object.values(clients).filter((c) => !paused.has(c.id));
    settle(...online);
    const recoveries = Object.values(clients).flatMap((c) =>
      c.recovery.map((r) => ({ context: c.id, ...r }))
    );
    document.querySelector('#recovery').hidden = !recoveries.length;
    document.querySelector('#recovery-text').textContent = JSON.stringify(
      recoveries,
      null,
      2
    );
    const warning = Object.values(clients)
      .map((c) => c.historyError)
      .find(Boolean);
    status(
      warning ??
        `Accepted revision ${authority.version} · ${authority.durableVersion >= authority.version && !authority.saveError ? 'saved to browser lab storage' : 'save pending / failed'} · focused ${active}`
    );
  } catch (e) {
    status(e.code ?? e.message);
    record('error', { code: e.code ?? e.message });
  }
}
function createClients() {
  clients = Object.fromEntries(
    ['A', 'B'].map((id) => {
      const plugins = [
        keymap({
          'Mod-z': () => {
            c.undo();
            pump();
            return true;
          },
          'Mod-Shift-z': () => {
            c.redo();
            pump();
            return true;
          },
          'Mod-y': () => {
            c.redo();
            pump();
            return true;
          },
          'Mod-b': toggleMark(schema.marks.strong),
          Tab: nextCellOrRow,
          'Shift-Tab': goToNextCell(-1),
        }),
        keymap(baseKeymap),
        tableEditing(),
      ];
      const c = new Context(authority, id, plugins);
      const previous = JSON.parse(
        localStorage.getItem(prefix + 'context-' + id) ?? 'null'
      );
      if (previous) {
        c.recovery = previous.recovery ?? [];
        if (previous.pending?.length || previous.base > authority.version)
          c.recovery.push({
            reason: 'RESTART_INPUT_REQUIRES_REVIEW',
            doc: previous.doc,
            steps: previous.pending,
          });
      }
      c.onBackup = (backup) =>
        localStorage.setItem(prefix + 'context-' + id, JSON.stringify(backup));
      c.onChange = () => {
        if (views[id]) views[id].updateState(c.state);
      };
      return [id, c];
    })
  );
}
function mount(id) {
  const c = clients[id];
  views[id] = new EditorView(
    document.querySelector('#view-' + id.toLowerCase()),
    {
      state: c.state,
      nodeViews: {
        embed(node) {
          const dom = document.createElement('aside'),
            button = document.createElement('button');
          dom.className = 'embed';
          dom.contentEditable = 'false';
          button.type = 'button';
          button.textContent = 'Open original: ' + node.attrs.label;
          dom.append(button);
          dom.addEventListener('mousedown', (event) => {
            event.preventDefault();
            button.focus();
          });
          dom.addEventListener('click', () =>
            status(
              'ORIGINAL_PAGE_PROJECTION_NOT_IMPLEMENTED: ' + node.attrs.target
            )
          );
          return { dom, stopEvent: () => true, ignoreMutation: () => true };
        },
      },
      attributes: {
        'aria-label': 'Editor view ' + id,
        role: 'textbox',
        'aria-multiline': 'true',
      },
      dispatchTransaction(tr) {
        c.apply(tr);
        pump();
      },
      handleDOMEvents: {
        focus() {
          active = id;
          return false;
        },
        keydown(view, event) {
          const native = window.getSelection();
          record('keydown', {
            view: id,
            key: event.key,
            from: view.state.selection.from,
            to: view.state.selection.to,
            nativeText: native?.anchorNode?.textContent?.slice(0, 60),
            nativeOffset: native?.anchorOffset,
          });
          return false;
        },
        beforeinput(view, event) {
          if (['historyUndo', 'historyRedo'].includes(event.inputType)) {
            event.preventDefault();
            c[event.inputType === 'historyUndo' ? 'undo' : 'redo']();
            pump();
            return true;
          }
          record('beforeinput', {
            view: id,
            inputType: event.inputType,
            from: view.state.selection.from,
            to: view.state.selection.to,
          });
          return false;
        },
        compositionstart() {
          record('compositionstart', { view: id });
          return false;
        },
        compositionend() {
          record('compositionend', { view: id });
          return false;
        },
      },
    }
  );
}
function reset(restart = false) {
  if (restart) {
    pump();
    if (Object.values(clients).some((c) => c.pending))
      throw new Error('RESTART_BLOCKED_PENDING_INPUT');
    authority.protectBeforeClose();
  } else {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
  for (const view of Object.values(views)) view.destroy();
  views = {};
  paused.clear();
  authority = Authority.restore(store, fixture());
  createClients();
  mount('A');
  mount('B');
  document.querySelector('#close-a').textContent = 'Close view A';
  pump();
}
createClients();
mount('A');
mount('B');
pump();
const act = (callback) => {
  try {
    callback();
    pump();
  } catch (e) {
    status(e.code ?? e.message);
  }
};
for (const id of ['undo', 'redo', 'bold']) {
  const button = document.querySelector('#' + id);
  button.addEventListener('pointerdown', (e) => e.preventDefault());
  button.addEventListener('click', () =>
    act(() => {
      const c = clients[active];
      if (id === 'bold')
        toggleMark(schema.marks.strong)(c.state, (tr) => c.apply(tr));
      else c[id]();
    })
  );
}
document.querySelector('#external').onclick = () =>
  act(() => {
    execute(authority, {
      method: 'insert',
      id: 'external-ui-' + Date.now() + '-' + ++sequence,
      version: authority.version,
      target: 'Alpha',
      offset: 0,
      text: '[external] ',
    });
    pump();
  });
document.querySelector('#close-a').onclick = () =>
  act(() => {
    if (views.A) {
      if (clients.A.pending) throw new Error('CLOSE_BLOCKED_PENDING_INPUT');
      authority.protectBeforeClose();
      views.A.destroy();
      delete views.A;
      document.querySelector('#close-a').textContent = 'Reopen view A';
    } else {
      clients.A.sync();
      mount('A');
      document.querySelector('#close-a').textContent = 'Close view A';
    }
  });
document.querySelector('#restart').onclick = () => act(() => reset(true));
document.querySelector('#fail-save').onchange = (e) => {
  store.failSave = e.target.checked;
};
document.querySelector('#fail-protect').onchange = (e) => {
  store.failProtect = e.target.checked;
};
window.addEventListener('beforeunload', (e) => {
  try {
    if (Object.values(clients).some((c) => c.pending))
      throw new Error('PENDING');
    authority.protectBeforeClose();
  } catch {
    e.preventDefault();
    e.returnValue = '';
  }
});
// Synthetic-fixture test controls. This global exists only in this lab bundle.
window.lab = {
  reset: () => reset(false),
  snapshot: () => ({
    doc: authority.doc.toJSON(),
    version: authority.version,
    durableVersion: authority.durableVersion,
    contexts: Object.fromEntries(
      Object.entries(clients).map(([id, c]) => [
        id,
        {
          doc: c.state.doc.toJSON(),
          anchor: c.state.selection.anchor,
          head: c.state.selection.head,
          pending: c.pending,
          recovery: c.recovery,
        },
      ])
    ),
  }),
  select(id, text, from = 0, to = from) {
    const c = clients[id],
      a = textPosition(c.state.doc, text, from),
      b = textPosition(c.state.doc, text, to);
    c.apply(c.state.tr.setSelection(TextSelection.create(c.state.doc, a, b)));
    views[id].focus();
  },
  boundary(id) {
    clients[id].boundary();
  },
  pause(id) {
    paused.add(id);
  },
  resume(id) {
    paused.delete(id);
    pump();
  },
  command(request) {
    const result = execute(authority, request);
    pump();
    return result;
  },
  view(id) {
    return views[id];
  },
  trace: () => [...trace],
};
