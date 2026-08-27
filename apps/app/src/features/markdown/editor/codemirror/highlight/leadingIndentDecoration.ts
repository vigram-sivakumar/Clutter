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
 * - `Decoration.mark`, not `Decoration.replace` — every leading
 *   whitespace character stays in the rendered DOM, at its own native
 *   width (spaces) or its `tab-size`-overridden width (tabs). Nothing is
 *   replaced or hidden; no widgets.
 * - `state.doc` is never touched. Tabs are never normalized to spaces,
 *   or vice versa; `indentUnit` and `tabSize` are only ever read.
 * - No `data-*` metadata — a decoration range already fully represents
 *   what it covers; there's nothing further to encode.
 * - Rebuilt purely from `state.doc` and `indentUnit` on every
 *   `docChanged`/`viewportChanged`.
 */

const SPACE_INDENT_MARK = Decoration.mark({ class: 'cm-indent' });

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
 */
function emitLineIndentMarks(
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
      builder.add(from, to, tabIndentMark(unitLength));
      offset += 1;
      spaceRunStart = offset;
      continue;
    }

    offset += 1;
    if (offset - spaceRunStart === unitLength) {
      const from = lineFrom + spaceRunStart;
      const to = lineFrom + offset;
      builder.add(from, to, SPACE_INDENT_MARK);
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
        emitLineIndentMarks(builder, line.from, line.text, leadingLength, unitLength);
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
