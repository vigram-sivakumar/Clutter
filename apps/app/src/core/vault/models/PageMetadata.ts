export type PageStatus = 'active' | 'archived';

export interface PageMetadata {
  readonly icon: string | null;
  readonly cover: string | null;
  readonly description: string | null;
  readonly favorite: boolean;

  readonly status: PageStatus;
  readonly archivedAt: string | null;

  readonly originalParentId: string | null;
  readonly originalPath: string | null;

  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
