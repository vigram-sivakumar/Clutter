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

export class LinkExtractor {
  extract(content: string): readonly ScannedLink[] {
    const links: ScannedLink[] = [];

    // `(?<!!)`: a `![[...]]` is an embed (EmbedExtractor's), not also a link.
    const matches = content.matchAll(/(?<!!)\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g);

    for (const match of matches) {
      const link = this.extractFromMatch(match);

      if (link) {
        links.push(link);
      }
    }

    return links;
  }

  private extractFromMatch(match: RegExpExecArray): ScannedLink | null {
    const destination = match[1]?.trim();

    if (!destination) {
      return null;
    }

    const [targetPart, fragment] = destination.split('#', 2);

    if (!targetPart) {
      return null;
    }

    const target = targetPart.trim();
    let heading: string | undefined;
    let blockReference: string | undefined;

    if (fragment) {
      if (fragment.startsWith('^')) {
        blockReference = fragment.slice(1).trim();
      } else {
        heading = fragment.trim();
      }
    }

    return {
      target,
      heading,
      blockReference,
      alias: match[2]?.trim(),
      startOffset: match.index,
      endOffset: match.index + match[0].length,
    };
  }
}
