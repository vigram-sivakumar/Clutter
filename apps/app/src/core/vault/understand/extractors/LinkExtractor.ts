export interface ScannedLink {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}

export class LinkExtractor {
  extract(content: string): readonly ScannedLink[] {
    const links: ScannedLink[] = [];

    const matches = content.matchAll(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g);

    for (const match of matches) {
      const link = this.extractFromMatch(match);

      if (link) {
        links.push(link);
      }
    }

    return links;
  }

  private extractFromMatch(match: RegExpMatchArray): ScannedLink | null {
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
    };
  }
}
