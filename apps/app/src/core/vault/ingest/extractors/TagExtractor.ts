import { parser as bareMarkdownParser } from '@lezer/markdown';

export interface ScannedTagOccurrence {
  // Exactly as typed in Markdown — never rewritten or case-normalized.
  // normalizeTagName() exists for comparison (dedup, metadata lookup,
  // future autocomplete matching), not for deciding what gets stored.
  readonly name: string;
}

/**
 * Same "bare `@lezer/markdown` parser, not the editor's
 * `markdownGrammarExtensions`" choice `headingSemantics.ts` (ADR-032)
 * already made, for the identical reason: this is Vault Ingest, and
 * importing the editor's grammar config here would be an upward
 * dependency from Vault Ingest into UI/Features (ARCHITECTURE_RULES.md
 * rule 7). The bare parser has no `Tag` node at all (that's the editor's
 * own `tagSyntax.ts` inline extension, not part of CommonMark/GFM) — it's
 * only consulted here for `FencedCode` node ranges, to exclude a `#word`
 * match that merely sits inside a code fence's raw text. The `#word`
 * grammar itself stays this file's own regex, unchanged.
 */
function fencedCodeRanges(content: string): readonly { readonly from: number; readonly to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  bareMarkdownParser.parse(content).iterate({
    enter: (node) => {
      if (node.name === 'FencedCode') {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });
  return ranges;
}

function isInsideAnyRange(pos: number, ranges: readonly { readonly from: number; readonly to: number }[]): boolean {
  return ranges.some((range) => pos >= range.from && pos < range.to);
}

export class TagExtractor {
  extract(content: string): readonly ScannedTagOccurrence[] {
    const tags: ScannedTagOccurrence[] = [];
    const codeRanges = fencedCodeRanges(content);

    let offset = 0;
    for (const line of content.split('\n')) {
      tags.push(...this.extractFromLine(line, offset, codeRanges));
      offset += line.length + 1;
    }

    return tags;
  }

  private extractFromLine(
    line: string,
    lineOffset: number,
    codeRanges: readonly { readonly from: number; readonly to: number }[]
  ): ScannedTagOccurrence[] {
    const tags: ScannedTagOccurrence[] = [];

    const matches = line.matchAll(/(^|\s)#([a-zA-Z0-9_-]+)/g);

    for (const match of matches) {
      const name = match[2];

      if (!name) {
        continue;
      }

      const hashPos = lineOffset + (match.index ?? 0) + (match[1]?.length ?? 0);
      if (isInsideAnyRange(hashPos, codeRanges)) {
        continue;
      }

      tags.push({
        name,
      });
    }

    return tags;
  }
}
