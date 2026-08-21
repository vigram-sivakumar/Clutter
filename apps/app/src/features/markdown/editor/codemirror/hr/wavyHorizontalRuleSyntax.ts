import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';

const TILDE = '~'.charCodeAt(0);
const MARKER = '~---~';

/**
 * The `WavyHorizontalRule` Lezer node — a distinct node type per Clutter's
 * own semantic-kind convention (see `docs/editor-architecture-decisions.md`
 * §"Distinct Lezer node types per semantic kind"), not a variant tag on the
 * core `HorizontalRule` node. Registered through the same public
 * `MarkdownConfig` mechanism `wikiLinkSyntax.ts`/`tagSyntax.ts`/
 * `dateSyntax.ts` use, but as a `parseBlock` entry rather than
 * `parseInline`: `~---~` is a whole-line block construct, exactly like the
 * core `HorizontalRule` it sits beside (confirmed against
 * `@lezer/markdown`'s own `HorizontalRule(cx, line)` block parser in
 * `node_modules/@lezer/markdown/dist/index.js`, which this mirrors).
 *
 * `before: 'HorizontalRule'` costs nothing (the two markers never overlap:
 * `~` isn't one of `HorizontalRule`'s own `*`/`-`/`_` trigger characters)
 * but keeps this construct's intent explicit and its precedence pinned
 * ahead of the construct it visually extends. `endLeaf` lets `~---~`
 * interrupt an in-progress paragraph without a blank line first — the same
 * behavior `---` itself gets for free from `@lezer/markdown`'s own
 * `DefaultEndLeaf` list — since there's no CommonMark ambiguity here (no
 * Setext-style double meaning for a `~`-fenced line) to defer to.
 */
export const wavyHorizontalRuleSyntax: MarkdownConfig = {
  defineNodes: ['WavyHorizontalRule'],
  parseBlock: [
    {
      name: 'WavyHorizontalRule',
      before: 'HorizontalRule',
      parse(cx: BlockContext, line: Line): boolean {
        if (!isWavyHorizontalRule(line)) {
          return false;
        }
        const from = cx.lineStart + line.pos;
        const to = cx.lineStart + line.text.length;
        cx.nextLine();
        cx.addElement(cx.elt('WavyHorizontalRule', from, to));
        return true;
      },
      endLeaf(_cx: BlockContext, line: Line): boolean {
        return isWavyHorizontalRule(line);
      },
    },
  ],
};

function isWavyHorizontalRule(line: Line): boolean {
  return line.next === TILDE && line.text.slice(line.pos).trim() === MARKER;
}
