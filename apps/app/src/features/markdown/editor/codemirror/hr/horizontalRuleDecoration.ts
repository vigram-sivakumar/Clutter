import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';

/**
 * Live Preview rendering for horizontal rules: native CommonMark `---`/
 * `***`/`___` (core `HorizontalRule`, parsed for free — not GFM-extension-
 * gated) and Clutter's own wavy variant `~---~` (`WavyHorizontalRule`, a
 * distinct node registered by `wavyHorizontalRuleSyntax.ts`). Both share
 * this one `ViewPlugin`/collapse-at-rest contract rather than two parallel
 * decoration layers — they're the same interaction, styled differently —
 * built on the same standalone-`ViewPlugin` architecture as
 * `tableDecoration.ts`'s alignment row: no foreign widget, no replacement
 * DOM node, the real Markdown text stays in place throughout.
 *
 * Unlike the table alignment row, the collapsing line class is only
 * applied while *not* engaged: `font-size`/`line-height: 0` on that class
 * zeroes out text-box metrics regardless of whether the line has visible
 * text, so applying it unconditionally (as the align row does) would keep
 * the raw marker invisible even once `hiddenMark` stops replacing it. At
 * rest, the class collapses the line to a thin divider (CSS-painted, see
 * `MarkdownEditor.css`); once engaged, no special line class is applied at
 * all, so the revealed marker text renders at normal size like any other
 * line.
 */

const hrLineAtRest: Readonly<Record<string, Decoration>> = {
  HorizontalRule: Decoration.line({ class: 'cm-hr-line' }),
  WavyHorizontalRule: Decoration.line({ class: 'cm-hr-line-wavy' }),
};
const hiddenMark = Decoration.replace({});

/**
 * Engaged iff the current selection touches the rule's own physical line —
 * identical `isPhysicalLineEngaged` rule used by `liveMarkDecoration.ts`
 * and `tableDecoration.ts`'s `isRowEngaged`. `HorizontalRule` is always a
 * single physical line (the block parser matches and closes it in one
 * step), so there's no lazy-continuation ambiguity to resolve.
 */
function isRuleEngaged(state: EditorState, ruleFrom: number): boolean {
  const ruleLine = state.doc.lineAt(ruleFrom).number;
  const selection = state.selection.main;
  const fromLine = state.doc.lineAt(selection.from).number;
  const toLine = state.doc.lineAt(selection.to).number;
  return ruleLine === fromLine || ruleLine === toLine;
}

interface DecoItem {
  readonly from: number;
  readonly to: number;
  readonly deco: Decoration;
}

function buildHorizontalRuleDecorations(view: EditorView): DecorationSet {
  const items: DecoItem[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const lineDeco = hrLineAtRest[node.name];
        if (!lineDeco) {
          return;
        }
        const engaged = isRuleEngaged(view.state, node.from);
        if (!engaged) {
          items.push({ from: node.from, to: node.from, deco: lineDeco });
          if (node.to > node.from) {
            items.push({ from: node.from, to: node.to, deco: hiddenMark });
          }
        }
      },
    });
  }

  return Decoration.set(
    items.map(({ from, to, deco }) => deco.range(from, to)),
    true
  );
}

interface HorizontalRuleDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function horizontalRuleDecoration(): Extension {
  return ViewPlugin.fromClass<HorizontalRuleDecorationPlugin>(
    class implements HorizontalRuleDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildHorizontalRuleDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildHorizontalRuleDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
