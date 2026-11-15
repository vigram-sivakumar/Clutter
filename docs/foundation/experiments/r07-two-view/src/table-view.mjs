import { Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { TableView, CellSelection } from 'prosemirror-tables';
import {
  appendTableAxis,
  cellContext,
  selectCellText,
  cellEnd,
} from './table-command.mjs';
import { reconcileNativeTextSelection } from './selection-preflight.mjs';

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
    button.addEventListener('pointerdown', (event) => {
      // Reconcile a just-clicked native caret before suppressing button focus.
      reconcileNativeTextSelection(view, event);
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      let position;
      try {
        position = getPos();
      } catch {
        return;
      }
      if (view.isDestroyed || typeof position !== 'number' || !view.editable)
        return;
      const focused = view.dom.ownerDocument.activeElement;
      const restoreEditor =
        focused === view.dom ||
        focused === button ||
        focused === view.dom.ownerDocument.body ||
        !focused;
      boundary('before', axis, position);
      const changed = appendTableAxis(
        view.state,
        (tr) => view.dispatch(tr),
        position,
        axis
      );
      boundary(changed ? 'after' : 'cancel', axis, position);
      if (changed && restoreEditor && !view.hasFocus()) view.focus();
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
// Selection is view state, never document content or a second table model.
export function tableCellHighlight() {
  return new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (
          event.button !== 0 ||
          event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.target.closest('[contenteditable="false"]')
        )
          return false;
        let selection = TextSelection.near(view.state.doc.resolve(pos));
        const clickedCell = event.target.closest('td, th');
        if (!clickedCell || !view.dom.contains(clickedCell)) return false;
        // Coordinate hit testing can resolve padding to an adjacent cell in
        // WebKit. The DOM cell that received the click bounds the destination.
        const $inside = view.state.doc.resolve(view.posAtDOM(clickedCell, 0));
        let cellPosition;
        for (let depth = $inside.depth; depth > 0; depth--) {
          if (
            ['cell', 'header_cell'].includes(
              $inside.node(depth).type.spec.tableRole
            )
          ) {
            cellPosition = $inside.before(depth);
            break;
          }
        }
        if (cellPosition == null) return false;
        const at = cellContext({ selection });
        if (!at || at.start + at.offset !== cellPosition) {
          const paragraph = event.target.closest('p');
          selection =
            paragraph && clickedCell.contains(paragraph)
              ? TextSelection.near(
                  view.state.doc.resolve(
                    view.posAtDOM(paragraph, paragraph.childNodes.length)
                  ),
                  -1
                )
              : cellEnd(view.state.doc, cellPosition);
        }
        if (!cellContext({ selection })) return false;
        view.dispatch(
          view.state.tr.setSelection(selection).setMeta('addToHistory', false)
        );
        view.focus();
        return true;
      },
      handleTripleClick(view, pos, event) {
        if (
          event.button !== 0 ||
          event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return false;
        const handled = selectCellText(
          view.state,
          (tr) => view.dispatch(tr),
          pos
        );
        if (handled) view.focus();
        return handled;
      },
      attributes(state) {
        return {
          'data-table-mode':
            state.selection instanceof CellSelection ? 'selection' : 'editing',
        };
      },
      decorations(state) {
        const at = cellContext(state);
        if (!at) return null;
        const pos = at.start + at.offset;
        return DecorationSet.create(state.doc, [
          Decoration.node(pos, pos + state.doc.nodeAt(pos).nodeSize, {
            class: 'active-table-cell',
          }),
        ]);
      },
    },
  });
}
