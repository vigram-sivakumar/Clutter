import type { FolderMetadata } from './FolderMetadata';

export interface Folder {
  readonly id: string;

  readonly name: string;

  readonly path: string;
  readonly parentId: string | null;

  readonly metadata: FolderMetadata;
}
