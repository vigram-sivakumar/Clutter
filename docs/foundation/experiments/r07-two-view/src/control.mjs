import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { tableEditing } from 'prosemirror-tables';
import { fixture } from './schema.mjs';
import { nextCellOrRow } from './table-command.mjs';
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
      const native = window.getSelection();
      trace.push({
        key: event.key,
        from: view.state.selection.from,
        nativeText: native?.anchorNode?.textContent,
        nativeOffset: native?.anchorOffset,
      });
      return false;
    },
  },
});
window.controlTrace = () => trace;
