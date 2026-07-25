import type { Embed } from '@core/vault/models/Embed';
import type { ScannedPage } from './VaultScanResult';

export class EmbedBuilder {
  build(pages: readonly ScannedPage[]): readonly Embed[] {
    const embeds: Embed[] = [];

    for (const page of pages) {
      for (const embed of page.analysis.embeds) {
        embeds.push({
          sourcePageId: page.frontmatter.id,
          target: embed.target,
          heading: embed.heading,
          blockReference: embed.blockReference,
          alias: embed.alias,
        });
      }
    }

    return embeds;
  }
}
