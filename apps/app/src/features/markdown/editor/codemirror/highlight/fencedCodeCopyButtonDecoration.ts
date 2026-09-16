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
import type { SyntaxNode } from '@lezer/common';

import { FencedCodeCopyButtonWidget } from '../fencedCode/FencedCodeCopyButtonWidget';

/**
 * Inserts (never replaces) a Copy-to-clipboard control at the end of a
 * `FencedCode` node's opening line — the same `Decoration.widget({widget,
 * side: 1}).range(pos)` insertion mechanism `imageLivePreview.ts`/
 * `embedLivePreview.ts` already use for auxiliary UI attached to real
 * content, not a wrapper around anything. `side: 1` (associate with the
 * position *after* it) matches those call sites' own convention for a
 * trailing control.
 *
 * Positioned at `CodeInfo.to` when present, else the opening `CodeMark`'s
 * own end — always the true end of whatever's actually on that first
 * line, so the button never floats in front of the language text. CSS
 * (`MarkdownEditor.css`) then pulls it out of that inline position via
 * `position: absolute`, scoped to the first `.cm-code-block-line`'s own
 * `position: relative` — the same escape-hatch technique
 * `blockquoteLineDecoration.ts`'s own `::before` bar already uses to
 * render as a full-width visual element without needing a wrapper.
 *
 * Renders unconditionally, regardless of engagement — deliberately not
 * routed through `isTokenEngaged`/`fencedCodeMarkerDecoration.ts` at all:
 * a Copy control is persistent block chrome (same category as
 * `fencedCodeBlockLineDecoration.ts`'s own background/border, which is
 * equally engagement-independent), not a reveal-on-engagement construct.
 *
 * The clipboard payload is read lazily, at click time
 * (`FencedCodeCopyButtonWidget`'s own `getCode` closure) from *this*
 * `FencedCode` node's `CodeText` child — already one contiguous node
 * spanning the block's entire body including internal newlines
 * (confirmed during the `codeLanguages` investigation:
 * `@lezer/markdown`'s own `addCodeText` merges every line's content into
 * one node), so a single `state.sliceDoc(codeText.from, codeText.to)`
 * is exactly the code content with no fence, no info string, and no
 * trailing newline before the closing fence ever able to leak in — never
 * a second, hand-rolled line-joining pass. An empty fenced block (no
 * `CodeText` child at all) copies the empty string, not an error.
 *
 * `getCode` re-resolves the enclosing `FencedCode` fresh from
 * `fencedCodeFrom` at click time (`nearestFencedCodeFrom`, walking up from
 * a resolved position rather than trusting any previously-captured node)
 * rather than closing over a captured `CodeText` range — deliberately:
 * `FencedCodeCopyButtonWidget.eq()` only compares `fencedCodeFrom`, so an
 * edit that grows/shrinks the code body without moving the block's own
 * start (typing more code — the common case) reuses the *old* widget
 * instance and its *old* closure (CM6 skips `toDOM()` when `eq()` says
 * equivalent). A closure that had captured `CodeText`'s span at
 * construction time would silently copy stale, pre-edit content in that
 * case; re-resolving from the stable anchor position instead always
 * reflects whatever the document actually contains at the moment of the
 * click.
 */
function nearestFencedCodeFrom(view: EditorView, fencedCodeFrom: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(fencedCodeFrom + 1, 1);
  for (; node; node = node.parent) {
    if (node.name === 'FencedCode' && node.from === fencedCodeFrom) {
      return node;
    }
  }
  return null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: { pos: number; widget: FencedCodeCopyButtonWidget }[] = [];
  // A fold splits `view.visibleRanges` into multiple entries, and a
  // `FencedCode` node that starts before the fold spans both of them —
  // `syntaxTree(...).iterate()` re-enters the same node once per
  // overlapping range, so without this guard a folded block got two Copy
  // buttons instead of one (confirmed live). Same guard
  // `fencedCodeBackgroundLayer.ts`'s own `buildMarkers` already has for
  // the identical reason.
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
        const fencedCodeFrom = node.from;

        ranges.push({
          pos,
          widget: new FencedCodeCopyButtonWidget(fencedCodeFrom, () => {
            const codeText = nearestFencedCodeFrom(view, fencedCodeFrom)?.getChild('CodeText');
            return codeText ? view.state.sliceDoc(codeText.from, codeText.to) : '';
          }),
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

interface FencedCodeCopyButtonPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function fencedCodeCopyButtonDecoration(): Extension {
  return ViewPlugin.fromClass<FencedCodeCopyButtonPlugin>(
    class implements FencedCodeCopyButtonPlugin {
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
