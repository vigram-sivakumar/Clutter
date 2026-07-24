export interface PageMetadata {
  readonly icon: string | null;
  readonly cover: string | null;
  readonly description: string | null;
  readonly favorite: boolean;

  readonly originalParentId: string | null;

  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
