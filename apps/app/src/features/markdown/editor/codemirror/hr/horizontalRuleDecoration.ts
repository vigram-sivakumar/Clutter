import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';

import { DividerLabelWidget, type DividerKind } from './DividerLabelWidget';
import { matchStraightLabeledDivider, matchWrappedDivider } from './dividerLabelMatch';

/**
 * Live Preview rendering for horizontal rules: native CommonMark `---`/
 * `***`/`___` (core `HorizontalRule`, parsed for free — not GFM-extension-
 * gated) and Clutter's own variants `~---~` (`WavyHorizontalRule`, see
 * `wavyHorizontalRuleSyntax.ts`), `=---=` (`DoubleHorizontalRule`, see
 * `doubleHorizontalRuleSyntax.ts`), and `.---.` (`DottedHorizontalRule`,
 * see `dottedHorizontalRuleSyntax.ts`) — each a distinct node type
 * registered the same way. All four share this one `ViewPlugin`/
 * collapse-at-rest contract rather than parallel decoration layers per
 * variant — they're the same interaction, styled differently — built on
 * the same standalone-`ViewPlugin` architecture as `tableDecoration.ts`'s
 * alignment row: no foreign widget, no replacement DOM node, the real
 * Markdown text stays in place throughout.
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
 *
 * **Labeled variants** (`---Text---`, `~---Text---~`, `=---Text---=`,
 * `.---Text---.` — `labeledHorizontalRuleSyntax.ts`'s dedicated
 * `LabeledHorizontalRule` node for the straight case, plus the additive
 * label-matching in the wavy/double/dotted nodes' own parsers; see
 * `dividerLabelMatch.ts`) share the same node types, the same
 * `isRuleEngaged` selection check, and the same "raw source, nothing
 * special, while engaged" behavior — but render differently at rest:
 * instead of the collapsed-line CSS-`::after` treatment (which has no way
 * to paint real, dynamic text), the whole raw range is replaced with a
 * `DividerLabelWidget`, the same `Decoration.replace({widget})` mechanism
 * `ListBulletWidget`/`WikiLinkWidget` already use elsewhere in this
 * codebase for at-rest content CSS alone can't render.
 */

const hrLineAtRest: Readonly<Record<string, Decoration>> = {
  HorizontalRule: Decoration.line({ class: 'cm-hr-line' }),
  WavyHorizontalRule: Decoration.line({ class: 'cm-hr-line-wavy' }),
  DoubleHorizontalRule: Decoration.line({ class: 'cm-hr-line-double' }),
  DottedHorizontalRule: Decoration.line({ class: 'cm-hr-line-dotted' }),
};
const hiddenMark = Decoration.replace({});

/** Every node name that can carry a label, mapped to its `DividerKind` (which visual style to reuse). `HorizontalRule` (native `---`) is deliberately excluded — it's never labeled, that's `LabeledHorizontalRule`'s job. */
const DIVIDER_KIND_BY_NODE: Readonly<Record<string, DividerKind>> = {
  LabeledHorizontalRule: 'straight',
  WavyHorizontalRule: 'wavy',
  DoubleHorizontalRule: 'double',
  DottedHorizontalRule: 'dotted',
};

const WRAPPED_CHAR_BY_NODE: Readonly<Partial<Record<string, string>>> = {
  WavyHorizontalRule: '~',
  DoubleHorizontalRule: '=',
  DottedHorizontalRule: '.',
};

const labeledLineDeco = Decoration.line({ class: 'cm-hr-labeled-line' });

/**
 * Re-derives the label text (if any) for a node from its own source range,
 * by re-running the exact matcher the block parser used to recognize it in
 * the first place — rather than threading the label through a second
 * Lezer child node. Returns `null` for `LabeledHorizontalRule` only if
 * called with stale/mismatched text, which should never happen since the
 * node only exists where the same matcher already succeeded at parse time.
 */
function extractLabel(state: EditorState, nodeName: string, from: number, to: number): string | null {
  if (nodeName === 'LabeledHorizontalRule') {
    return matchStraightLabeledDivider(state.sliceDoc(from, to));
  }
  const char = WRAPPED_CHAR_BY_NODE[nodeName];
  if (!char) {
    return null;
  }
  return matchWrappedDivider(state.sliceDoc(from, to), char)?.label ?? null;
}

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
        const dividerKind = DIVIDER_KIND_BY_NODE[node.name];
        const lineDeco = hrLineAtRest[node.name];
        if (!dividerKind && !lineDeco) {
          return;
        }
        if (isRuleEngaged(view.state, node.from)) {
          return;
        }

        const label = dividerKind ? extractLabel(view.state, node.name, node.from, node.to) : null;
        if (dividerKind && label !== null) {
          items.push({ from: node.from, to: node.from, deco: labeledLineDeco });
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({ widget: new DividerLabelWidget(dividerKind, label) }),
          });
          return;
        }

        if (lineDeco) {
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
