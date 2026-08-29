import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';

import { matchWrappedDivider } from './dividerLabelMatch';

const DOT = '.'.charCodeAt(0);
const CHAR = '.';

/**
 * The `DottedHorizontalRule` Lezer node — same convention as
 * `WavyHorizontalRule`/`DoubleHorizontalRule` (see
 * `wavyHorizontalRuleSyntax.ts`'s doc comment): its own distinct node type
 * rather than a variant tag on the core `HorizontalRule`, registered as a
 * `parseBlock` entry since `.---.` is a whole-line block construct exactly
 * like the constructs it sits beside.
 *
 * `before: 'HorizontalRule'` again costs nothing (`.` isn't one of
 * `HorizontalRule`'s own `*`/`-`/`_` trigger characters) but keeps
 * precedence explicit. `endLeaf` mirrors the other two custom variants:
 * `.` has no CommonMark line-start meaning of its own (unlike `-`, which
 * doubles as a bullet marker, or digits-then-`.`, which is an ordered-list
 * marker — a bare leading `.` isn't one), so there's no ambiguity to defer
 * to and it can interrupt an in-progress paragraph without a blank line
 * first, same as `~---~`/`=---=`.
 *
 * Also matches the labeled form (`.---Text---.`, `.--- Chapter 1 ---.`) via
 * `matchWrappedDivider` — see `wavyHorizontalRuleSyntax.ts`'s doc comment
 * for the shared rationale.
 */
export const dottedHorizontalRuleSyntax: MarkdownConfig = {
  defineNodes: ['DottedHorizontalRule'],
  parseBlock: [
    {
      name: 'DottedHorizontalRule',
      before: 'HorizontalRule',
      parse(cx: BlockContext, line: Line): boolean {
        if (!isDottedHorizontalRule(line)) {
          return false;
        }
        const from = cx.lineStart + line.pos;
        const to = cx.lineStart + line.text.length;
        cx.nextLine();
        cx.addElement(cx.elt('DottedHorizontalRule', from, to));
        return true;
      },
      endLeaf(_cx: BlockContext, line: Line): boolean {
        return isDottedHorizontalRule(line);
      },
    },
  ],
};

function isDottedHorizontalRule(line: Line): boolean {
  return line.next === DOT && matchWrappedDivider(line.text.slice(line.pos), CHAR) !== null;
}
