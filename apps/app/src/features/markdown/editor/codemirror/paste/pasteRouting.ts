import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createTableFromClipboard } from '../table/tableCreatePaste';
import type { TableActiveCellController } from '../table/tableActiveCellController';
import { type PasteTarget, pasteIntoActiveCell, pasteIntoSelectedTableSelection, resolveActiveCellTarget } from '../table/tablePaste';
import { tableSelectionField } from '../table/tableSelection';
import { embedPasted, type PasteAssets } from './assetPaste';
import { classifyPaste, type PasteClassification } from './pasteClassification';

/**
 * Runs the strategy `classification` chose, and reports the files it leaves out — once. Returns whether the event is
 * consumed; `false` (the `default` strategy, or a strategy that found nothing to do) leaves it to CodeMirror's own paste.
 */
function run(
  classification: PasteClassification,
  event: ClipboardEvent,
  view: EditorView,
  assets: PasteAssets | undefined,
  cell?: { readonly controller: TableActiveCellController; readonly target: PasteTarget }
): boolean {
  const { strategy, table, skipped } = classification;

  if (skipped) {
    assets?.onSkipped?.(skipped.names, skipped.reason);
  }

  switch (strategy) {
    case 'tableRange': {
      const selection = view.state.field(tableSelectionField, false);
      return selection !== null && table !== null && pasteIntoSelectedTableSelection(view, selection, table);
    }
    case 'tableCreate':
      createTableFromClipboard(view, table!);
      return true;
    case 'files':
    case 'richHtml':
      return assets !== undefined && embedPasted(view, event.clipboardData!, assets, strategy);
    case 'tableCell':
      return cell !== undefined && table !== null && pasteIntoActiveCell(view, cell.controller, cell.target, table);
    case 'empty':
      return true;
    case 'default':
      return false;
  }
}

/**
 * The one paste handler of the root editor. Every paste is classified once (`classifyPaste`) and handed to exactly one
 * of the existing strategies — table range fill, table creation, file embed, rich-HTML conversion — or left to
 * CodeMirror's own paste. Nothing else in the editor registers a `paste` handler for the clipboard's content, so the
 * outcome never depends on registration order. (`urlPasteChoiceField` and the input filters observe the document change
 * the default paste makes; they do not take the event.)
 */
export function pasteRouting(getPasteAssets: () => PasteAssets | undefined): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data) {
        return false;
      }
      const assets = getPasteAssets();
      const handled = run(classifyPaste(data, { scope: 'root', state: view.state, canEmbed: assets !== undefined }), event, view, assets);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
  });
}

/**
 * The same for the nested editor of an active table cell (the paste event's target is that view, not the root): a grid
 * fills the table from the cell, files are reported as not added, an empty clipboard changes nothing, and anything else
 * is the cell editor's own paste (with its pipe-escaping input filter).
 */
export function cellPasteRouting(
  getRootView: () => EditorView,
  controller: TableActiveCellController,
  getPasteAssets: () => PasteAssets | undefined
): Extension {
  return EditorView.domEventHandlers({
    paste(event) {
      const data = event.clipboardData;
      if (!data) {
        return false;
      }
      const rootView = getRootView();
      const assets = getPasteAssets();
      const target = resolveActiveCellTarget(rootView, controller);
      const classification = classifyPaste(data, { scope: 'cell', state: rootView.state, canEmbed: assets !== undefined, cellActive: target !== null });

      const handled = run(classification, event, rootView, assets, target ? { controller, target } : undefined);
      if (handled) {
        event.preventDefault();
      }
      return handled;
    },
  });
}
