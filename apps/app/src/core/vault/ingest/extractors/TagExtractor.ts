import { fencedCodeRanges, isInsideAnyRange } from './markdownCodeRanges';

export interface ScannedTagOccurrence {
  // Exactly as typed in Markdown — never rewritten or case-normalized.
  // normalizeTagName() exists for comparison (dedup, metadata lookup,
  // future autocomplete matching), not for deciding what gets stored.
  readonly name: string;
  // The `#name` span's exact character range within the original document
  // (the same `content` string passed to `extract()`), fulfilling
  // Occurrence.startOffset/endOffset's long-reserved "populate during
  // analysis" contract — same approach TaskExtractor's own
  // startOffset/endOffset already established, just at tag-span rather
  // than whole-line granularity, since (unlike a task) a line can carry
  // more than one tag. `startOffset` is the `#` character's own index;
  // `endOffset` is exclusive and excludes any trailing text/whitespace —
  // this is what lets a later consumer (Tag collection → "Show in note",
  // ADR pending) resolve this occurrence to its containing editor line
  // without re-deriving the match position from `name` and a text search.
  readonly startOffset: number;
  readonly endOffset: number;
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
        startOffset: hashPos,
        endOffset: hashPos + 1 + name.length,
      });
    }

    return tags;
  }
}
