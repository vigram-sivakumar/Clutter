import { Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { BodyBlockSelection } from './body-selection.mjs';

export function titleInteractions(nextId, canEdit) {
  return new Plugin({
    props: {
      decorations(state) {
        const title = state.doc.firstChild;
        if (title.content.size) return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(0, title.nodeSize, {
            'data-placeholder': 'New note',
          }),
        ]);
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
            state.doc.childCount === 2 &&
            state.doc.child(1).type.name === 'paragraph' &&
            state.doc.child(1).content.size === 0;
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
        const tr = view.state.tr.insert(view.state.doc.content.size, blocks);
        view.dispatch(
          tr.setSelection(
            new BodyBlockSelection(
              tr.doc,
              blocks.map((block) => block.attrs.blockId)
            )
          )
        );
        // Scroll the actual appended block in its existing pane, without a remount.
        view.dom
          .querySelector(`[data-block-id="${blocks[0].attrs.blockId}"]`)
          ?.scrollIntoView?.({ block: 'nearest' });
        return true;
      },
    },
  });
}
