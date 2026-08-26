import { indentUnit } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Generic leading-whitespace representation — independent of, and
 * composable with, every Markdown-construct decoration in this codebase
 * (blockquote, list, code). For every physical line, chunks its leading
 * whitespace run into groups of `state.facet(indentUnit).length`
 * characters — CM6's own actual, currently-configured indent-unit width,
 * read fresh from the facet, never hardcoded — and wraps each group in
 * its own `Decoration.mark({ class: 'cm-indent' })`.
 *
 * One `.cm-indent` span represents one current CM6 indent unit, not one
 * character and not one Tab action. With the unconfigured default
 * (`indentUnit` = two spaces), 2 leading spaces is 1 span; 4 leading
 * spaces is 2 spans. If `indentUnit` is ever reconfigured (e.g. to four
 * spaces), this decoration follows automatically — it re-reads the facet
 * on every rebuild rather than assuming any fixed width.
 *
 * Remainder handling, decided explicitly: groups are formed left to
 * right; a leftover run shorter than a full unit (e.g. 3 leading spaces
 * with a 2-character unit — one full 2-character group plus a 1-character
 * remainder) still gets its own `.cm-indent` span, sized to whatever is
 * actually left. Every leading whitespace character ends up inside some
 * `.cm-indent` span — none are ever left unwrapped — chunking is purely
 * left-to-right because that direction doesn't require knowing the run's
 * total length up front. This is a raw-character-count grouping
 * (`unit.length`), not a `tabSize`-aware column computation — Clutter's
 * current `indentUnit` contains no tabs, so this is the direct, literal
 * reading of "one unit's worth of characters"; a leading run that itself
 * mixes tabs and spaces is a separate question this decoration does not
 * yet address.
 *
 * Otherwise unchanged from the per-character version this replaces:
 * - No syntax-tree lookup, no construct/ancestor check — the Markdown
 *   construct a line belongs to never determines whether its leading
 *   whitespace gets wrapped.
 * - `Decoration.mark`, not `Decoration.replace` — the real whitespace
 *   characters stay in the rendered DOM, at their own native width. Only
 *   a class is added; nothing is replaced, hidden, or measured.
 * - `state.doc` is never touched.
 * - Rebuilt purely from `state.doc` (now also `indentUnit`, itself just
 *   part of `state`) on every `docChanged`/`viewportChanged`. Because
 *   grouping is a pure function of the current leading-whitespace
 *   character count and the current `indentUnit` width — never of which
 *   edit produced either — identical resulting text under identical
 *   configuration always renders identically, regardless of whether it
 *   arrived via Tab, Shift-Tab, typing, paste, Enter inheriting
 *   indentation, or Backspace/Delete leaving a partial run.
 */
const INDENT_MARK = Decoration.mark({ class: 'cm-indent' });

function leadingWhitespaceLength(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // Guarded against a pathological zero-length facet value; CM6's own
  // indentUnit combine() already throws on an empty/invalid unit, so this
  // is a defensive floor, not an expected case.
  const unitLength = Math.max(1, view.state.facet(indentUnit).length);

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const leadingLength = leadingWhitespaceLength(line.text);

      for (let groupStart = 0; groupStart < leadingLength; groupStart += unitLength) {
        const groupEnd = Math.min(groupStart + unitLength, leadingLength);
        builder.add(line.from + groupStart, line.from + groupEnd, INDENT_MARK);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

interface LeadingIndentPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function leadingIndentDecoration(): Extension {
  return ViewPlugin.fromClass<LeadingIndentPlugin>(
    class implements LeadingIndentPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
