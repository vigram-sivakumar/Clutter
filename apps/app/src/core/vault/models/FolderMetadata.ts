export interface FolderMetadata {
  readonly icon: string | null;
  readonly favorite: boolean;
  readonly description: string;
  readonly cover: string | null;

  readonly status: 'active' | 'archived';
  readonly archivedAt: string | null;
  readonly originalPath: string | null;
  readonly originalParentId: string | null;
}
