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

import { IndentEndAnchorWidget } from './IndentEndAnchorWidget';

/**
 * Generic leading-whitespace representation — independent of, and
 * composable with, every Markdown-construct decoration in this codebase
 * (blockquote, list, code). For every physical line, walks its leading
 * whitespace and wraps each complete indentation *token* in its own
 * `Decoration.mark({ class: 'cm-indent' })`:
 *
 * - A run of exactly `state.facet(indentUnit).length` consecutive space
 *   characters is one token — same character-count grouping this file
 *   has always used for spaces. `indentUnit` is read fresh from the
 *   facet on every rebuild, never hardcoded, so a future 3- or 4-space
 *   `indentUnit` reshapes the grouping automatically.
 * - A single tab character is always its own token, on its own, always
 *   exactly one `.cm-indent` span — regardless of `indentUnit`'s length
 *   and regardless of `state.tabSize`. `"\t\t"` is two separate marks,
 *   never one; a tab is never treated as "worth" more than one
 *   indentation token no matter how wide `tabSize` would otherwise
 *   render it. This is a deliberate, permanent asymmetry from the space
 *   grouping above: spaces need `unitLength` of them to form one token
 *   because each space is visually one column; a tab is already one
 *   indentation keystroke's worth of token by itself.
 *
 * Visual token width is controlled by `.cm-indent`'s own fixed CSS box
 * (`MarkdownEditor.css`: `display: inline-block; width: 20px`), the same
 * 20px for every token — space-run or tab alike. `tab-size` is not what
 * equalizes the two anymore; the fixed box already does that
 * unconditionally, regardless of what's inside it.
 *
 * What `tab-size` still does, inside that fixed box: CM6 itself renders
 * tab characters using the plain CSS `tab-size` property, applied as an
 * inline style on `.cm-content` (see `@codemirror/view`'s
 * `EditorView.updateAttrs`, `style: "tab-size: " + state.tabSize`) —
 * ordinary native browser tab rendering, nothing CM6-specific. Because
 * `tab-size` is an inherited CSS property whose *used* value for a given
 * tab character is resolved from the nearest enclosing element's computed
 * style, a `Decoration.mark` wrapping one tab can carry its own
 * `tab-size` override that wins over the editor-wide value for just that
 * character — without touching `state.tabSize` (which stays whatever it
 * is; `countColumn`, cursor math, `indentLess`/`indentMore` etc. are all
 * unaffected) and without replacing, hiding, or measuring the character.
 * Overriding it to `indentUnit.length` (a small number, e.g. 2) rather
 * than leaving it at the inherited `state.tabSize` (e.g. 4) keeps the
 * tab's own *internal* rendered glyph narrow relative to the 20px box —
 * confirmed by direct browser measurement: ~9px glyph width with this
 * override vs. ~18px without it, both uniform regardless of what precedes
 * the tab on the line (a side effect of `.cm-indent` being
 * `inline-block`, which resets tab-stop computation to each mark's own
 * box rather than the line's absolute column — without it, a bare tab's
 * native width is position-dependent). That narrower glyph leaves real
 * margin against the fixed box's edge (`.cm-indent` declares no
 * `overflow`, so a glyph wider than 20px would visually spill into the
 * next character) and is what CM6's own inherited default value (`~18px`
 * at `tab-size: 4`) does not reliably provide.
 *
 * Remainder handling, unchanged in spirit: only complete tokens are
 * decorated. An incomplete trailing run of spaces (shorter than
 * `unitLength`) stays ordinary text — this now applies per contiguous
 * space run between tabs, not just at the very end of the leading
 * whitespace, since a tab always starts a fresh run rather than
 * completing or absorbing a preceding partial one.
 *
 * Otherwise unchanged from prior versions of this file:
 * - No syntax-tree lookup, no construct/ancestor check.
 * - `Decoration.mark`, not `Decoration.replace`, for every indent token —
 *   every leading whitespace character stays in the rendered DOM, at its
 *   own native width (spaces) or its `tab-size`-overridden width (tabs).
 *   Nothing is replaced or hidden.
 * - `state.doc` is never touched. Tabs are never normalized to spaces,
 *   or vice versa; `indentUnit` and `tabSize` are only ever read.
 * - No `data-*` metadata — a decoration range already fully represents
 *   what it covers; there's nothing further to encode.
 * - Rebuilt purely from `state.doc` and `indentUnit` on every
 *   `docChanged`/`viewportChanged`.
 *
 * One addition on top of the marks: `INDENT_END_ANCHOR`, a zero-width
 * `Decoration.widget` (`IndentEndAnchorWidget`) added immediately after
 * the last `.cm-indent` mark on a line, but only when that mark's own end
 * position is the line's last position — i.e. the line's content ends
 * exactly at a complete indent token, with no real content and no
 * unmarked trailing partial-run remainder after it. This exists purely to
 * fix CM6's caret *measurement* (`coordsAtPos`) for that one case, not to
 * change what's rendered or stored — see `IndentEndAnchorWidget`'s own
 * doc comment for the full mechanism.
 */

