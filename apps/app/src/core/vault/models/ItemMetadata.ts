import type { PageType } from './Page';

export interface ItemMetadata {
  id?: string;
  type?: PageType;

  icon?: string;
  cover?: string;
  description?: string;

  originalParentId?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
