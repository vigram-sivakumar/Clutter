import type { TaskOccurrence, TagOccurrence, LinkOccurrence, EmbedOccurrence } from '../models/occurrences';
import type { ScannedHeading } from './extractors/HeadingExtractor';
import type { ScannedAlias } from './extractors/AliasExtractor';
import type { ScannedBlockReference } from './extractors/BlockReferenceExtractor';
import type { ScannedTask } from './extractors/TaskExtractor';
import type { ScannedTagOccurrence } from './extractors/TagExtractor';
import type { ScannedLink } from './extractors/LinkExtractor';
import type { ScannedEmbed } from './extractors/EmbedExtractor';
import type { Heading } from '../models/analysis/Heading';
import type { Alias } from '../models/Alias';
import type { BlockReference } from '../models/analysis/BlockReference';

export class PageAnalysisMapper {
  buildHeadings(
    headings: readonly ScannedHeading[]
  ): readonly Heading[] {
    return headings.map((heading) => ({
      text: heading.title,
      level: heading.level,
    }));
  }

  buildAliases(aliases: readonly ScannedAlias[]): readonly Alias[] {
    return aliases.map((alias) => ({
      value: alias.value,
    }));
  }

  buildBlockReferences(
    blocks: readonly ScannedBlockReference[]
  ): readonly BlockReference[] {
    return blocks.map((block) => ({
      id: block.id,
    }));
  }

  buildTasks(
    sourcePageId: string,
    scannedTasks: readonly ScannedTask[]
  ): readonly TaskOccurrence[] {
    return scannedTasks.map((task) => ({
      sourcePageId,
      text: task.text,
      completed: task.completed,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      rawText: task.rawText,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }

  buildTags(
    sourcePageId: string,
    scannedTags: readonly ScannedTagOccurrence[]
  ): readonly TagOccurrence[] {
    return scannedTags.map((tag) => ({
      sourcePageId,
      name: tag.name,
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }

  buildLinks(
    sourcePageId: string,
    scannedLinks: readonly ScannedLink[]
  ): readonly LinkOccurrence[] {
    return scannedLinks.map((link) => ({
      sourcePageId,
      target: link.target,
      heading: link.heading,
      blockReference: link.blockReference,
      alias: link.alias,
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }

  buildEmbeds(
    sourcePageId: string,
    scannedEmbeds: readonly ScannedEmbed[]
  ): readonly EmbedOccurrence[] {
    return scannedEmbeds.map((embed) => ({
      sourcePageId,
      target: embed.target,
      heading: embed.heading,
      blockReference: embed.blockReference,
      alias: embed.alias,
      rawText: undefined,
      startOffset: undefined,
      endOffset: undefined,
      sourceVersion: undefined,
    }));
  }
}