import type { Page } from '@core/vault/models/Page';

export class PageIndex {
  private readonly pagesByPath = new Map<string, Page>();
  private readonly pagesByFileName = new Map<string, Page[]>();
  private readonly pagesByAlias = new Map<string, Page[]>();
  private readonly pages: readonly Page[];

  constructor(pages: Iterable<Page>) {
    this.pages = Array.from(pages);

    for (const page of this.pages) {
      this.pagesByPath.set(page.path, page);

      const pagesWithName = this.pagesByFileName.get(page.name);

      if (pagesWithName) {
        pagesWithName.push(page);
      } else {
        this.pagesByFileName.set(page.name, [page]);
      }

      for (const alias of page.analysis.aliases) {
        const pagesWithAlias = this.pagesByAlias.get(alias.value);

        if (pagesWithAlias) {
          pagesWithAlias.push(page);
        } else {
          this.pagesByAlias.set(alias.value, [page]);
        }
      }
    }
  }

  findByPath(path: string): Page | undefined {
    return this.pagesByPath.get(path);
  }

  findByFileName(name: string): readonly Page[] {
    return this.pagesByFileName.get(name) ?? [];
  }

  findByAlias(alias: string): readonly Page[] {
    return this.pagesByAlias.get(alias) ?? [];
  }

  findHeading(pageId: string, heading: string) {
    const page = this.pages.find((page) => page.id === pageId);

    return page?.analysis.headings.find((item) => item.title === heading);
  }

  findBlockReference(pageId: string, blockReference: string) {
    const page = this.pages.find((page) => page.id === pageId);

    return page?.analysis.blockReferences.find(
      (item) => item.id === blockReference
    );
  }

  // TODO(v2): Promote frequently used lookups to dedicated indexes if
  // linear scans become a measurable bottleneck.
  all(): readonly Page[] {
    return this.pages;
  }
}
