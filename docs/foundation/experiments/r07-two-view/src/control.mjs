import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { tableEditing } from 'prosemirror-tables';
import { fixture } from './schema.mjs';
import { nextCellOrRow } from './legacy-table-command.mjs';
import { reconcileNativeTextSelection } from './selection-preflight.mjs';
const selectionPreflight =
  new URLSearchParams(location.search).get('selection') === 'public';
const trace = [];
const view = new EditorView(document.querySelector('#control'), {
  state: EditorState.create({
    doc: fixture(),
    plugins: [
      history(),
      keymap({ Tab: nextCellOrRow }),
      keymap(baseKeymap),
      tableEditing(),
    ],
  }),
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr));
  },
  handleDOMEvents: {
    keydown(view, event) {
      const preflight = selectionPreflight
        ? reconcileNativeTextSelection(view, event)
        : { changed: false, reason: 'raw-control' };
      const native = window.getSelection();
      trace.push({
        key: event.key,
        preflight,
        from: view.state.selection.from,
        nativeText: native?.anchorNode?.textContent,
        nativeOffset: native?.anchorOffset,
      });
      return false;
    },
  },
});
window.controlTrace = () => trace;
