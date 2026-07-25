import type { Page, Tag } from '../models';

export class TagBuilder {
  build(pages: readonly Page[]): readonly Tag[] {
    const tags = new Map<string, Tag>();

    for (const page of pages) {
      for (const occurrence of page.analysis.tags) {
        if (tags.has(occurrence.name)) {
          continue;
        }

        tags.set(occurrence.name, {
          name: occurrence.name,
        });
      }
    }

    return [...tags.values()];
  }
}
