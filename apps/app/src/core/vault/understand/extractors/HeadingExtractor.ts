export interface ScannedHeading {
  readonly level: number;
  readonly title: string;
}

export class HeadingExtractor {
  extract(content: string): readonly ScannedHeading[] {
    const headings: ScannedHeading[] = [];

    const matches = content.matchAll(/^(#{1,6})\s+(.+)$/gm);

    for (const match of matches) {
      const heading = this.extractFromMatch(match);

      if (heading) {
        headings.push(heading);
      }
    }

    return headings;
  }

  private extractFromMatch(match: RegExpMatchArray): ScannedHeading | null {
    const hashes = match[1];
    const title = match[2]?.trim();

    if (!hashes || !title) {
      return null;
    }

    return {
      level: hashes.length,
      title,
    };
  }
}
