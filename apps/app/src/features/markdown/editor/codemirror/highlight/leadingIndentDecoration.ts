import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension, type EditorState } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Generic leading-whitespace-to-visual-indentation rendering for ordinary
 * paragraph/text content — deliberately independent of every other
 * Markdown-construct decoration in this codebase (blockquote, list,
 * code). Each leading whitespace character on a qualifying physical line
 * is individually replaced with a tiny, empty `<span class="cm-indent">`
 * widget — never a single wrapper for the whole run, and never nested
 * widgets — so the DOM is a flat sequence of sibling indent elements
 * immediately followed by the line's real text, matching the reveal
 * mechanism CM6 already uses for every other replaced-with-widget range
 * in this codebase (`Decoration.replace({ widget })`, one call per
 * replaced range).
 *
 * `state.doc` is never touched — this is rendering only. The original
 * whitespace characters remain exactly as typed/pasted/produced by any
 * editing operation; only their *visual* representation changes. Because
 * each replaced character no longer paints as ordinary text, there is no
 * double-counted width: the `.cm-indent` widget is the sole visual
 * contributor for that character's column, never additive with the
 * character's own native rendering (which no longer happens at all once
 * replaced).
 *
 * Rebuilt purely from `(state.doc, syntaxTree)` on every `docChanged`/
 * `viewportChanged`, exactly like every other decoration in this file
 * family — Tab, typed spaces, pasted whitespace, Enter inheriting
 * indentation, Backspace/Delete removing it, are all just edits that
 * change `state.doc`; none of them are inspected or special-cased here.
 * The same resulting document state always renders identically,
 * regardless of which sequence of edits produced it.
 *
 * Scope, deliberately narrow: a line's leading run is only ever replaced
 * when it resolves to a plain `Paragraph` with none of `Blockquote`,
 * `ListItem`, `BulletList`, `OrderedList`, `Table`, `FencedCode`, or
 * `CodeBlock` among its ancestors. This excludes, on purpose, every case
 * this pass is not meant to touch:
 * - indented code blocks (4+ leading spaces/a tab at a fresh block start)
 *   and fenced code — that whitespace is semantic content and must
 *   render and remain editable exactly as typed;
 * - blockquote and list leading whitespace — separate, already-decided
 *   concerns (`blockquoteMarkerDecoration.ts`, `blockquoteLineDecoration.ts`,
 *   `listMarkerDecoration.ts`, `listLineDecoration.ts`,
 *   `listIndentWhitespaceDecoration.ts`), intentionally not touched or
 *   redesigned here.
 * A genuinely blank/whitespace-only line is skipped entirely — no real
 * content follows the whitespace to anchor the check against, matching
 * this codebase's existing convention for such lines (`listLineDecoration.ts`).
 */
const EXCLUDED_ANCESTOR_NAMES: ReadonlySet<string> = new Set([
  'Blockquote',
  'ListItem',
  'BulletList',
  'OrderedList',
  'Table',
  'FencedCode',
  'CodeBlock',
]);

function isOrdinaryParagraphContent(state: EditorState, contentStart: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(contentStart, 1);
  let sawParagraph = false;

  for (; node; node = node.parent) {
    if (EXCLUDED_ANCESTOR_NAMES.has(node.name)) {
      return false;
    }
    if (node.name === 'Paragraph') {
      sawParagraph = true;
    }
  }

  return sawParagraph;
}

/**
 * A single leading-whitespace character's visual stand-in — empty and
 * stateless, so one shared instance covers every occurrence (`eq()` is
 * unconditionally `true`; there is nothing per-instance to distinguish).
 */
class ParagraphIndentWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-indent';
    return span;
  }
}

const INDENT_WIDGET = new ParagraphIndentWidget();

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const leadingLength = line.text.length - line.text.trimStart().length;

      if (leadingLength > 0 && leadingLength < line.text.length) {
        const contentStart = line.from + leadingLength;
        if (isOrdinaryParagraphContent(view.state, contentStart)) {
          for (let i = 0; i < leadingLength; i++) {
            builder.add(line.from + i, line.from + i + 1, Decoration.replace({ widget: INDENT_WIDGET }));
          }
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
