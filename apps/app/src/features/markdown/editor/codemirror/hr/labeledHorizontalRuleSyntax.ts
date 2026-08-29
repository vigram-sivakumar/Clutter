import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';

import { matchStraightLabeledDivider } from './dividerLabelMatch';

/**
 * The `LabeledHorizontalRule` Lezer node — the straight-rule labeled form
 * (`---Text---`, `--- Chapter 1 ---`) of Clutter's own divider-with-label
 * extension (see `wavyHorizontalRuleSyntax.ts`'s doc comment for the family
 * this belongs to). Unlike the wavy/double/dotted variants, the straight
 * rule's *unlabeled* form is native CommonMark `---` (core `HorizontalRule`,
 * unchanged, untouched by this file) — there is no wrapping character to
 * key a shared node type off of, so the labeled case gets its own node
 * type instead of being folded into `HorizontalRule` itself.
 *
 * `matchStraightLabeledDivider` only ever matches when the line has label
 * text between the two `---` runs, so this construct is inert for every
 * plain thematic break (`---`, `-----`, `- - -`, of any length or
 * spacing) — those keep parsing as native `HorizontalRule`, exactly as
 * before. `before: 'HorizontalRule'` costs nothing (the two never actually
 * compete for the same line, since one requires non-dash content and the
 * other forbids it) but keeps precedence explicit, matching the other
 * three variants' convention. `endLeaf` mirrors them too: a labeled line
 * is never all `-`/whitespace, so it can't be a Setext heading underline,
 * meaning there's no CommonMark ambiguity to defer to and it can interrupt
 * an in-progress paragraph without a blank line first.
 */
export const labeledHorizontalRuleSyntax: MarkdownConfig = {
  defineNodes: ['LabeledHorizontalRule'],
  parseBlock: [
    {
      name: 'LabeledHorizontalRule',
      before: 'HorizontalRule',
      parse(cx: BlockContext, line: Line): boolean {
        if (matchStraightLabeledDivider(line.text.slice(line.pos)) === null) {
          return false;
        }
        const from = cx.lineStart + line.pos;
        const to = cx.lineStart + line.text.length;
        cx.nextLine();
        cx.addElement(cx.elt('LabeledHorizontalRule', from, to));
        return true;
      },
      endLeaf(_cx: BlockContext, line: Line): boolean {
        return matchStraightLabeledDivider(line.text.slice(line.pos)) !== null;
      },
    },
  ],
};
