import { allCodeRanges, isInsideAnyRange } from './markdownCodeRanges';

export interface ScannedEmbed {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
  // The `![[...]]` text's exact character range in the content passed to
  // `extract()` (end exclusive). See ScannedLink.
  readonly startOffset: number;
  readonly endOffset: number;
}

export class EmbedExtractor {
  extract(content: string): readonly ScannedEmbed[] {
    const embeds: ScannedEmbed[] = [];

    // A reference written inside code (a fenced or indented block, an inline span) is text about links, not a link.
    const code = allCodeRanges(content);
    const matches = content.matchAll(/!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g);

    for (const match of matches) {
      if (isInsideAnyRange(match.index, code)) {
        continue;
      }

      const embed = this.extractFromMatch(match);

      if (embed) {
        embeds.push(embed);
      }
    }

    return embeds;
  }

  private extractFromMatch(match: RegExpExecArray): ScannedEmbed | null {
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
      startOffset: match.index,
      endOffset: match.index + match[0].length,
    };
  }
}
