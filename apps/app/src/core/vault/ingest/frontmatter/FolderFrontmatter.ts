import type { CoverLayout } from '../../models';

export interface FolderFrontmatter {
  id?: string;

  icon?: string;
  favorite?: boolean;
  description?: string;
  cover?: string;
  coverHidden?: boolean;
  coverLayout?: CoverLayout;
  coverPositionAbove?: number;
  coverPositionSide?: number;
  defaultTemplateId?: string;
  status?: 'active' | 'archived';
  archivedAt?: string | null;
  originalPath?: string | null;
  originalParentId?: string | null;
}
