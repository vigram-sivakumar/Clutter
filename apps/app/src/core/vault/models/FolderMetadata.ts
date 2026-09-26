import type { CoverLayout } from './PageMetadata';

export interface FolderMetadata {
  readonly icon: string | null;
  readonly favorite: boolean;
  readonly description: string;
  readonly cover: string | null;
  /** See PageMetadata.coverHidden — same semantics, folder-scoped. */
  readonly coverHidden: boolean;
  /** See PageMetadata.coverLayout — same semantics, folder-scoped. */
  readonly coverLayout: CoverLayout;

  readonly status: 'active' | 'archived';
  readonly archivedAt: string | null;
  readonly originalPath: string | null;
  readonly originalParentId: string | null;
}
