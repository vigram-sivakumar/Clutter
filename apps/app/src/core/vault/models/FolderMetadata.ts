export interface FolderMetadata {
  readonly icon: string | null;
  readonly favorite: boolean;
  readonly description: string;
  readonly cover: string | null;
  /** See PageMetadata.coverHidden — same semantics, folder-scoped. */
  readonly coverHidden: boolean;

  readonly status: 'active' | 'archived';
  readonly archivedAt: string | null;
  readonly originalPath: string | null;
  readonly originalParentId: string | null;
}
