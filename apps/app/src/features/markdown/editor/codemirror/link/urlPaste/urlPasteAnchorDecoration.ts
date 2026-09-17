import type { Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';

import { getUrlPasteEntries } from './urlPasteChoiceState';
import { UrlPasteAnchorWidget, type OnOpenUrlPasteMenu } from './UrlPasteAnchorWidget';

/**
 * Inserts the invisible menu-anchor widget at every `'pending'`
 * `urlPasteChoiceField` entry's own end position — same
 * `Decoration.widget({widget, side: 1}).range(pos)` shape as
 * `fencedCodeActionsButtonDecoration.ts`, reading the state field's
 * `RangeSet` directly rather than re-walking the syntax tree, since the
 * field is already the authoritative source of "which occurrences are
 * currently awaiting a menu choice."
 */
function buildDecorations(getOnOpenUrlPasteMenu: () => OnOpenUrlPasteMenu | undefined, view: EditorView): DecorationSet {
  const ranges = getUrlPasteEntries(view.state).map((entry) =>
    Decoration.widget({ widget: new UrlPasteAnchorWidget(entry.id, getOnOpenUrlPasteMenu), side: 1 }).range(entry.to)
  );
  return Decoration.set(ranges.sort((a, b) => a.from - b.from));
}

interface UrlPasteAnchorPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function urlPasteAnchorDecoration(getOnOpenUrlPasteMenu: () => OnOpenUrlPasteMenu | undefined): Extension {
  return ViewPlugin.fromClass<UrlPasteAnchorPlugin>(
    class implements UrlPasteAnchorPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(getOnOpenUrlPasteMenu, view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.transactions.length > 0) {
          this.decorations = buildDecorations(getOnOpenUrlPasteMenu, update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