const SPACE_INDENT_MARK = Decoration.mark({ class: 'cm-indent' });
// `side: -1`, not `1`: @codemirror/view's own `resolveInline` (the
// function `coordsAtPos` resolves through) only ever considers a widget
// for the query's "after"-position slot when its decoration has
// `side > 0`; `side <= 0` puts it in the "before"-position slot instead
// -- and `before` beats a same-position widget carrying `after` whenever
// the query itself is a backward-affinity one (`side < 0`), which is
// exactly what native Backspace/ArrowLeft leave the selection with
// (`range.assoc === -1`). A `side: 1` anchor therefore only fixed the
// caret for a *forward*-affinity query (e.g. fresh Enter) and silently
// reverted to the old glyph-measured position for a backward one (e.g.
// Backspace back down to a whitespace-only line) -- confirmed by direct
// measurement in the real app, not merely inferred. `side: -1` makes this
// widget win the "before" slot instead, which resolveInline prefers for
// backward queries directly and falls back to for forward queries too
// (since it then declines to ever claim the "after" slot) -- covering
// both selection affinities with one decoration.
const INDENT_END_ANCHOR = Decoration.widget({ widget: new IndentEndAnchorWidget(), side: -1 });

const tabIndentMarkCache = new Map<number, Decoration>();

/**
 * One `.cm-indent` mark for a single leading tab character, carrying a
 * `tab-size` override equal to `unitLength` (the current `indentUnit`'s
 * character count). The mark's *visual token width* comes from
 * `.cm-indent`'s fixed CSS box, not from this — this override instead
 * keeps the tab's own internal glyph narrow and position-independent
 * inside that box; see the file doc comment above for the measured
 * detail and why this doesn't touch `state.tabSize`. Cached per
 * `unitLength` since that's the only thing that varies its attributes.
 */
function tabIndentMark(unitLength: number): Decoration {
  let mark = tabIndentMarkCache.get(unitLength);
  if (!mark) {
    mark = Decoration.mark({
      class: 'cm-indent',
      attributes: { style: `tab-size: ${unitLength}; -moz-tab-size: ${unitLength}` },
    });
    tabIndentMarkCache.set(unitLength, mark);
  }
  return mark;
}

function leadingWhitespaceLength(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

/**
 * Emits `.cm-indent` marks for one physical line's leading whitespace.
 * Walks character by character: a tab is immediately emitted as its own
 * one-character mark (discarding, unmarked, any incomplete space run
 * accumulated just before it); a run of spaces is emitted as a mark the
 * moment it reaches `unitLength` characters, then a new run starts.
 *
 * Returns the document position immediately after the last mark emitted
 * (or `null` if none were), so the caller can tell whether the line's
 * content ends exactly at a complete indent token — the one case
 * `INDENT_END_ANCHOR` needs to cover; see its doc comment on `buildDecorations`.
 */
function emitLineIndentMarks(
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  lineText: string,
  leadingLength: number,
  unitLength: number
): number | null {
  let offset = 0;
  let spaceRunStart = 0;
  let lastMarkEnd: number | null = null;

  while (offset < leadingLength) {
    if (lineText.charCodeAt(offset) === 9) {
      const from = lineFrom + offset;
      const to = from + 1;
      builder.add(from, to, tabIndentMark(unitLength));
      lastMarkEnd = to;
      offset += 1;
      spaceRunStart = offset;
      continue;
    }

    offset += 1;
    if (offset - spaceRunStart === unitLength) {
      const from = lineFrom + spaceRunStart;
      const to = lineFrom + offset;
      builder.add(from, to, SPACE_INDENT_MARK);
      lastMarkEnd = to;
      spaceRunStart = offset;
    }
  }

  return lastMarkEnd;
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
        const lastMarkEnd = emitLineIndentMarks(builder, line.from, line.text, leadingLength, unitLength);

        // Caret-geometry anchor (IndentEndAnchorWidget's doc comment has the
        // full mechanism): only when the line's last character is itself
        // part of a complete, marked indent token -- i.e. line.to sits
        // exactly at the last mark's end, with nothing (no real content, no
        // unmarked trailing partial-run remainder) between them. Real
        // content after the indentation already measures correctly against
        // its own text node; an unmarked trailing partial run (e.g. one
        // stray space short of a full unit) is ordinary text that already
        // measures correctly too -- the anchor is only needed, and only
        // added, where a `.cm-indent` mark's own widened box would
        // otherwise be the last thing on the line.
        if (lastMarkEnd === line.to) {
          builder.add(lastMarkEnd, lastMarkEnd, INDENT_END_ANCHOR);
        }
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
