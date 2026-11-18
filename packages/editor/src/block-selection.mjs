import {
  Plugin,
  PluginKey,
  TextSelection,
  NodeSelection,
} from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  BodyBlockSelection,
  presentsBodySelection,
  isInactiveBodySelection,
} from './body-selection.mjs';
import { blockRows } from './block-structure.mjs';
import {
  mountBlockMarquee,
  marqueeSelectionBetween,
} from './block-marquee.mjs';
import { deleteBlocks } from './block-deletion.mjs';
const key = new PluginKey('body-block-selection');
const preventBlockReplacement = (view, event) => {
  if (!(view.state.selection instanceof BodyBlockSelection)) return false;
  event.preventDefault();
  return true;
};
// Leave hidden block mode before native mouse-down placement/dragging begins.
// Resolve through public PM hit testing; root whitespace may map to a block edge.
export function resumeTextSelection(view, pos, event) {
  if (
    !(view.state.selection instanceof BodyBlockSelection) ||
    event.button !== 0 ||
    event.defaultPrevented
  )
    return false;
  const $at = view.state.doc.resolve(pos);
  const selection = TextSelection.near($at);
  if (
    !(selection instanceof TextSelection) ||
    selection.$from.depth !== 1 ||
    !selection.$from.parent.isTextblock ||
    (pos >= view.state.doc.firstChild.nodeSize &&
      selection.$from.index(0) === 0)
  )
    return false;
  const wasInactive = isInactiveBodySelection(view.state.selection);
  view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true));
  if (view.editable) {
    // A focused noneditable root can retain DOM focus without starting a native
    // editing session. Reacquire focus once, after editability is restored.
    if (wasInactive && view.hasFocus()) view.dom.blur();
    if (!view.hasFocus()) view.focus();
  }
  return true;
}
export function bodyBlockInteractions({ canEdit, nextId, stopCapturing } = {}) {
  return new Plugin({
    key,
    view: (view) => mountBlockMarquee(view, canEdit),
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
      createSelectionBetween: marqueeSelectionBetween,
      // Empty/no-caret mode keeps keyboard focus without a live transparent caret.
      editable: (state) => !isInactiveBodySelection(state.selection),
      attributes: (state) =>
        presentsBodySelection(state.selection)
          ? {
              tabindex: '0',
              'data-body-selection': '',
              class: 'body-selection-mode',
            }
          : { tabindex: '0' },
      decorations(state) {
        if (!presentsBodySelection(state.selection)) return null;
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
      handleClick: resumeTextSelection,
      handleTextInput: (view) =>
        view.state.selection instanceof BodyBlockSelection,
      handlePaste: (view) => view.state.selection instanceof BodyBlockSelection,
      handleDrop: (view) => view.state.selection instanceof BodyBlockSelection,
      handleDOMEvents: {
        keydown(view, event) {
          if (view.editable || !isInactiveBodySelection(view.state.selection))
            return false;
          // PM skips its editing key pipeline when noneditable. Route the same
          // public handlers once; copy remains the native non-editing copy path.
          const handled = view.someProp('handleKeyDown', (handler) =>
            handler(view, event)
          );
          if (handled) event.preventDefault();
          return !!handled;
        },
        mousedown(view, event) {
          if (!(view.state.selection instanceof BodyBlockSelection))
            return false;
          const hit = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!hit) return false;
          const node =
            hit.inside >= 0
              ? view.state.doc.nodeAt(hit.inside)
              : view.state.doc.nodeAt(hit.pos);
          if (node?.isBlock && !node.isTextblock) return false;
          resumeTextSelection(view, hit.pos, event);
          // Let PM/browser continue normal text dragging and multi-click handling.
          return false;
        },
        beforeinput: preventBlockReplacement,
        cut: preventBlockReplacement,
      },
    },
  });
}
