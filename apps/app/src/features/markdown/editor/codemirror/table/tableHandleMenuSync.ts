import type { EditorView } from '@codemirror/view';

import { tableCellEditor } from '../table-engine/tableCellEditor';

export type TableHandleMenuSelection =
  | { readonly kind: 'row'; readonly tableFrom: number; readonly rowIndex: number }
  | { readonly kind: 'column'; readonly tableFrom: number; readonly columnIndex: number };

export interface OpenTableHandleMenuParams {
  readonly selection: TableHandleMenuSelection;
}

/** Resolve the physical handle from the current TableSelection and live editor DOM. */
export function resolveTableHandleMenuAnchor(
  view: EditorView | null,
  requestedSelection: TableHandleMenuSelection | null
): HTMLElement | null {
  if (!view || !requestedSelection || !view.dom.isConnected) {
    return null;
  }

  const engineWidget = view.dom.querySelector(`[data-table-engine-cells="true"][data-table-from="${requestedSelection.tableFrom}"]`);
  if (!engineWidget) return null;
  const currentSelection = view.plugin(tableCellEditor)?.currentAxisSelection() ?? null;
  if (!currentSelection || currentSelection.tableFrom !== requestedSelection.tableFrom) {
    return null;
  }

  let tableFrom: number;
  if (requestedSelection.kind === 'row') {
    if (currentSelection.kind !== 'row' || currentSelection.rowIndex !== requestedSelection.rowIndex) {
      return null;
    }
    tableFrom = currentSelection.tableFrom;
  } else {
    if (currentSelection.kind !== 'column' || currentSelection.columnIndex !== requestedSelection.columnIndex) {
      return null;
    }
    tableFrom = currentSelection.tableFrom;
  }

  // tableFrom is read from current state, not the pointer event's snapshot,
  // because CodeMirror maps it when edits occur above the table.
  const widget = view.dom.querySelector<HTMLElement>(
    `.cm-table-widget[data-table-from="${tableFrom}"]`
  );
  const table = widget?.querySelector<HTMLTableElement>(
    '.cm-table-wrapper > .cm-table-scroll table'
  );
  const cell =
    requestedSelection.kind === 'column'
      ? table?.rows[0]?.cells[requestedSelection.columnIndex]
      : table?.rows[requestedSelection.rowIndex]?.cells[0];
  const handleClass =
    requestedSelection.kind === 'column'
      ? '.cm-table-column-handle'
      : '.cm-table-row-handle';
  const anchor = cell?.querySelector<HTMLElement>(`:scope > ${handleClass}`) ?? null;

  return anchor?.isConnected && view.dom.contains(anchor) ? anchor : null;
}

/**
 * `null` closes the menu — a single callback rather than a separate
 * open/close pair, mirroring the single `TableSelection | null` field it
 * tracks: there is exactly one "current table handle menu state," same as
 * there is exactly one current `TableSelection`.
 */
export type OnTableHandleMenuChange = (params: OpenTableHandleMenuParams | null) => void;

export const TABLE_HANDLE_MENU_CLASS = 'cm-table-handle-menu';
