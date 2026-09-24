export interface FolderFrontmatter {
  id?: string;

  icon?: string;
  favorite?: boolean;
  description?: string;
  cover?: string;
  coverHidden?: boolean;
  status?: 'active' | 'archived';
  archivedAt?: string | null;
  originalPath?: string | null;
  originalParentId?: string | null;
}
