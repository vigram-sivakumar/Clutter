import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { embedPasted, type PasteAssets } from './assetPaste';
import { classifyPaste } from './pasteClassification';

/** The root document owns ordinary paste. Table cell and range events
 * are consumed by the engine's projection before they reach this handler.
 * No fallback table writer or second clipboard classification.
 */
export function pasteRouting(getPasteAssets: () => PasteAssets | undefined): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data || event.defaultPrevented) return false;
      const assets = getPasteAssets();
      const result = classifyPaste(data, { state: view.state, canEmbed: assets !== undefined });
      if (result.skipped) assets?.onSkipped?.(result.skipped.names, result.skipped.reason);
      let handled = false;
      switch (result.strategy) {
        case 'tableCreate':
          if (result.table) view.plugin(tableCellEditor)?.pasteNewTable(result.table.grid);
          // A declined table transaction must never fall through to a
          // different source writer.
          handled = true;
          break;
        case 'files':
        case 'richHtml':
          handled = assets !== undefined && embedPasted(view, assets, result);
          break;
        case 'empty':
          handled = true;
          break;
        case 'default':
          break;
      }
      if (handled) event.preventDefault();
      return handled;
    },
  });
}
