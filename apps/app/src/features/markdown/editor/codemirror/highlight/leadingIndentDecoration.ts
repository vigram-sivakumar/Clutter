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

import { IndentTokenWidget } from './IndentTokenWidget';

/**
 * Generic leading-whitespace representation — independent of, and
 * composable with, every Markdown-construct decoration in this codebase
 * (blockquote, list, code). For every physical line, walks its leading
 * whitespace and replaces each complete indentation *token* with a
 * `Decoration.replace({ widget: new IndentTokenWidget() })`:
 *
 * - A run of exactly `state.facet(indentUnit).length` consecutive space
 *   characters is one token — same character-count grouping this file
 *   has always used. `indentUnit` is read fresh from the facet on every
 *   rebuild, never hardcoded, so a future 3- or 4-space `indentUnit`
 *   reshapes the grouping automatically.
 * - A single tab character is always its own token, on its own, always
 *   exactly one replaced range — regardless of `indentUnit`'s length.
 *   `"\t\t"` is two separate tokens, never one; a tab is never treated as
 *   "worth" more than one indentation token no matter how wide `tabSize`
 *   would otherwise render it. This is a deliberate, permanent asymmetry
 *   from the space grouping above: spaces need `unitLength` of them to
 *   form one token because each space is visually one column; a tab is
 *   already one indentation keystroke's worth of token by itself.
 *
 * Visual token width is `IndentTokenWidget`'s own fixed CSS box
 * (`MarkdownEditor.css`: `.cm-indent-token { width: var(--marker-width) }`),
 * the same width for every token — space-run or tab alike, since the
 * widget carries no text of its own for either kind. There is no
 * `tab-size` override to reason about any more (see below) — replacing
 * the token removes the tab glyph from the DOM entirely, rather than
 * rendering it narrow inside a wider box.
 *
 * Why `Decoration.replace`, not `Decoration.mark` (this file's approach
 * before 2026-08-28): CM6 maps screen coordinates to/from document
 * positions — `coordsAtPos` (caret placement) and `posAtCoords` (mouse
 * hit-testing) — by measuring a DOM `Range` over a mark's *real wrapped
 * text*, never the mark span's own CSS box (`TextTile.coordsIn` /
 * `InlineCoordsScan.scanText` in `@codemirror/view`). A mark visually
 * widened past its text's natural glyph width (exactly what `.cm-indent`
 * + `inline-block; width` did) desyncs from that measurement in both
 * directions: the caret could render inside a token instead of at its
 * edge, and — confirmed by direct measurement, not just inferred —
 * clicking within a token's visual box could resolve to a document
 * position before the click, not under it, across roughly the right 60-
 * 70% of every token. A `Decoration.widget` point-decoration anchor (this
 * file's interim fix) closed the gap for `coordsAtPos` only:
 * `@codemirror/view`'s own `scanTile` unconditionally excludes point
 * widgets from `posAtCoords`'s hit-testing candidates
 * (`flags & TileFlag.PointWidget`) — by design, not oversight, since a
 * widget decoration and a replace decoration carry different internal
 * flags (`Before`/`After` vs. `IncStart`/`IncEnd`) precisely because they
 * answer different questions. `Decoration.replace`'s widget, by contrast,
 * is measured by *both* `coordsAtPos` and `posAtCoords` via the same
 * mechanism — the widget's own DOM element's box — so there is no second,
 * narrower coordinate system for either direction to fall out of sync
 * with. See `IndentTokenWidget`'s own doc comment for the full mechanism
 * and measurements.
 *
 * Remainder handling, unchanged: only complete tokens are replaced. An
 * incomplete trailing run of spaces (shorter than `unitLength`) stays
 * ordinary text — this applies per contiguous space run between tabs,
 * not just at the very end of the leading whitespace, since a tab always
 * starts a fresh run rather than completing or absorbing a preceding
 * partial one.
 *
 * Otherwise unchanged from prior versions of this file:
 * - No syntax-tree lookup, no construct/ancestor check.
 * - `state.doc` is never touched. Tabs are never normalized to spaces,
 *   or vice versa; `indentUnit` is only ever read. `Decoration.replace`
 *   hides the DOM for its range, not the underlying document text —
 *   every leading whitespace character stays exactly where it is in
 *   `state.doc`; only what's rendered for it changes. CM6 does not make
 *   a replaced range atomic for cursor movement on its own (confirmed
 *   directly: stepping ArrowLeft/ArrowRight through a replaced token
 *   still visits every character position one at a time) — only an
 *   explicit `EditorView.atomicRanges` facet entry would do that, and
 *   none is registered here.
 * - No `data-*` metadata — a decoration range already fully represents
 *   what it covers; there's nothing further to encode.
 * - Rebuilt purely from `state.doc` and `indentUnit` on every
 *   `docChanged`/`viewportChanged`.
 */

/**
 * Deliberately NOT a shared module-level constant (unlike this file's
 * previous `Decoration.mark` singletons). Confirmed by an isolated
 * repro, not assumed: reusing the exact same `Decoration.replace(...)`
 * *value* across multiple `RangeSetBuilder.add()` calls makes
 * `@codemirror/view`'s DOM reconciliation treat those ranges as
 * interchangeable by reference, bypassing `IndentTokenWidget.eq()`
 * entirely -- when an edit shrinks the token count on a line, the
 * rendered DOM can keep a stale extra widget even though the returned
 * `DecorationSet` is verified correct. A fresh `Decoration.replace(...)`
 * per token (still sharing nothing but the `IndentTokenWidget` class)
 * removes the false positive. The allocation cost is negligible: this
 * runs once per token per `docChanged`/`viewportChanged` rebuild, not
 * per render frame.
 */
function indentTokenDecoration(length: number): Decoration {
  return Decoration.replace({ widget: new IndentTokenWidget(length) });
}

function leadingWhitespaceLength(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

/**
 * Replaces one physical line's leading whitespace, one complete
 * indentation token at a time. Walks character by character: a tab is
 * immediately replaced as its own one-character token (discarding,
 * unreplaced, any incomplete space run accumulated just before it); a
 * run of spaces is replaced as a token the moment it reaches
 * `unitLength` characters, then a new run starts.
 */
function emitLineIndentReplacements(
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  lineText: string,
  leadingLength: number,
  unitLength: number
): void {
  let offset = 0;
  let spaceRunStart = 0;

  while (offset < leadingLength) {
    if (lineText.charCodeAt(offset) === 9) {
      const from = lineFrom + offset;
      const to = from + 1;
      builder.add(from, to, indentTokenDecoration(1));
      offset += 1;
      spaceRunStart = offset;
      continue;
    }

    offset += 1;
    if (offset - spaceRunStart === unitLength) {
      const from = lineFrom + spaceRunStart;
      const to = lineFrom + offset;
      builder.add(from, to, indentTokenDecoration(unitLength));
      spaceRunStart = offset;
    }
  }
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

      if (leadingLength > 0) {
        emitLineIndentReplacements(builder, line.from, line.text, leadingLength, unitLength);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

interface LeadingIndentPlugin extends PluginValue {
  decorations: DecorationSet;
}

const leadingIndentDecorationPlugin = ViewPlugin.fromClass<LeadingIndentPlugin>(
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

export function leadingIndentDecoration(): Extension {
  return leadingIndentDecorationPlugin;
}
