import { tagParser } from '../tag/tagParser';
import { scanWikiLinkSource } from '../grammar/wikiLinkScanner';
import { wikiLinkSourceContextForNode } from '../grammar/wikiLinkSyntax';

export interface ScannedLink {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
  // The `[[...]]` text's exact character range in the content passed to
  // `extract()` (end exclusive) — the same positional-identity contract
  // ScannedTask's offsets already fulfil, so a reference can be revealed in
  // its source note.
  readonly startOffset: number;
  readonly endOffset: number;
}

/** Exact source spans for maintenance, kept out of persisted analysis. */
export interface ScannedLinkSource {
  readonly link: ScannedLink;
  readonly targetRange: { readonly from: number; readonly to: number } | null;
  readonly headingRange: { readonly from: number; readonly to: number } | null;
}

function literalRange(content: string, from: number, to: number, expected: string): { from: number; to: number } | null {
  const raw = content.slice(from, to);
  if (!expected || raw.trim() !== expected) return null;
  const start = from + raw.length - raw.trimStart().length;
  return { from: start, to: start + expected.length };
}

export class LinkExtractor {
  extract(content: string): readonly ScannedLink[] {
    return this.extractWithSource(content).map(({ link }) => link);
  }

  extractWithSource(content: string): readonly ScannedLinkSource[] {
    const links: ScannedLinkSource[] = [];
    tagParser.parse(content).iterate({
      enter: node => {
        if (node.name !== 'WikiLink') return;
        const match = scanWikiLinkSource(content, node.from, wikiLinkSourceContextForNode(node.node));
        if (!match || match.end !== node.to || !match.path.trim()) return false;
        const [targetPart, fragment] = match.path.trim().split('#', 2);
        if (!targetPart) return false;
        const target = targetPart.trim();
        const blockReference = fragment?.startsWith('^') ? fragment.slice(1).trim() : undefined;
        const heading = fragment && !fragment.startsWith('^') ? fragment.trim() : undefined;
        const hash = content.slice(match.referenceFrom, match.referenceTo).indexOf('#');
        const targetEnd = hash === -1 ? match.referenceTo : match.referenceFrom + hash;
        // Maintenance retains its literal-target policy. Never search the
        // alias for a decoded name absent from the actual target segment.
        const targetRange = literalRange(content, match.referenceFrom, targetEnd, target);
        const headingRange = heading !== undefined && hash !== -1
          ? literalRange(content, targetEnd + 1, match.referenceTo, heading) : null;
        links.push({
          link: {
            target, heading, blockReference, alias: match.alias === null ? undefined : match.alias.trim(),
            startOffset: node.from, endOffset: node.to,
          },
          targetRange, headingRange,
        });
        return false;
      },
    });
    return links;
  }
}
