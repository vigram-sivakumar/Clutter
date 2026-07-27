/**
 * Builds the vault-wide embed collection from page analysis.
 *
 * This class only aggregates extracted embeds. It does not resolve or
 * validate embed targets.
 */
import type { Embed, Page } from '@core/vault/models';

export class EmbedBuilder {
  build(pages: readonly Page[]): readonly Embed[] {
    const embeds: Embed[] = [];

    for (const page of pages) {
      for (const embed of page.analysis.embeds) {
        embeds.push({
          target: embed.target,
        });
      }
    }

    return embeds;
  }
}
