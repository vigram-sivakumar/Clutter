import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';

const EQUALS = '='.charCodeAt(0);
const MARKER = '=---=';

/**
 * The `DoubleHorizontalRule` Lezer node — same convention as
 * `WavyHorizontalRule` (see `wavyHorizontalRuleSyntax.ts`'s doc comment):
 * its own distinct node type rather than a variant tag on the core
 * `HorizontalRule`, registered as a `parseBlock` entry since `=---=` is a
 * whole-line block construct exactly like the constructs it sits beside.
 *
 * `before: 'HorizontalRule'` again costs nothing (`=` isn't one of
 * `HorizontalRule`'s own `*`/`-`/`_` trigger characters) but keeps
 * precedence explicit. `endLeaf` mirrors `wavyHorizontalRuleSyntax.ts`:
 * `=---=` isn't all-`=` characters, so it never collides with CommonMark's
 * Setext level-1 heading underline (which requires the whole line to be
 * `=`), meaning there's no ambiguity to defer to and it can interrupt an
 * in-progress paragraph without a blank line first, same as `~---~`.
 */
export const doubleHorizontalRuleSyntax: MarkdownConfig = {
  defineNodes: ['DoubleHorizontalRule'],
  parseBlock: [
    {
      name: 'DoubleHorizontalRule',
      before: 'HorizontalRule',
      parse(cx: BlockContext, line: Line): boolean {
        if (!isDoubleHorizontalRule(line)) {
          return false;
        }
        const from = cx.lineStart + line.pos;
        const to = cx.lineStart + line.text.length;
        cx.nextLine();
        cx.addElement(cx.elt('DoubleHorizontalRule', from, to));
        return true;
      },
      endLeaf(_cx: BlockContext, line: Line): boolean {
        return isDoubleHorizontalRule(line);
      },
    },
  ],
};

function isDoubleHorizontalRule(line: Line): boolean {
  return line.next === EQUALS && line.text.slice(line.pos).trim() === MARKER;
}
