import type { Page, Link } from '../../models';

export class LinkBuilder {
  build(pages: readonly Page[]): readonly Link[] {
    const links: Link[] = [];

    for (const page of pages) {
      for (const link of page.analysis.links) {
        links.push({
          sourcePageId: page.id,
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
