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

import { isTokenEngaged } from '../semanticToken/tokenEngagement';

/**
 * Suppresses heading typography (`tok-heading1`/`tok-heading2`, applied
 * unconditionally by `markdownHighlightStyle.ts`'s `syntaxHighlighting()`
 * to a `SetextHeading1`/`2` node's entire span) while the caret sits on
 * the node's own underline row — the one state where the heading
 * classification is still being decided by what the user types next on
 * that exact line.
 *
 * Root cause this addresses: `@lezer/markdown`'s `SetextHeadingParser`
 * (`node_modules/@lezer/markdown/dist/index.js`) reclassifies an open
 * paragraph leaf into a `SetextHeading1`/`2` node — spanning *both* the
 * text line and the underline line — the instant the current line is a
 * bare run of `=`/`-` characters (`isSetextUnderline`, no minimum length).
 * That reclassification is correct, spec-required CommonMark parsing and
 * is deliberately left untouched here. What's wrong is purely
 * presentational: `syntaxHighlighting()` applies heading-size typography
 * to the node's whole span with no engagement-awareness at all, so typing
 * a single `=`/`-` under an existing paragraph retroactively balloons
 * that *previous, already-authored* line to heading size — confirmed by
 * direct browser reproduction and DOM inspection (`Hey I am here` gains
 * `tok-heading1` the instant `=` is typed on the next line).
 *
 * Deliberately scoped narrower than "the SetextHeading node is engaged"
 * (`isTokenEngaged` against the whole node's range): engaging the node's
 * *text* line — e.g. clicking into already-authored heading content to
 * fix a typo — must keep showing heading typography, exactly matching
 * ATX's established, intentional behavior (`headingMarkerDecoration.ts`'s
 * tests: typing/editing inside `# Heading` keeps it big). ATX has no
 * second line, so there's no equivalent ambiguity window there — nothing
 * about ATX changes here. Only engagement with the underline `HeaderMark`
 * row specifically should suppress typography, since that's the one
 * state where the *previous* line's appearance is changing purely as a
 * side effect of a keystroke on a line the user isn't even looking at.
 *
 * Implemented as an additive `Decoration.mark({class})` rather than
 * trying to retract the class `syntaxHighlighting()` already applied —
 * CM6 has no "subtract a class" primitive; decorations from independent
 * `ViewPlugin`s only ever combine. `MarkdownEditor.css` resolves the
 * combination the same way it already does for `tok-mark` layered onto a
 * revealed ATX prefix's `tok-heading1` span.
 */
const SETEXT_HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'SetextHeading1',
  'SetextHeading2',
]);

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!SETEXT_HEADING_NODE_NAMES.has(node.name)) {
          return;
        }

        const underlineMark = node.node.lastChild;
        if (!underlineMark || underlineMark.name !== 'HeaderMark') {
          return;
        }

        if (isTokenEngaged(view.state, { from: underlineMark.from, to: underlineMark.to })) {
          ranges.push({ from: node.from, to: node.to });
        }
      },
    });
  }

  return Decoration.set(
    ranges.map(({ from, to }) => Decoration.mark({ class: 'tok-setext-pending' }).range(from, to)),
    true
  );
}

interface SetextTypographyPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function setextHeadingTypographyDecoration(): Extension {
  return ViewPlugin.fromClass<SetextTypographyPlugin>(
    class implements SetextTypographyPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
