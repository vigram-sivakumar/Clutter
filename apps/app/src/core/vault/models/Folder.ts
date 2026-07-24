import type { FolderMetadata } from './FolderMetadata';

export interface Folder {
  readonly id: string;

  readonly path: string;
  readonly parentId: string | null;

  readonly metadata: FolderMetadata;
}
