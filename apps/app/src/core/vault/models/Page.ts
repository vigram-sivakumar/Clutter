import type { PageMetadata } from './PageMetadata';
import type { ScannedHeading } from '@core/vault/services/document-analysis/extractors/HeadingExtractor';
import type { ScannedAlias } from '@core/vault/services/document-analysis/extractors/AliasExtractor';
import type { ScannedBlockReference } from '@core/vault/services/document-analysis/extractors/BlockReferenceExtractor';
import type { ScannedTask } from '@core/vault/services/document-analysis/extractors/TaskExtractor';
import type { ScannedTagOccurrence } from '@core/vault/services/document-analysis/extractors/TagExtractor';
import type { ScannedLink } from '@core/vault/services/document-analysis/extractors/LinkExtractor';
import type { ScannedEmbed } from '@core/vault/services/document-analysis/extractors/EmbedExtractor';

export type PageType = 'note' | 'daily-note';

export interface PageSource {
  readonly markdown: string;

  // TODO(v2): Preserve the original frontmatter snapshot.
  // TODO(v2): Add document hash/version for incremental updates.
}

export interface PageAnalysis {
  readonly headings: readonly ScannedHeading[];
  readonly aliases: readonly ScannedAlias[];
  readonly blockReferences: readonly ScannedBlockReference[];

  readonly tasks: readonly ScannedTask[];
  readonly tags: readonly ScannedTagOccurrence[];
  readonly links: readonly ScannedLink[];
  readonly embeds: readonly ScannedEmbed[];

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
