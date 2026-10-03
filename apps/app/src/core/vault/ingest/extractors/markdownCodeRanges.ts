import { parser as bareMarkdownParser } from '@lezer/markdown';

export interface TextRange {
  readonly from: number;
  readonly to: number;
}

/**
 * The character ranges of code in `content`, so an extractor can ignore what
 * merely sits inside code. Uses the bare `@lezer/markdown` parser, not the
 * editor's grammar config (an upward dependency from Vault Ingest into
 * UI/Features, ARCHITECTURE_RULES.md rule 7) — `FencedCode` (both ``` and ~~~
 * fences), `CodeBlock` and, when asked, `InlineCode` are all in the base
 * grammar.
 */
function codeRanges(content: string, nodeNames: ReadonlySet<string>): readonly TextRange[] {
  const ranges: TextRange[] = [];
  bareMarkdownParser.parse(content).iterate({
    enter: (node) => {
      if (nodeNames.has(node.name)) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });
  return ranges;
}

const FENCED = new Set(['FencedCode']);
const ANY_CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);

export function fencedCodeRanges(content: string): readonly TextRange[] {
  return codeRanges(content, FENCED);
}

/** Fenced code, indented code blocks and inline code spans. */
export function allCodeRanges(content: string): readonly TextRange[] {
  return codeRanges(content, ANY_CODE);
}

export function isInsideAnyRange(pos: number, ranges: readonly TextRange[]): boolean {
  return ranges.some((range) => pos >= range.from && pos < range.to);
}
