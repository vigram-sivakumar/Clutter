import {
  BodyBlockSelection,
  selectBodyBlocks,
  isBlockToggleModifier,
  toggleBlockId,
  focusBlockSelection,
} from './body-selection.mjs';
import { blockRows } from './block-structure.mjs';

const point = (event) => ({ x: event.clientX, y: event.clientY });
const contains = (box, { x, y }) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
const rectangle = (a, b) => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  right: Math.max(a.x, b.x),
  bottom: Math.max(a.y, b.y),
});
const touches = (a, b) =>
  a.left <= b.right &&
  a.right >= b.left &&
  a.top <= b.bottom &&
  a.bottom >= b.top;

const activeViews = new WeakSet();
// PM may defer writing DOM selection during a native drag. Once marquee owns
// the drag, a late DOM selectionchange must keep the model's block selection.
export function marqueeSelectionBetween(view) {
  return activeViews.has(view) ? view.state.selection : null;
}

// Gesture state is local to the mounted editor. Block membership lives in its
// ProseMirror selection, so keyboard, paste and pointer commands share one path.
export function mountBlockMarquee(view, canEdit) {
  const { dom } = view;
  const doc = dom.ownerDocument;
  const win = doc.defaultView;
  const platform = win.navigator.platform;
  const overlay = doc.createElement('div');
  overlay.className = 'body-marquee';
  overlay.setAttribute('aria-hidden', 'true');
  let gesture;
  let suppressClick = false;
  const canvas = () => dom.closest('[data-block-selection-canvas]') ?? dom;
  const onCanvas = (event) => canvas().contains(event.target);
  const available = () =>
    dom.isConnected && !dom.closest('[inert]') && canEdit?.() !== false;
  const blockAt = (target) => {
    const block = target.closest?.('[data-block-id]');
    return block && dom.contains(block) ? block : null;
  };

  function finish() {
    if (activeViews.delete(view)) suppressClick = true;
    gesture = undefined;
    overlay.remove();
  }

  function start(event) {
    finish();
    suppressClick = false;
    const target = event.target;
    const primaryModifier = isBlockToggleModifier(event, platform);
    if (
      !onCanvas(event) ||
      event.button !== 0 ||
      (event.detail > 1 && !primaryModifier) ||
      view.composing ||
      !available() ||
      target.closest?.(
        'table, button, input, textarea, select, [data-block-handle]'
      )
    )
      return;

    const origin = point(event);
    const root = dom.getBoundingClientRect();
    const block = blockAt(target);
    const selection = view.state.selection;
    const selected =
      selection instanceof BodyBlockSelection ? selection.ids : [];
    gesture = {
      origin: { x: origin.x - root.left, y: origin.y - root.top },
      end: origin,
      startBlock: primaryModifier ? null : block,
      clickedId: block?.hasAttribute('data-title')
        ? null
        : block?.dataset.blockId,
      dismissOnClick: !primaryModifier && !block,
      baseline: primaryModifier ? selected : [],
      toggle: primaryModifier,
    };
    if (primaryModifier || gesture.dismissOnClick) event.preventDefault();
  }

  function applySelection(ids, keepFocus = true) {
    const tr = selectBodyBlocks(view.state, ids);
    if (!tr.selection.eq(view.state.selection))
      view.dispatch(tr.setMeta('pointer', true));
    if (!keepFocus) {
      if (view.hasFocus()) dom.blur();
    } else focusBlockSelection(view);
  }

  function update(event) {
    if (!available()) {
      finish();
      return;
    }
    const root = dom.getBoundingClientRect();
    const origin = {
      x: gesture.origin.x + root.left,
      y: gesture.origin.y + root.top,
    };
    const { end, startBlock } = gesture;
    if (!activeViews.has(view)) {
      if (origin.x === end.x && origin.y === end.y) return;
      if (
        startBlock?.isConnected &&
        contains(startBlock.getBoundingClientRect(), end)
      )
        return;
      activeViews.add(view);
      doc.body.append(overlay);
    }
    event?.preventDefault();
    const box = rectangle(origin, end);
    Object.assign(overlay.style, {
      left: box.left + 'px',
      top: box.top + 'px',
      width: box.right - box.left + 'px',
      height: box.bottom - box.top + 'px',
    });
    const ids = new Set(gesture.baseline);
    for (const { node, pos } of blockRows(view.state.doc)) {
      const element = view.nodeDOM(pos);
      if (
        element?.isConnected &&
        element.getBoundingClientRect &&
        touches(box, element.getBoundingClientRect())
      ) {
        if (gesture.toggle) toggleBlockId(ids, node.attrs.blockId);
        else ids.add(node.attrs.blockId);
      }
    }
    applySelection(ids);
  }

  function move(event) {
    if (!gesture) return;
    if (!(event.buttons & 1)) {
      finish();
      return;
    }
    gesture.end = point(event);
    update(event);
  }
  function scroll() {
    if (activeViews.has(view)) update();
  }
  function release(event) {
    if (event.button !== 0 || !gesture) return;
    if (activeViews.has(view)) {
      gesture.end = point(event);
      update(event);
    } else if (available() && onCanvas(event)) {
      const block = blockAt(event.target);
      if (gesture.toggle) {
        const releasedId = block?.dataset.blockId;
        if (releasedId && releasedId === gesture.clickedId) {
          const ids = new Set(gesture.baseline);
          toggleBlockId(ids, releasedId);
          applySelection(ids);
        }
        suppressClick = true;
      } else if (gesture.dismissOnClick && !block) {
        applySelection([], false);
        suppressClick = true;
      }
    }
    finish();
  }
  function click(event) {
    if (!suppressClick || !onCanvas(event) || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }
  function keydown(event) {
    if (event.key === 'Escape' && gesture) finish();
  }
  function guardNativeSelection(event) {
    if (
      activeViews.has(view) ||
      (gesture && dom.contains(event.target) && event.type === 'dragstart')
    )
      event.preventDefault();
  }

  const listeners = [
    [doc, 'mousedown', start],
    [doc, 'mousemove', move],
    [win, 'mouseup', release, false],
    [doc, 'click', click],
    [doc, 'keydown', keydown],
    [doc, 'selectstart', guardNativeSelection],
    [doc, 'dragstart', guardNativeSelection],
    [doc, 'scroll', scroll],
    [win, 'blur', finish, false],
    [doc, 'pointercancel', finish],
  ];
  for (const [target, type, handler, capture = true] of listeners)
    target.addEventListener(type, handler, capture);
  return {
    destroy() {
      finish();
      for (const [target, type, handler, capture = true] of listeners)
        target.removeEventListener(type, handler, capture);
    },
  };
}
