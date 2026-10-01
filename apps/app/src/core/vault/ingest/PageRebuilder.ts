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
      // Not derived from frontmatter.type (inert legacy data, never
      // authoritative) or recomputed here from path — Vault.replacePage(),
      // this method's one production consumer, already recomputes the
      // correct value from the final path for every caller; this is a
      // passthrough, not a second implementation of that rule.
      type: page.type,
      name: page.name,
      path: page.path,
      parentId: page.parentId,

      metadata: {
        icon: frontmatter.icon ?? null,
        cover: frontmatter.cover ?? null,
        coverHidden: frontmatter.coverHidden ?? false,
        coverLayout: frontmatter.coverLayout ?? 'side',
        coverPositionAbove: frontmatter.coverPositionAbove ?? 50,
        coverPositionSide: frontmatter.coverPositionSide ?? 50,
        description: frontmatter.description ?? null,
        favorite: frontmatter.favorite ?? false,
        status: frontmatter.status ?? 'active',
        archivedAt: frontmatter.archivedAt ?? null,
        originalPath: frontmatter.originalPath ?? null,
        originalParentId: frontmatter.originalParentId ?? null,
        createdAt: frontmatter.created ?? page.metadata.createdAt,
        updatedAt: frontmatter.modified ?? new Date().toISOString(),
        // Preserve, never re-derive from the body: once a user (or the
        // Tags sidebar's "+") has set this, an absent `tags` key on a
        // later reparse means "unchanged," not "gone" — this is what
        // keeps frontmatter tags independent of inline #tags. See
        // PageMetadata.tags's own doc comment.
        tags: frontmatter.tags ?? page.metadata.tags ?? [],
        // Straight from the reparsed document (the file is the source of
        // truth for keys Clutter doesn't own), never carried over from the
        // previous page: an external edit that removed such a key must
        // not be resurrected by the next save.
        ...(frontmatter.unownedLines && {
          unownedFrontmatter: frontmatter.unownedLines,
        }),
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
