import type { Page } from '../models';
import type {
  TaskOccurrence,
  TagOccurrence,
  LinkOccurrence,
  EmbedOccurrence,
} from '../models/occurrences';
import type { ScannedPage } from '../discover/VaultScanResult';
import { IdentityResolver } from './IdentityResolver';

import type { ScannedHeading } from '../understand/extractors/HeadingExtractor';
import type { ScannedAlias } from '../understand/extractors/AliasExtractor';
import type { ScannedBlockReference } from '../understand/extractors/BlockReferenceExtractor';
import type { ScannedTask } from '../understand/extractors/TaskExtractor';
import type { ScannedTagOccurrence } from '../understand/extractors/TagExtractor';
import type { ScannedLink } from '../understand/extractors/LinkExtractor';
import type { ScannedEmbed } from '../understand/extractors/EmbedExtractor';

import type { Heading } from '../models/analysis/Heading';
import type { Alias } from '../models/Alias';
import type { BlockReference } from '../models/analysis/BlockReference';

export interface BuildPageInput {
  readonly parentId: string;
  readonly page: ScannedPage;
}

export class PageBuilder {
  private readonly identityResolver = new IdentityResolver();

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
        originalParentId: page.frontmatter.originalParentId ?? null,
        createdAt: page.frontmatter.createdAt ?? null,
        updatedAt: page.frontmatter.updatedAt ?? null,
      },
      source: {
        markdown: page.content,
      },

      analysis: {
        headings: this.buildHeadings(page.analysis.headings),
        aliases: this.buildAliases(page.frontmatterAnalysis.aliases),
        blockReferences: this.buildBlockReferences(
          page.analysis.blockReferences
        ),
        tasks: this.buildTasks(identity.id, page.analysis.tasks),
        tags: this.buildTags(identity.id, page.analysis.tags),
        links: this.buildLinks(identity.id, page.analysis.links),
        embeds: this.buildEmbeds(identity.id, page.analysis.embeds),
      },
    };
  }

  // Mapping methods for translation boundary
  private buildHeadings(
    headings: readonly ScannedHeading[]
  ): readonly Heading[] {
    return headings.map((heading) => ({
      text: heading.title,
      level: heading.level,
    }));
  }

  private buildAliases(aliases: readonly ScannedAlias[]): readonly Alias[] {
    return aliases.map((alias) => ({
      value: alias.value,
    }));
  }

  private buildBlockReferences(
    blocks: readonly ScannedBlockReference[]
  ): readonly BlockReference[] {
    return blocks.map((block) => ({
      id: block.id,
    }));
  }

  private buildTasks(
    sourcePageId: string,
    scannedTasks: readonly ScannedTask[]
  ): readonly TaskOccurrence[] {
    return scannedTasks.map((task) => ({
      sourcePageId,
      text: task.text,
      completed: task.completed,
      // The following fields are left undefined for now:
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }

  private buildTags(
    sourcePageId: string,
    scannedTags: readonly ScannedTagOccurrence[]
  ): readonly TagOccurrence[] {
    return scannedTags.map((tag) => ({
      sourcePageId,
      name: tag.name,
      // The following fields are left undefined for now:
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }

  private buildLinks(
    sourcePageId: string,
    scannedLinks: readonly ScannedLink[]
  ): readonly LinkOccurrence[] {
    return scannedLinks.map((link) => ({
      sourcePageId,
      target: link.target,
      heading: link.heading,
      blockReference: link.blockReference,
      alias: link.alias,
      // The following fields are left undefined for now:
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }

  private buildEmbeds(
    sourcePageId: string,
    scannedEmbeds: readonly ScannedEmbed[]
  ): readonly EmbedOccurrence[] {
    return scannedEmbeds.map((embed) => ({
      sourcePageId,
      target: embed.target,
      heading: embed.heading,
      blockReference: embed.blockReference,
      alias: embed.alias,
      // The following fields are left undefined for now:
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }
}
