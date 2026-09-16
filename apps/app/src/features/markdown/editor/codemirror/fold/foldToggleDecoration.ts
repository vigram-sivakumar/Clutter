import { foldState, syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';

import { nearestFencedCode } from '../highlight/fencedCodeBlockLineDecoration';
import { findFold, getFoldRange, resolveHeadingFoldClass } from './foldSemantics';
import { FoldToggleWidget } from './FoldToggleWidget';

/**
 * Resolves the *current* fold/foldable range for the line starting at
 * `linePos`, at whatever moment this is called — never from a value
 * captured earlier. Shared by both decoration placement (below) and
 * `FoldToggleWidget`'s own click handler, so "is this line an owner" and
 * "what does clicking it actually fold/unfold" can never disagree — both
 * questions are answered by `foldSemantics.ts`'s single authority.
 */
function resolveFoldToggleRange(view: EditorView, linePos: number): { from: number; to: number } | null {
  const line = view.state.doc.lineAt(Math.min(linePos, view.state.doc.length));
  const folded = findFold(view.state, line.from, line.to);
  if (folded) {
    return folded;
  }
  // Same `getFoldRange` query as `buildFoldToggleDecorations` —
  // belt-and-suspenders against a click racing a decoration rebuild
  // (e.g. an edit lands between this widget's construction and the
  // user's click): never fold an out-of-scope/non-qualifying line even
  // if a stale toggle briefly remained.
  return getFoldRange(view.state, line);
}

/**
 * Replaces `@codemirror/language`'s own `foldGutter()` UI (a separate
 * `.cm-gutters` column) with an inline, per-line toggle — see
 * `FoldToggleWidget.ts`'s own doc comment for the full division of labor.
 * Mirrors `foldGutter()`'s own reference algorithm line for line (confirmed
 * against the installed source): for every visible line, an existing fold
 * wins over a fresh ownership query, and a line with neither gets no
 * decoration at all. All fold-range computation lives in `foldSemantics.ts`
 * — this file is UI only (deciding where to place a toggle and reacting to
 * clicks), never a second place that decides what's foldable.
 */
function buildFoldToggleDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.viewportLineBlocks) {
    const line = view.state.doc.lineAt(from);
    const folded = findFold(view.state, from, to);
    const ownedRange = folded ?? getFoldRange(view.state, line);
    if (!ownedRange) {
      continue;
    }
    const headingFoldClass = resolveHeadingFoldClass(view.state, line.from);
    const fencedCodeOwner = nearestFencedCode(view.state, line.from);
    const isFencedCodeOwner = fencedCodeOwner !== null && fencedCodeOwner.from === line.from;
    ranges.push(
      Decoration.widget({
        widget: new FoldToggleWidget(
          from,
          !!folded,
          resolveFoldToggleRange,
          headingFoldClass,
          isFencedCodeOwner
        ),
        side: -1,
      }).range(from)
    );
  }

  return Decoration.set(ranges);
}

interface FoldToggleDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * The one production entry point — wired in `createEditorView.ts` in the
 * exact spot `foldGutter()` previously occupied, under the same `readOnly`
 * gate `codeFolding()` already uses (a note embed's nested view stays fully
 * expanded and unfoldable, per that gate's own doc comment — unchanged by
 * this replacement).
 */
export function foldToggleDecoration(): Extension {
  return ViewPlugin.fromClass<FoldToggleDecorationPlugin>(
    class implements FoldToggleDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildFoldToggleDecorations(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.startState.field(foldState, false) !== update.state.field(foldState, false) ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = buildFoldToggleDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
