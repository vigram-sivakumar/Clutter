export type ItemType = 'folder' | 'note' | 'daily-note';

export interface Item {
  id: string;

  type: ItemType;

  name: string;

  icon?: string;
  cover?: string;
  description?: string;

  parentFolderId: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}
