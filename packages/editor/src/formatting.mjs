import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import {
  plainFormats,
  colorFormats,
  validateFormat,
  isPreset,
} from './formatting-spec.mjs';
const key = new PluginKey('text-formatting');
export function bodyTextSelection(state) {
  const { $from, $to } = state.selection;
  return (
    state.selection instanceof TextSelection &&
    $from.depth === 1 &&
    $to.depth === 1 &&
    $from.index(0) > 0 &&
    $to.index(0) > 0 &&
    $from.parent.isTextblock &&
    $to.parent.isTextblock
  );
}
function textRanges(state) {
  const { from, to } = state.selection,
    ranges = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText)
      ranges.push({
        node,
        from: Math.max(from, pos),
        to: Math.min(to, pos + node.nodeSize),
      });
  });
  return ranges.filter((range) => range.from < range.to);
}
export function formattingState(state) {
  const ranges = textRanges(state),
    result = {};
  for (const type of [...plainFormats, ...colorFormats, 'link']) {
    const marks = ranges.map((range) =>
      range.node.marks.find((mark) => mark.type.name === type)
    );
    result[type] =
      marks.length &&
      marks.every(Boolean) &&
      marks.every(
        (mark) => JSON.stringify(mark.attrs) === JSON.stringify(marks[0].attrs)
      )
        ? plainFormats.includes(type)
          ? true
          : type === 'link'
            ? marks[0].attrs.href
            : marks[0].attrs.preset
        : null;
  }
  const blocks = [];
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (node.isTextblock && Object.hasOwn(node.attrs, 'background'))
      blocks.push(node.attrs.background);
  });
  result.background =
    blocks.length && blocks.every((value) => value === blocks[0])
      ? blocks[0]
      : null;
  return result;
}
// Common executor for floating controls and keyboard shortcuts. Text marks apply
// to text spans, not atomic reference/date/break nodes or the structured title.
export function createFormattingTransaction(state, action, value) {
  if (!bodyTextSelection(state)) return null;
  const { from, to, empty } = state.selection,
    tr = state.tr;
  if (action === 'background') {
    if (empty || (value !== null && !isPreset(value))) return null;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (
        node.isTextblock &&
        Object.hasOwn(node.attrs, 'background') &&
        pos < to &&
        pos + node.nodeSize - 1 > from
      )
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, background: value });
    });
  } else {
    const type = state.schema.marks[action];
    if (!type) return null;
    let attrs = {},
      remove = false;
    if (colorFormats.includes(action)) {
      if (value === null) remove = true;
      else attrs = { preset: value };
    } else if (action === 'link') {
      if (value === null) remove = true;
      else attrs = { href: value };
    } else if (!plainFormats.includes(action)) return null;
    if (!remove) validateFormat(action, attrs);
    if (plainFormats.includes(action)) {
      remove = empty
        ? (state.storedMarks ?? state.selection.$from.marks()).some(
            (mark) => mark.type === type
          )
        : Boolean(formattingState(state)[action]);
    }
    if (empty) {
      if (remove) tr.removeStoredMark(type);
      else tr.addStoredMark(type.create(attrs));
    } else
      for (const range of textRanges(state)) {
        if (remove) tr.removeMark(range.from, range.to, type);
        else tr.addMark(range.from, range.to, type.create(attrs));
      }
  }
  return tr.setMeta(key, { action: true });
}
export const isFormattingTransaction = (tr) => tr.getMeta(key)?.action === true;
export function textFormatting({ canEdit, renderToolbar } = {}) {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (
          canEdit?.() === false ||
          event.isComposing ||
          view.composing ||
          event.altKey ||
          !(event.metaKey || event.ctrlKey)
        )
          return false;
        const action = event.shiftKey
          ? event.key.toLowerCase() === 'x'
            ? 'strike'
            : null
          : { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()];
        if (!action) return false;
        const tr = createFormattingTransaction(view.state, action);
        if (!tr) return true;
        view.dispatch(tr);
        return true;
      },
    },
    view(view) {
      const renderer = renderToolbar?.({ document: view.dom.ownerDocument });
      let dismissed = null,
        destroyed = false,
        interacting = false;
      const update = () => {
        const state = view.state;
        if (!renderer || destroyed) return;
        if (
          canEdit?.() === false ||
          !bodyTextSelection(state) ||
          state.selection.empty ||
          view.dom.closest('[inert]') ||
          (!view.hasFocus() && !renderer.hasFocus() && !interacting) ||
          dismissed?.eq(state.selection)
        ) {
          renderer.update(null);
          return;
        }
        let rect;
        try {
          const selection = view.dom.ownerDocument.getSelection();
          if (
            selection?.rangeCount === 1 &&
            view.dom.contains(selection.anchorNode) &&
            view.dom.contains(selection.focusNode)
          ) {
            const measured = selection.getRangeAt(0).getBoundingClientRect();
            if (measured.width || measured.height) rect = measured;
          }
          if (!rect) {
            const a = view.coordsAtPos(state.selection.from),
              b = view.coordsAtPos(state.selection.to);
            rect = {
              left: Math.min(a.left, b.left),
              right: Math.max(a.right, b.right),
              top: Math.min(a.top, b.top),
            };
          }
        } catch {
          rect = view.dom.getBoundingClientRect();
        }
        renderer.update({
          rect,
          values: formattingState(state),
          apply: (action, value) => {
            if (
              canEdit?.() === false ||
              view.state.selection.empty ||
              !bodyTextSelection(view.state) ||
              view.dom.closest('[inert]')
            )
              return false;
            const tr = createFormattingTransaction(view.state, action, value);
            if (!tr) return true;
            view.dispatch(tr);
            return true;
          },
          dismiss: () => {
            interacting = false;
            dismissed = view.state.selection;
            renderer.update(null);
            view.focus();
          },
        });
      };
      const doc = view.dom.ownerDocument;
      // Claim ownership BEFORE the editor blurs. Native select popups and WebKit
      // focus transitions can temporarily leave activeElement on body/null. That
      // gap is not outside intent and must not unmount the initiating control.
      const pointer = (event) => {
        if (renderer?.contains(event.target)) {
          interacting = true;
          return;
        }
        interacting = false;
        dismissed = view.state.selection;
        renderer?.update(null);
      };
      const focus = (event) => {
        if (
          renderer?.contains(event.target) ||
          renderer?.contains(event.relatedTarget)
        )
          interacting = true;
        if (event.type === 'focusin') {
          if (view.dom.contains(event.target)) interacting = false;
          else if (
            !renderer?.contains(event.target) &&
            event.target !== doc.body &&
            event.target !== doc.documentElement &&
            event.target !== doc
          ) {
            interacting = false;
            dismissed = view.state.selection;
          }
        }
        queueMicrotask(update);
      };
      doc.addEventListener('pointerdown', pointer, true);
      doc.addEventListener('focusin', focus);
      doc.addEventListener('focusout', focus);
      doc.addEventListener('scroll', update, true);
      doc.defaultView?.addEventListener('resize', update);
      update();
      return {
        update: (view, previous) => {
          if (!previous.selection.eq(view.state.selection)) dismissed = null;
          update();
        },
        destroy: () => {
          destroyed = true;
          doc.removeEventListener('pointerdown', pointer, true);
          doc.removeEventListener('focusin', focus);
          doc.removeEventListener('focusout', focus);
          doc.removeEventListener('scroll', update, true);
          doc.defaultView?.removeEventListener('resize', update);
          renderer?.destroy();
        },
      };
    },
  });
}
