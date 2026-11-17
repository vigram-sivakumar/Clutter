import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
const key = new PluginKey('title-and-paste');
// Local feedback only: IDs survive mapped edits, but are never document attributes.
export function titleInteractions(nextId, canEdit) {
  return new Plugin({
    key,
    state: {
      init: () => [],
      apply(tr, ids) {
        return tr.getMeta(key) ?? ids;
      },
    },
    props: {
      decorations(state) {
        const ids = key.getState(state),
          decorations = [];
        state.doc.forEach((node, pos) => {
          if (node.type.name === 'title' && !node.content.size)
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                'data-placeholder': 'New note',
              })
            );
          if (ids.includes(node.attrs.blockId))
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'pasted-block',
              })
            );
        });
        return DecorationSet.create(state.doc, decorations);
      },
      attributes(state) {
        return key.getState(state).length ? { class: 'paste-feedback' } : {};
      },
      handleKeyDown(view, event) {
        if (canEdit?.() === false || event.isComposing || view.composing)
          return false;
        const { state } = view,
          { $from, empty } = state.selection;
        if ($from.parent.type.name === 'title' && event.key === 'Enter') {
          if (event.shiftKey) return true;
          if (event.altKey || event.metaKey || event.ctrlKey) return false;
          const start = state.doc.firstChild.nodeSize;
          const bodyEmpty =
            state.doc.childCount === 2 && state.doc.child(1).content.size === 0;
          let tr = state.tr;
          if (!bodyEmpty)
            tr = tr.insert(
              start,
              state.schema.nodes.paragraph.create({ blockId: nextId() })
            );
          view.dispatch(
            tr
              .setSelection(TextSelection.create(tr.doc, start + 1))
              .scrollIntoView()
          );
          return true;
        }
        if (
          event.key === 'Backspace' &&
          empty &&
          $from.parent.type.name === 'paragraph' &&
          $from.parentOffset === 0 &&
          $from.index(0) === 1
        ) {
          view.dispatch(
            state.tr
              .setSelection(
                TextSelection.create(
                  state.doc,
                  state.doc.firstChild.nodeSize - 1
                )
              )
              .setMeta('addToHistory', false)
          );
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        if (
          canEdit?.() === false ||
          view.state.selection.$from.parent.type.name !== 'title'
        )
          return false;
        const text = event.clipboardData?.getData('text/plain');
        if (typeof text !== 'string' || !/[\r\n]/.test(text)) return false;
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        const blocks = lines.map((line) =>
          view.state.schema.nodes.paragraph.create(
            { blockId: nextId() },
            line ? view.state.schema.text(line) : null
          )
        );
        view.dispatch(
          view.state.tr.insert(view.state.doc.content.size, blocks).setMeta(
            key,
            blocks.map((b) => b.attrs.blockId)
          )
        );
        view.dom.blur();
        // Scroll the actual appended block in its existing pane, without a remount.
        view.dom
          .querySelector(`[data-block-id="${blocks[0].attrs.blockId}"]`)
          ?.scrollIntoView?.({ block: 'nearest' });
        return true;
      },
    },
    view(view) {
      const clear = () => {
        if (key.getState(view.state).length)
          view.dispatch(
            view.state.tr.setMeta(key, []).setMeta('addToHistory', false)
          );
      };
      view.dom.ownerDocument.addEventListener('pointerdown', clear, true);
      view.dom.ownerDocument.addEventListener('click', clear, true);
      return {
        destroy() {
          view.dom.ownerDocument.removeEventListener(
            'pointerdown',
            clear,
            true
          );
          view.dom.ownerDocument.removeEventListener('click', clear, true);
        },
      };
    },
  });
}
