import type { PageType } from './Page';
export interface PageFrontmatter {
  id?: string;

  type?: PageType;

  icon?: string;
  cover?: string;
  description?: string;
  favorite?: boolean;

  originalParentId?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
