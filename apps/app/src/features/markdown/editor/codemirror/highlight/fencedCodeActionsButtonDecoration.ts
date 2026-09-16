import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

import {
  FencedCodeActionsButtonWidget,
  type OnOpenFencedCodeMenu,
} from '../fencedCode/FencedCodeActionsButtonWidget';

/**
 * Inserts the "More actions" trigger button alongside Copy and Format —
 * same `Decoration.widget({widget, side: 1}).range(pos)` mechanism, same
 * insertion point, same tree-walk shape as
 * `fencedCodeCopyButtonDecoration.ts`/`fencedCodeFormatButtonDecoration.ts`.
 * Unconditional (every fenced block gets this button, like Copy — unlike
 * Format, which only appears for a formattable language): the menu it
 * opens currently holds only Remove, which applies to every language.
 */
function buildDecorations(
  view: EditorView,
  getOnOpenFencedCodeMenu: () => OnOpenFencedCodeMenu | undefined
): DecorationSet {
  const ranges: { pos: number; widget: FencedCodeActionsButtonWidget }[] = [];
  // See `fencedCodeCopyButtonDecoration.ts`'s identical guard: a fold
  // splits `view.visibleRanges`, and a `FencedCode` node starting before
  // the fold otherwise gets visited (and so decorated) once per
  // overlapping range.
  const seen = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode' || seen.has(node.from)) {
          return;
        }
        seen.add(node.from);

        const openMark = node.node.firstChild;
        if (!openMark || openMark.name !== 'CodeMark') {
          return;
        }

        const codeInfo = node.node.getChild('CodeInfo');
        const pos = codeInfo ? codeInfo.to : openMark.to;

        ranges.push({
          pos,
          widget: new FencedCodeActionsButtonWidget(node.from, node.to, getOnOpenFencedCodeMenu),
        });
      },
    });
  }

  return Decoration.set(
    ranges
      .map(({ pos, widget }) => Decoration.widget({ widget, side: 1 }).range(pos))
      .sort((a, b) => a.from - b.from)
  );
}

interface FencedCodeActionsButtonPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function fencedCodeActionsButtonDecoration(
  getOnOpenFencedCodeMenu: () => OnOpenFencedCodeMenu | undefined
): Extension {
  return ViewPlugin.fromClass<FencedCodeActionsButtonPlugin>(
    class implements FencedCodeActionsButtonPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getOnOpenFencedCodeMenu);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, getOnOpenFencedCodeMenu);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
