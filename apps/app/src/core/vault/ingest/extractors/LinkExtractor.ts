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

function trimmedSourceRange(content: string, from: number, to: number): { from: number; to: number } | null {
  const raw = content.slice(from, to);
  if (!raw.trim()) return null;
  return { from: from + raw.length - raw.trimStart().length, to: from + raw.trimEnd().length };
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
        const hashOffset = hash === -1 ? match.referenceTo : match.referenceFrom + hash;
        let targetEnd = hashOffset;
        if (hash !== -1) {
          // A backslash escaping '#' belongs to the delimiter, not the
          // decoded target. Preserve it on a target rename.
          let runStart = hashOffset;
          while (runStart > match.referenceFrom && content[runStart - 1] === '\\') runStart--;
          if ((hashOffset - runStart) % 2 === 1) targetEnd--;
        }
        const targetRange = target ? trimmedSourceRange(content, match.referenceFrom, targetEnd) : null;
        // Keep the existing policy for multi-hash fragments (not a
        // representable heading rename). A single fragment's raw range
        // can include escaped punctuation, without touching its alias.
        const headingRange = heading !== undefined && hash !== -1 &&
          !content.slice(hashOffset + 1, match.referenceTo).includes('#')
          ? trimmedSourceRange(content, hashOffset + 1, match.referenceTo) : null;
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
