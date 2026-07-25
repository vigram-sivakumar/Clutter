export interface ScannedEmbed {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}

export class EmbedExtractor {
  extract(content: string): readonly ScannedEmbed[] {
    const embeds: ScannedEmbed[] = [];

    const matches = content.matchAll(/!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g);

    for (const match of matches) {
      const embed = this.extractFromMatch(match);

      if (embed) {
        embeds.push(embed);
      }
    }

    return embeds;
  }

  private extractFromMatch(match: RegExpMatchArray): ScannedEmbed | null {
    const destination = match[1]?.trim();
    if (!destination) {
      return null;
    }

    // Split on first #
    const hashIndex = destination.indexOf('#');
    let targetPart: string;
    let fragment: string | undefined;
    if (hashIndex !== -1) {
      targetPart = destination.slice(0, hashIndex);
      fragment = destination.slice(hashIndex + 1);
    } else {
      targetPart = destination;
      fragment = undefined;
    }
    const target = targetPart.trim();
    if (!target) {
      return null;
    }

    let heading: string | undefined;
    let blockReference: string | undefined;
    if (fragment) {
      if (fragment.startsWith('^')) {
        blockReference = fragment.slice(1);
      } else {
        heading = fragment;
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
