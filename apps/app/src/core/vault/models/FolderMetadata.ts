import type { CoverLayout } from './PageMetadata';

export interface FolderMetadata {
  readonly icon: string | null;
  readonly favorite: boolean;
  /**
   * `string | null` (not a bare `string` defaulting to `''`) so an unset
   * description omits the frontmatter key entirely, mirroring
   * PageMetadata.description's own null-means-no-value convention —
   * FrontmatterSerializer.serializeFolder already skips `null`/`undefined`
   * values, so this is the only change needed to stop every folder write
   * from emitting a literal, meaningless `description: ` line.
   */
  readonly description: string | null;
  readonly cover: string | null;
  /** See PageMetadata.coverHidden — same semantics, folder-scoped. */
  readonly coverHidden: boolean;
  /** See PageMetadata.coverLayout — same semantics, folder-scoped. */
  readonly coverLayout: CoverLayout;
  /** See PageMetadata.coverPositionAbove — same semantics, folder-scoped. */
  readonly coverPositionAbove: number;
  /** See PageMetadata.coverPositionSide — same semantics, folder-scoped. */
  readonly coverPositionSide: number;

  readonly status: 'active' | 'archived';
  readonly archivedAt: string | null;
  readonly originalPath: string | null;
  readonly originalParentId: string | null;
}
