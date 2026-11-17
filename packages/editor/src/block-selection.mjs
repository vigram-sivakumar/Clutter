import {
  Plugin,
  PluginKey,
  TextSelection,
  NodeSelection,
} from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { BodyBlockSelection } from './body-selection.mjs';
import { blockRows } from './block-structure.mjs';
import { deleteBlocks } from './block-deletion.mjs';
const key = new PluginKey('body-block-selection');
const preventBlockReplacement = (view, event) => {
  if (!(view.state.selection instanceof BodyBlockSelection)) return false;
  event.preventDefault();
  return true;
};
export function bodyBlockInteractions({ canEdit, nextId, stopCapturing } = {}) {
  return new Plugin({
    key,
    state: {
      init: () => null,
      apply(tr, previous, oldState) {
        const intent = tr.getMeta(key);
        if (intent?.firstId !== undefined) return intent.firstId;
        return tr.docChanged || !tr.selection.eq(oldState.selection)
          ? null
          : previous;
      },
    },
    props: {
      attributes: (state) =>
        state.selection instanceof BodyBlockSelection
          ? { 'data-body-selection': '', class: 'body-selection-mode' }
          : {},
      decorations(state) {
        if (!(state.selection instanceof BodyBlockSelection)) return null;
        const ids = new Set(state.selection.ids);
        return DecorationSet.create(
          state.doc,
          blockRows(state.doc)
            .filter(({ node }) => ids.has(node.attrs.blockId))
            .map(({ node, pos }) =>
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'selected-body-block',
              })
            )
        );
      },
      handleKeyDown(view, event) {
        const state = view.state,
          selection = state.selection;
        if (event.isComposing || view.composing) return false;
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'a'
        ) {
          if (
            selection instanceof BodyBlockSelection ||
            (selection instanceof NodeSelection &&
              selection.$from.depth === 0 &&
              selection.$from.index() > 0)
          ) {
            view.dispatch(
              state.tr.setSelection(
                new BodyBlockSelection(
                  state.doc,
                  blockRows(state.doc).map(({ node }) => node.attrs.blockId)
                )
              )
            );
            return true;
          }
          const { $from, $to } = selection;
          // Nested/table selections retain their own keyboard mode.
          if (
            !(selection instanceof TextSelection) ||
            $from.depth !== 1 ||
            $to.depth !== 1
          )
            return false;
          const origin = selection.$anchor;
          if (origin.index(0) === 0) {
            view.dispatch(
              state.tr.setSelection(
                TextSelection.create(
                  state.doc,
                  1,
                  state.doc.firstChild.nodeSize - 1
                )
              )
            );
            return true;
          }
          const id = origin.parent.attrs.blockId;
          if (
            key.getState(state) === id &&
            $from.sameParent($to) &&
            $from.parentOffset === 0 &&
            $to.parentOffset === $from.parent.content.size
          )
            view.dispatch(
              state.tr.setSelection(
                new BodyBlockSelection(
                  state.doc,
                  blockRows(state.doc).map(({ node }) => node.attrs.blockId)
                )
              )
            );
          else
            view.dispatch(
              state.tr
                .setSelection(
                  TextSelection.create(state.doc, origin.start(), origin.end())
                )
                .setMeta(key, { firstId: id })
            );
          return true;
        }
        if (
          event.key === 'Escape' &&
          (selection instanceof BodyBlockSelection ||
            (selection instanceof TextSelection && !selection.empty))
        ) {
          view.dispatch(
            state.tr.setSelection(new BodyBlockSelection(state.doc, []))
          );
          return true;
        }
        if (!(selection instanceof BodyBlockSelection)) return false;
        if (event.key === 'Backspace' || event.key === 'Delete') {
          if (canEdit?.() !== false) {
            const tr = deleteBlocks(state, selection.ids, nextId);
            if (tr) {
              stopCapturing?.();
              view.dispatch(
                tr.setSelection(new BodyBlockSelection(tr.doc, []))
              );
              stopCapturing?.();
            }
          }
          return true;
        }
        // Copy and context Undo/Redo remain available; ordinary typing/Enter,
        // browser cut/paste and editing keys cannot replace explicit blocks.
        if (
          (event.metaKey || event.ctrlKey) &&
          ['c', 'z'].includes(event.key.toLowerCase())
        )
          return false;
        return true;
      },
      handleClick(view, pos, event) {
        if (
          !(view.state.selection instanceof BodyBlockSelection) ||
          event.button !== 0 ||
          event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return false;
        const $at = view.state.doc.resolve(pos);
        if ($at.depth !== 1 || !$at.parent.isTextblock) return false;
        view.dispatch(view.state.tr.setSelection(TextSelection.near($at)));
        view.focus();
        return true;
      },
      handleTextInput: (view) =>
        view.state.selection instanceof BodyBlockSelection,
      handlePaste: (view) => view.state.selection instanceof BodyBlockSelection,
      handleDrop: (view) => view.state.selection instanceof BodyBlockSelection,
      handleDOMEvents: {
        beforeinput: preventBlockReplacement,
        cut: preventBlockReplacement,
      },
    },
  });
}
