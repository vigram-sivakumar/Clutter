import type { Page } from '../models';
import type { ScannedPage } from '../discover/VaultScanResult';
import { IdentityResolver } from './IdentityResolver';

import { PageAnalysisMapper } from './PageAnalysisMapper';

export interface BuildPageInput {
  readonly parentId: string | null;
  readonly page: ScannedPage;
}

export class PageBuilder {
  private readonly identityResolver = new IdentityResolver();
  private readonly analysisMapper = new PageAnalysisMapper();

  private getPageName(path: string): string {
    const fileName = path.substring(path.lastIndexOf('/') + 1);
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

      metadata: {
        icon: page.frontmatter.icon ?? null,
        cover: page.frontmatter.cover ?? null,
        description: page.frontmatter.description ?? null,
        favorite: page.frontmatter.favorite ?? false,
        status: page.frontmatter.status ?? 'active',
        archivedAt: page.frontmatter.archivedAt ?? null,
        originalPath: page.frontmatter.originalPath ?? null,
        originalParentId: page.frontmatter.originalParentId ?? null,
        createdAt: page.frontmatter.created ?? null,
        updatedAt: page.frontmatter.modified ?? null,
      },
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
