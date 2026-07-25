import type { Embed, Page } from '@core/vault/models';

export class EmbedBuilder {
  build(pages: readonly Page[]): readonly Embed[] {
    const embeds: Embed[] = [];

    for (const page of pages) {
      for (const embed of page.analysis.embeds) {
        embeds.push({
          sourcePageId: page.id,
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
