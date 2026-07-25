import type { Link } from '../models';
import type { ScannedPage } from './VaultScanResult';

export class LinkBuilder {
  build(pages: readonly ScannedPage[]): readonly Link[] {
    const links: Link[] = [];

    for (const page of pages) {
      for (const link of page.analysis.links) {
        links.push({
          sourcePageId: page.frontmatter.id,
          target: link.target,
          heading: link.heading,
          blockReference: link.blockReference,
          alias: link.alias,
        });
      }
    }

    return links;
  }
}
