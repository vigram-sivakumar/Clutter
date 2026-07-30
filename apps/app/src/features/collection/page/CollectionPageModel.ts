import type { CollectionEntryModel } from './CollectionEntryModel';

export interface CollectionPageActions {
  onOpenFolder(id: string): void;
  onOpenNote(id: string): void;
}

export interface CollectionPageModel {
  readonly title: string;
  readonly description: string;
  readonly coverImage: string | null;
  readonly folders: readonly CollectionEntryModel[];
  readonly notes: readonly CollectionEntryModel[];
}
