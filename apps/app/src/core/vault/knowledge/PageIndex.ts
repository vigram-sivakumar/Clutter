import type { Heading } from '@core/vault/models/analysis/Heading';
import type { BlockReference } from '@core/vault/models/analysis/BlockReference';
import type { Page } from '@core/vault/models/Page';
import { findFirstHeadingOccurrence } from '@core/vault/ingest/extractors/headingSemantics';

export class PageIndex {
  private readonly pagesByPath = new Map<string, Page>();
  private readonly pagesByFileName = new Map<string, Page[]>();
  private readonly pagesByAlias = new Map<string, Page[]>();
  private readonly pages: readonly Page[];

  constructor(
    pages: Iterable<Page>,
    // The vault's root path: what a vault-relative link target is resolved against.
    private readonly root?: string
  ) {
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

  /**
   * A link target as the editor writes it: vault-relative, no extension
   * ("Projects/Alpha"). The same composition `createWikiLinkResolver` uses to
   * look it up, so a link resolves to the same page here as it does on click.
   */
  findByVaultPath(target: string): Page | undefined {
    return this.root === undefined
      ? undefined
      : this.pagesByPath.get(`${this.root}/${target}.md`);
  }

  findByFileName(name: string): readonly Page[] {
    return this.pagesByFileName.get(name) ?? [];
  }

  findByAlias(alias: string): readonly Page[] {
    return this.pagesByAlias.get(alias) ?? [];
  }

  findHeading(pageId: string, heading: string): Heading | undefined {
    const page = this.pages.find((page) => page.id === pageId);
    if (!page) {
      return undefined;
    }
    // ADR-032: delegates to the shared matching rule (exact text, first
    // match in document order) rather than reimplementing it here.
    return findFirstHeadingOccurrence(page.analysis.headings, heading);
  }

  findBlockReference(
    pageId: string,
    blockReference: string
  ): BlockReference | undefined {
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
