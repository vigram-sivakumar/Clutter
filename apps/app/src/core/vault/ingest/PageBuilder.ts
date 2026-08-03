import type { Page } from '../models';
import type { ScannedPage } from './VaultScanResult';
import { IdentityResolver } from './identity/IdentityResolver';
import { VaultPath } from './VaultPath';
import { resolvePageMetadata } from './resolvePageMetadata';

import { PageAnalysisMapper } from './PageAnalysisMapper';

export interface BuildPageInput {
  readonly parentId: string | null;
  readonly page: ScannedPage;
}

export class PageBuilder {
  private readonly identityResolver = new IdentityResolver();
  private readonly analysisMapper = new PageAnalysisMapper();

  private getPageName(path: string): string {
    const fileName = VaultPath.filename(path);
    return fileName.endsWith('.md')
      ? fileName.substring(0, fileName.length - 3)
      : fileName;
  }

  build(input: BuildPageInput): Page {
    const { page, parentId } = input;

    const identity = this.identityResolver.resolvePage(
      page.frontmatter.id,
      page.path
    );

    const type = page.frontmatter.type;

    return {
      id: identity.id,
      type: type ?? 'note',
      name: this.getPageName(page.path),
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
