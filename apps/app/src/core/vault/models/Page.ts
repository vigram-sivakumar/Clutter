import type { PageMetadata } from './PageMetadata';
import type { PageFileTimes } from './effectivePageDates';
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

/**
 * Represents the durable runtime identity of a page within a Vault.
 *
 * A Page is part of the Vault's knowledge model.
 *
 * It does not represent an open document or an editing session.
 *
 * Live editing is performed by a DocumentSession in the Document Engine,
 * which references this Page.
 */
export interface Page {
  /**
   * Stable page identity.
   *
   * This identifier remains constant even if the page is renamed or moved.
   */
  readonly id: string;
  readonly type: PageType;

  readonly name: string;
  readonly path: string;
  readonly parentId: string | null;

  readonly metadata: PageMetadata;
  /**
   * The file's own birth/modification times (ADR-057). Separate from `metadata`
   * on purpose: the serializer writes `metadata`, so a filesystem value here can
   * never reach frontmatter. Absent when the file could not be stat'd. Display
   * code reads `resolveEffectivePageDates`, not this directly.
   */
  readonly fileTimes?: PageFileTimes;
  /**
   * `fingerprint(text)` of the exact file text this page was built from (scan, Sync reconcile, or the Gate's own
   * write). Never written to frontmatter. It is the page's content identity for Sync repairs (ADR-063): a repair is
   * derived from this page, so it may replace the file only if the file still holds the text this identifies. Absent
   * when the page was not built from file text.
   */
  readonly sourceFingerprint?: string;
  /**
   * The latest durable Markdown known by the Vault.
   *
   * While a page is open, the DocumentSession may contain newer uncommitted
   * edits that have not yet been reconciled back into the Vault.
   */
  readonly source: PageSource;
  readonly analysis: PageAnalysis;
}
