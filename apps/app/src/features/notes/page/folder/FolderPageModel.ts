import type { Breadcrumb } from '@components/breadcrumb/Breadcrumbs';
import type { SystemIcon } from '@shared/icon';

export interface FolderPageActions {
  onOpenFolder(id: string): void;
  onOpenNote(id: string): void;
}

export interface FolderChildItem {
  readonly id: string;
  readonly title: string;
  readonly icon: SystemIcon;
  readonly emoji: string | null;
  readonly type: 'folder' | 'note';
  readonly onClick: () => void;
}

export interface FolderPageModel {
  readonly title: string;
  readonly description: string;
  readonly coverImage: string | null;
  readonly breadcrumbs: Breadcrumb[];
  readonly children: readonly FolderChildItem[];
}
