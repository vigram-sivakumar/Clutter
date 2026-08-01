import { Page } from '../models/Page';
import type { ParsedMarkdown } from './FrontmatterParser';
import { PageAnalysisMapper } from './PageAnalysisMapper';

/**
 * Rebuilds immutable Page instances after committed changes.
 *
 * Responsibilities:
 * - Preserve immutable page identity.
 * - Rebuild metadata, content, and derived analysis from a ParsedMarkdown
 *   document — the same contract PageBuilder consumes on initial scan.
 * - Produce a brand-new immutable Page.
 *
 * Non-responsibilities:
 * - Parsing frontmatter or Markdown (owned by FrontmatterParser).
 * - Filesystem writes.
 * - Vault mutation.
 * - Workspace updates.
 * - Global index rebuilding.
 */
export class PageRebuilder {
  private readonly analysisMapper = new PageAnalysisMapper();

  rebuild(page: Page, parsedMarkdown: ParsedMarkdown): Page {
    const { frontmatter, frontmatterAnalysis, body, analysis } = parsedMarkdown;

    return {
      id: page.id,
      type: frontmatter.type ?? page.type,
      name: page.name,
      path: page.path,
      parentId: page.parentId,

      metadata: {
        icon: frontmatter.icon ?? null,
        cover: frontmatter.cover ?? null,
        description: frontmatter.description ?? null,
        favorite: frontmatter.favorite ?? false,
        status: frontmatter.status ?? 'active',
        archivedAt: frontmatter.archivedAt ?? null,
        originalPath: frontmatter.originalPath ?? null,
        originalParentId: frontmatter.originalParentId ?? null,
        createdAt: frontmatter.created ?? page.metadata.createdAt,
        updatedAt: frontmatter.modified ?? new Date().toISOString(),
      },
      source: {
        markdown: body,
      },

      analysis: {
        headings: this.analysisMapper.buildHeadings(analysis.headings),
        aliases: this.analysisMapper.buildAliases(frontmatterAnalysis.aliases),
        blockReferences: this.analysisMapper.buildBlockReferences(
          analysis.blockReferences
        ),
        tasks: this.analysisMapper.buildTasks(page.id, analysis.tasks),
        tags: this.analysisMapper.buildTags(page.id, analysis.tags),
        links: this.analysisMapper.buildLinks(page.id, analysis.links),
        embeds: this.analysisMapper.buildEmbeds(page.id, analysis.embeds),
      },
    };
  }
}
