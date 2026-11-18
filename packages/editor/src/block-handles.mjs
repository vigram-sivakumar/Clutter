import {
  BodyBlockSelection,
  selectBodyBlocks,
  presentsBodySelection,
  isBlockToggleModifier,
  toggleBlockId,
  focusBlockSelection,
} from './body-selection.mjs';
import { blockRows } from './block-structure.mjs';

// Handles are editor chrome. Keep them outside the editable DOM and its
// native text hit targets, with one button keyed to each canonical body ID.
export function mountBlockHandles(view, canEdit) {
  const { dom } = view;
  const doc = dom.ownerDocument;
  const win = doc.defaultView;
  const platform = win.navigator.platform;
  const layer = doc.createElement('div');
  layer.className = 'block-handle-layer';
  dom.after(layer);
  const handles = new Map();
  let rows = [];
  let frame;

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

  function mouseDown(event) {
    if (event.button === 0 && event.target.closest('[data-block-handle]'))
      event.preventDefault();
  }

  function click(event) {
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

  layer.addEventListener('mousedown', mouseDown);
  layer.addEventListener('click', click);
  const resize = win.ResizeObserver && new win.ResizeObserver(schedulePosition);
  resize?.observe(dom);
  update(view);
  return {
    update,
    destroy() {
      resize?.disconnect();
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      layer.remove();
    },
  };
}
