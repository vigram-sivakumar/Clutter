import {
  BodyBlockSelection,
  focusBlockSelection,
  isBlockToggleModifier,
} from './body-selection.mjs';
import { blockMoveScope, moveBlocks, planBlockMove } from './block-reorder.mjs';

export function mountHandleDrag(view, layer, canEdit, stopCapturing) {
  const { dom } = view;
  const doc = dom.ownerDocument;
  const win = doc.defaultView;
  const platform = win.navigator.platform;
  const marker = doc.createElement('div');
  marker.className = 'block-drop-line';
  marker.setAttribute('aria-hidden', 'true');
  const ghost = doc.createElement('div');
  ghost.className = 'block-drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  let drag;
  let suppressClick = false;

  const valid = () =>
    dom.isConnected &&
    !dom.closest('[inert]') &&
    canEdit?.() !== false &&
    !view.composing &&
    view.state.doc === drag.scope.doc;

  function finish() {
    if (drag?.active) suppressClick = true;
    drag = undefined;
    marker.remove();
    ghost.remove();
    ghost.replaceChildren();
  }

  function start(event) {
    finish();
    suppressClick = false;
    const handle = event.target.closest('[data-block-handle]');
    if (
      !handle ||
      event.button !== 0 ||
      canEdit?.() === false ||
      dom.closest('[inert]') ||
      view.composing
    )
      return;
    event.preventDefault();
    if (isBlockToggleModifier(event, platform)) return;
    const id = handle.dataset.blockHandle;
    const selection = view.state.selection;
    const ids =
      selection instanceof BodyBlockSelection && selection.ids.includes(id)
        ? selection.ids
        : [id];
    const scope = blockMoveScope(view.state.doc, ids);
    if (!scope.moved.length || !scope.retained.length) return;
    drag = { startY: event.clientY, point: null, ids, scope, active: false };
  }

  function preview(point) {
    const canvas =
      dom.closest('[data-block-selection-canvas]') ?? dom.parentElement;
    const bounds = canvas.getBoundingClientRect();
    const { x, y } = point;
    if (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    ) {
      marker.remove();
      return null;
    }
    const boxes = drag.scope.retained.map(({ pos }) =>
      view.nodeDOM(pos)?.getBoundingClientRect()
    );
    if (boxes.some((box) => !box)) {
      marker.remove();
      return null;
    }
    const index = boxes.findIndex((box) => y < (box.top + box.bottom) / 2);
    const slot = index < 0 ? boxes.length : index;
    const plan = planBlockMove(drag.scope, slot);
    if (!plan) {
      marker.remove();
      return null;
    }
    const before = boxes[slot - 1];
    const after = boxes[slot];
    const top =
      before && after
        ? (before.bottom + after.top) / 2
        : (after?.top ?? before.bottom);
    const editor = dom.getBoundingClientRect();
    marker.style.left = Math.max(editor.left, bounds.left) + 'px';
    marker.style.right =
      Math.max(0, win.innerWidth - Math.min(editor.right, bounds.right)) + 'px';
    marker.style.top =
      Math.max(bounds.top, Math.min(bounds.bottom, top)) + 'px';
    if (!marker.isConnected) doc.body.append(marker);
    return plan;
  }

  function showGhost() {
    const { moved } = drag.scope;
    for (const { node } of moved.slice(0, 3)) {
      const row = doc.createElement(
        node.type.name === 'separator' ? 'hr' : 'div'
      );
      if (node.type.name !== 'separator')
        row.textContent = node.textContent.slice(0, 160) || 'Empty block';
      ghost.append(row);
    }
    if (moved.length > 3) {
      const count = doc.createElement('small');
      count.textContent = '+' + (moved.length - 3) + ' more';
      ghost.append(count);
    }
    doc.body.append(ghost);
    drag.ghostSize = ghost.getBoundingClientRect();
  }

  function positionGhost({ x, y }) {
    const { width, height } = drag.ghostSize;
    const left = Math.max(8, Math.min(x + 16, win.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y + 12, win.innerHeight - height - 8));
    ghost.style.transform = `translate(${left}px, ${top}px)`;
  }

  function move(event) {
    if (!drag) return;
    if (!(event.buttons & 1) || !valid()) {
      finish();
      return;
    }
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) < 4) return;
      drag.active = true;
      showGhost();
    }
    drag.point = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    positionGhost(drag.point);
    preview(drag.point);
  }

  function release(event) {
    if (!drag || event.button !== 0) return;
    const tr =
      drag.active && valid()
        ? moveBlocks(
            view.state,
            drag.scope,
            preview({ x: event.clientX, y: event.clientY }),
            drag.ids
          )
        : null;
    finish();
    if (!tr) return;
    event.preventDefault();
    stopCapturing?.();
    view.dispatch(tr);
    stopCapturing?.();
    focusBlockSelection(view);
  }

  function scroll() {
    if (!drag?.active) return;
    if (valid()) preview(drag.point);
    else finish();
  }

  function keyDown(event) {
    if (event.key === 'Escape') finish();
  }

  layer.addEventListener('mousedown', start);
  doc.addEventListener('mousemove', move, true);
  win.addEventListener('mouseup', release);
  doc.addEventListener('scroll', scroll, true);
  doc.addEventListener('keydown', keyDown, true);
  win.addEventListener('blur', finish);
  doc.addEventListener('pointercancel', finish, true);
  return {
    consumeDragClick() {
      const handled = suppressClick;
      suppressClick = false;
      return handled;
    },
    destroy() {
      finish();
      layer.removeEventListener('mousedown', start);
      doc.removeEventListener('mousemove', move, true);
      win.removeEventListener('mouseup', release);
      doc.removeEventListener('scroll', scroll, true);
      doc.removeEventListener('keydown', keyDown, true);
      win.removeEventListener('blur', finish);
      doc.removeEventListener('pointercancel', finish, true);
    },
  };
}
