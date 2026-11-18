import {
  BodyBlockSelection,
  selectBodyBlocks,
  presentsBodySelection,
  isBlockToggleModifier,
  toggleBlockId,
  focusBlockSelection,
} from './body-selection.mjs';
import { mountHandleDrag } from './block-handle-drag.mjs';
import { blockRows } from './block-structure.mjs';

// Handles are editor chrome. Keep them outside the editable DOM and its
// native text hit targets, with one button keyed to each canonical body ID.
export function mountBlockHandles(view, canEdit, stopCapturing) {
  const { dom } = view;
  const doc = dom.ownerDocument;
  const win = doc.defaultView;
  const platform = win.navigator.platform;
  const layer = doc.createElement('div');
  layer.className = 'block-handle-layer';
  dom.after(layer);
  const host = dom.parentElement;
  const drag = mountHandleDrag(view, layer, canEdit, stopCapturing);
  const handles = new Map();
  let hovered;
  let rows = [];
  let frame;

  function reveal(id) {
    if (id === hovered) return;
    handles.get(hovered)?.removeAttribute('data-revealed');
    hovered = id;
    handles.get(hovered)?.setAttribute('data-revealed', '');
  }

  function hover(event) {
    if (event.pointerType === 'touch') return;
    if (!hovered && !host.contains(event.target)) return;
    if (dom.closest('[inert]')) {
      reveal();
      return;
    }
    const handle = event.target.closest('[data-block-handle]');
    const block = event.target.closest('[data-block-id]');
    const id = layer.contains(handle)
      ? handle.dataset.blockHandle
      : dom.contains(block)
        ? block.dataset.blockId
        : undefined;
    if (handles.has(id)) {
      reveal(id);
      return;
    }

    // Keep the handle exposed while the pointer travels across its gutter gap.
    const row =
      hovered && rows.find(({ node }) => node.attrs.blockId === hovered);
    const canvas = dom.closest('[data-block-selection-canvas]') ?? host;
    const blockBox = row && view.nodeDOM(row.pos)?.getBoundingClientRect();
    if (blockBox && canvas.contains(event.target)) {
      const handleBox = handles.get(hovered).getBoundingClientRect();
      if (
        event.clientX >= handleBox.left &&
        event.clientX <= blockBox.left &&
        event.clientY >= Math.min(blockBox.top, handleBox.top) &&
        event.clientY <= Math.max(blockBox.bottom, handleBox.bottom)
      )
        return;
    }
    reveal();
  }

  const leave = (event) => {
    if (!event.relatedTarget) reveal();
  };

  function positionHandles() {
    const top = layer.getBoundingClientRect().top;
    for (const { node, pos } of rows) {
      const element = view.nodeDOM(pos);
      if (!element?.getBoundingClientRect) continue;
      const box = element.getBoundingClientRect();
      const handle = handles.get(node.attrs.blockId);
      handle.style.top = box.top - top + Math.min(box.height / 2, 14) + 'px';
    }
  }

  function schedulePosition() {
    if (frame !== undefined) return;
    frame = win.requestAnimationFrame(() => {
      frame = undefined;
      positionHandles();
    });
  }

  function update(current, previous) {
    if (!previous || previous.doc !== current.state.doc) {
      rows = blockRows(current.state.doc);
      const ids = new Set(rows.map(({ node }) => node.attrs.blockId));
      if (!ids.has(hovered)) reveal();
      for (const [id, handle] of handles) {
        if (!ids.has(id)) {
          handle.remove();
          handles.delete(id);
        }
      }
      for (const [index, { node }] of rows.entries()) {
        const id = node.attrs.blockId;
        let handle = handles.get(id);
        if (!handle) {
          handle = doc.createElement('button');
          handle.type = 'button';
          handle.tabIndex = -1;
          handle.dataset.blockHandle = id;
          handles.set(id, handle);
        }
        handle.setAttribute('aria-label', 'Select block ' + (index + 1));
        layer.append(handle);
      }
      schedulePosition();
    }
    if (
      previous?.doc === current.state.doc &&
      previous.selection.eq(current.state.selection)
    )
      return;
    const selection = current.state.selection;
    const ids = new Set(presentsBodySelection(selection) ? selection.ids : []);
    for (const [id, handle] of handles)
      handle.setAttribute('aria-pressed', String(ids.has(id)));
  }

  function click(event) {
    if (drag.consumeDragClick()) return;
    const handle = event.target.closest('[data-block-handle]');
    if (!handle || canEdit?.() === false || dom.closest('[inert]')) return;
    const id = handle.dataset.blockHandle;
    const toggle = isBlockToggleModifier(event, platform);
    const selection = view.state.selection;
    const ids = new Set(
      toggle && selection instanceof BodyBlockSelection ? selection.ids : []
    );
    if (toggle) toggleBlockId(ids, id);
    else ids.add(id);
    view.dispatch(selectBodyBlocks(view.state, ids).setMeta('pointer', true));
    focusBlockSelection(view);
  }

  doc.addEventListener('pointerover', hover);
  doc.addEventListener('pointermove', hover);
  doc.addEventListener('pointerout', leave);
  layer.addEventListener('click', click);
  const resize = win.ResizeObserver && new win.ResizeObserver(schedulePosition);
  resize?.observe(dom);
  update(view);
  return {
    update,
    destroy() {
      drag.destroy();
      resize?.disconnect();
      doc.removeEventListener('pointerover', hover);
      doc.removeEventListener('pointermove', hover);
      doc.removeEventListener('pointerout', leave);
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      layer.remove();
    },
  };
}
