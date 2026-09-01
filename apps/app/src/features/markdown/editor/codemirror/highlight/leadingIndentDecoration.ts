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
import { getIndentLevelPx, getIndentSpacePx } from '../../../../../design-system/markdownIndent';

/** Clutter's indentation model: 4 spaces per indentation level.
 *
 * Leading spaces and tabs are rendered at widths derived from the
 * `--md-indent` CSS custom property in the design token system:
 * - One tab = one full indentation level (getIndentLevelPx())
 * - One space = one quarter of an indentation level (getIndentSpacePx())
 *
 * This is a pure rendering calibration, not an indentation-behavior
 * change: the Spacebar remains completely literal (typing N spaces
 * always produces exactly N space characters in `state.doc`, never
 * rounded, completed, or normalized to a multiple of 4) — only how many
 * pixels each already-existing character occupies on screen changes here.
 * See design-system/markdownIndent.ts for token resolution details. */

/**
 * Generic leading-whitespace representation — independent of, and
 * composable with, every Markdown-construct decoration in this codebase
 * (blockquote, list, code). For every physical line, walks its leading
 * whitespace and replaces each individual character — space or tab —
 * with its own `Decoration.replace({ widget: new IndentTokenWidget(px) })`:
 * one document character, one visual widget, always. There is no
 * grouping of multiple characters into a single wider token (this file's
 * approach through 2026-08-28 — grouped 2-space runs into one token, with
 * `WidgetType.coordsAt` interpolating the internal logical positions
 * inside it; see git history). Per-character replacement makes that
 * unnecessary: every logical position already has its own real DOM node,
 * so CM6's own `coordsAtPos`/`posAtCoords` resolve it correctly without
 * any custom coordinate override, and there is no "complete token"
 * concept left to have a "no complete unit yet" exception for — a lone
 * space that isn't part of a larger run still gets its own real
 * space-width widget (derived from `--md-indent`), exactly like every other space.
 *
 * Why `Decoration.replace`, not `Decoration.mark`: CM6 maps screen
 * coordinates to/from document positions — `coordsAtPos` (caret
 * placement) and `posAtCoords` (mouse hit-testing) — by measuring a
 * `Decoration.mark`'s wrapped text via a DOM `Range` over the *real
 * characters*, never the mark span's own CSS box (`TextTile.coordsIn` /
 * `InlineCoordsScan.scanText` in `@codemirror/view`). A mark widened past
 * its text's natural glyph width desyncs from that in both directions —
 * confirmed by direct measurement. `Decoration.replace`'s widget is
 * measured by *both* `coordsAtPos` and `posAtCoords` via the widget's own
 * DOM element's box, so there is no second, narrower coordinate system
 * for either to fall out of sync with. See `IndentTokenWidget`'s own doc
 * comment for the full mechanism.
 *
 * Otherwise unchanged from prior versions of this file:
 * - No syntax-tree lookup, no construct/ancestor check.
 * - `state.doc` is never touched. Tabs are never normalized to spaces, or
 *   vice versa. `Decoration.replace` hides the DOM for its range, not the
 *   underlying document text — every leading whitespace character stays
 *   exactly where it is in `state.doc`; only what's rendered for it
 *   changes. CM6 does not make a replaced character atomic for cursor
 *   movement on its own (confirmed directly: stepping ArrowLeft/
 *   ArrowRight through leading whitespace still visits every character
 *   position one at a time) — only an explicit `EditorView.atomicRanges`
 *   facet entry would do that, and none is registered here.
 * - No `data-*` metadata — a decoration range already fully represents
 *   what it covers; there's nothing further to encode.
 * - Rendering is derived purely from `state.doc`'s actual leading
 *   whitespace characters, never from which keyboard command produced
 *   them — a pasted, typed, or programmatically inserted space or tab
 *   renders identically.
 * - Rebuilt purely from `state.doc` on every `docChanged`/`viewportChanged`.
 */

/**
 * Deliberately NOT a shared module-level constant. Confirmed by an
 * isolated repro, not assumed: reusing the exact same
 * `Decoration.replace(...)` *value* across multiple
 * `RangeSetBuilder.add()` calls makes `@codemirror/view`'s DOM
 * reconciliation treat those ranges as interchangeable by reference,
 * bypassing `IndentTokenWidget.eq()` entirely -- when an edit shrinks the
 * whitespace-character count on a line, the rendered DOM can keep a
 * stale extra widget even though the returned `DecorationSet` is
 * verified correct. A fresh `Decoration.replace(...)` per character
 * (still sharing nothing but the `IndentTokenWidget` class) removes the
 * false positive. The allocation cost is negligible: this runs once per
 * leading whitespace character per `docChanged`/`viewportChanged`
 * rebuild, not per render frame.
 */
function indentCharDecoration(px: number): Decoration {
  return Decoration.replace({ widget: new IndentTokenWidget(px) });
}

function leadingWhitespaceLength(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

/**
 * Replaces one physical line's leading whitespace, one character at a
 * time -- a space becomes a `SPACE_PX`-wide widget (derived from
 * `--md-indent`), a tab becomes a `TAB_PX`-wide widget (derived from
 * `--md-indent`), unconditionally. No run-grouping, no minimum
 * length, no "complete unit" concept.
 */
function emitLineIndentReplacements(
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  lineText: string,
  leadingLength: number
): void {
  const indentLevelPx = getIndentLevelPx();
  const indentSpacePx = getIndentSpacePx();

  for (let offset = 0; offset < leadingLength; offset++) {
    const from = lineFrom + offset;
    const to = from + 1;
    const isTab = lineText.charCodeAt(offset) === 9;
    builder.add(from, to, indentCharDecoration(isTab ? indentLevelPx : indentSpacePx));
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const leadingLength = leadingWhitespaceLength(line.text);

      if (leadingLength > 0) {
        emitLineIndentReplacements(builder, line.from, line.text, leadingLength);
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
