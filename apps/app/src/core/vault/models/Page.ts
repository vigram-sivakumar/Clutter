import type { PageMetadata } from './PageMetadata';
import type { ScannedHeading } from '@core/vault/services/document-analysis/extractors/HeadingExtractor';
import type { ScannedAlias } from '@core/vault/services/document-analysis/extractors/AliasExtractor';
import type { ScannedBlockReference } from '@core/vault/services/document-analysis/extractors/BlockReferenceExtractor';

export type PageType = 'note' | 'daily-note';

export interface PageContent {
  readonly headings: readonly ScannedHeading[];
  readonly aliases: readonly ScannedAlias[];
  readonly blockReferences: readonly ScannedBlockReference[];

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
  readonly content: PageContent;
}
