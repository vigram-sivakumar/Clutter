import type { ItemMetadata } from './ItemMetadata';

export type PageType = 'folder' | 'note' | 'daily-note';

export interface Page extends ItemMetadata {
  id: string;
  type: PageType;
  parentId: string | null;
  name: string;
  path: string;
}
