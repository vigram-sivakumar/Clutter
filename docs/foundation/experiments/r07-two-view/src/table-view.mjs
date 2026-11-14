import { TableView } from 'prosemirror-tables';
import { appendTableAxis, cellContext } from './table-command.mjs';

// Shared presentation adapter. Both candidates submit identical table operations
// through their own existing authority; button DOM never stores table content.
export function tableView(node, view, getPos, boundary = () => {}) {
  const base = new TableView(node, 100);
  base.dom.classList.add('lab-table');
  for (const [axis, label] of [
    ['row', 'Add row'],
    ['column', 'Add column'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '+';
    button.contentEditable = 'false';
    button.dataset.tableHandle = axis;
    button.className = 'table-add table-add-' + axis;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      let position;
      try {
        position = getPos();
      } catch {
        return;
      }
      if (view.isDestroyed || typeof position !== 'number' || !view.editable)
        return;
      boundary('before', axis);
      const changed = appendTableAxis(
        view.state,
        (tr) => view.dispatch(tr),
        position,
        axis
      );
      boundary(changed ? 'after' : 'cancel', axis);
      if (changed) view.focus();
    });
    base.dom.append(button);
  }
  return {
    dom: base.dom,
    contentDOM: base.contentDOM,
    update: (node) => base.update(node),
    ignoreMutation: (record) =>
      record.target.nodeType === 1 &&
      record.target.closest?.('[data-table-handle]')
        ? true
        : base.ignoreMutation(record),
    stopEvent: (event) => !!event.target.closest?.('[data-table-handle]'),
  };
}
export function focusTableHandle(state, _dispatch, view) {
  const at = cellContext(state);
  if (!at || !view) return false;
  const tableDOM = view.nodeDOM(at.tablePos),
    button = tableDOM?.querySelector('[data-table-handle="row"]');
  if (!button) return false;
  button.focus();
  return true;
}
