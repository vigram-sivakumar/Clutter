import type { CoverCredit, CoverLayout } from '../../models';

export interface FolderFrontmatter {
  id?: string;

  icon?: string;
  favorite?: boolean;
  description?: string;
  cover?: string;
  coverCredit?: CoverCredit;
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
