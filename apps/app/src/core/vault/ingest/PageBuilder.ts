import type { Page } from '../models';
import type { ScannedPage } from './VaultScanResult';
import { IdentityResolver } from './identity/IdentityResolver';
import { VaultPath } from './VaultPath';
import { resolvePageMetadata } from './resolvePageMetadata';
import { isDailyNotePath } from '../initialize/ReservedResources';

import { PageAnalysisMapper } from './PageAnalysisMapper';

export interface BuildPageInput {
  readonly parentId: string | null;
  readonly page: ScannedPage;
}

export class PageBuilder {
  private readonly identityResolver = new IdentityResolver();
  private readonly analysisMapper = new PageAnalysisMapper();

  // Optional, defaulting to '' (never classifies as Daily Note — the same
  // 'note' default every caller that doesn't pass a real root already got
  // before this class was path-aware) so the many existing unit tests that
  // construct a PageBuilder for reasons unrelated to Daily Note
  // classification don't all need an unrelated update. Every production
  // construction site (VaultBuilder, PagePersistenceCoordinator,
  // VaultSyncService) passes the real vault root.
  constructor(private readonly vaultRoot: string = '') {}

  build(input: BuildPageInput): Page {
    const { page, parentId } = input;

    const identity = this.identityResolver.resolvePage(
      page.frontmatter.id,
      page.path
    );

    // A page's Daily Note vs. Note role is derived from its current path,
    // never persisted frontmatter (frontmatter.type, if present on disk,
    // is inert legacy data — see FrontmatterSerializer, which no longer
    // writes it). Same rule Vault.resolvePageType enforces at runtime for
    // every later mutation; this is the one place it must be computed
    // before a Vault exists yet to enforce it (the initial scan).
    const type = isDailyNotePath(this.vaultRoot, page.path) ? 'daily-note' : 'note';

    return {
      id: identity.id,
      type,
      name: VaultPath.pageName(page.path),
      path: page.path,
      parentId,

      metadata: resolvePageMetadata(page.frontmatter),
      source: {
        markdown: page.content,
      },

      analysis: {
        headings: this.analysisMapper.buildHeadings(page.analysis.headings),
        aliases: this.analysisMapper.buildAliases(page.frontmatterAnalysis.aliases),
        blockReferences: this.analysisMapper.buildBlockReferences(
          page.analysis.blockReferences
        ),
        tasks: this.analysisMapper.buildTasks(identity.id, page.analysis.tasks),
        tags: this.analysisMapper.buildTags(identity.id, page.analysis.tags),
        links: this.analysisMapper.buildLinks(identity.id, page.analysis.links),
        embeds: this.analysisMapper.buildEmbeds(identity.id, page.analysis.embeds),
      },
    };
  }
}
