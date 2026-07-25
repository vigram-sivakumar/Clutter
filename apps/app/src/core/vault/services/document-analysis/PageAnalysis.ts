import type { ScannedBlockReference } from './extractors/BlockReferenceExtractor';
import type { ScannedTask } from './extractors/TaskExtractor';
import type { ScannedTagOccurrence } from './extractors/TagExtractor';
import type { ScannedLink } from './extractors/LinkExtractor';
import type { ScannedEmbed } from './extractors/EmbedExtractor';
import type { ScannedHeading } from './extractors/HeadingExtractor';

// Semantic information derived from a single page's source.
//
// Page analysis is page-local and never depends on the rest of the vault.
export interface PageAnalysis {
  readonly tasks: readonly ScannedTask[];
  readonly tags: readonly ScannedTagOccurrence[];
  readonly links: readonly ScannedLink[];
  readonly embeds: readonly ScannedEmbed[];
  readonly headings: readonly ScannedHeading[];
  readonly blockReferences: readonly ScannedBlockReference[];
}
