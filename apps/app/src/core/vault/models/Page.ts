import type { PageMetadata } from './PageMetadata';
import type { Heading } from './analysis/Heading';
import type { Alias } from './Alias';
import type { BlockReference } from './analysis/BlockReference';
import type { TaskOccurrence } from './occurrences/TaskOccurrence';
import type { TagOccurrence } from './occurrences/TagOccurrence';
import type { LinkOccurrence } from './occurrences/LinkOccurrence';
import type { EmbedOccurrence } from './occurrences/EmbedOccurrence';

export type PageType = 'note' | 'daily-note';

export interface PageSource {
  readonly markdown: string;

  // TODO(v2): Preserve the original frontmatter snapshot.
  // TODO(v2): Add document hash/version for incremental updates.
}

export interface PageAnalysis {
  readonly headings: readonly Heading[];
  readonly aliases: readonly Alias[];
  readonly blockReferences: readonly BlockReference[];

  readonly tasks: readonly TaskOccurrence[];
  readonly tags: readonly TagOccurrence[];
  readonly links: readonly LinkOccurrence[];
  readonly embeds: readonly EmbedOccurrence[];

  // TODO(v2): Add outline, sections, transclusions,
  // and other page-owned semantics here.
}

export interface Page {
  readonly id: string;
  readonly type: PageType;

  readonly name: string;
  readonly path: string;
  readonly parentId: string | null;

  readonly metadata: PageMetadata;
  readonly source: PageSource;
  readonly analysis: PageAnalysis;
}
