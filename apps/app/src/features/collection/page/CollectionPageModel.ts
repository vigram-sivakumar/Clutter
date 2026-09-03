import type { CollectionEntryModel } from './CollectionEntryModel';

export interface CollectionPageActions {
  onOpenFolder(id: string): void;
  onOpenNote(id: string): void;
  /**
   * A draft has no Vault entry yet, so onOpenNote() (PageOperations.open(),
   * which requires one) would throw for it — it's already open via
   * openDraft()/openAtPath(), so clicking it again is a re-select. Same
   * reasoning as FolderTree's onDraftPageClick / DailyNotesList's
   * onOpenDraft (ARCHITECTURE_RULES.md rule 13).
   */
  onOpenDraftNote(id: string): void;
}

export interface CollectionPageModel {
  readonly title: string;
  readonly description: string;
  readonly coverImage: string | null;
  readonly folders: readonly CollectionEntryModel[];
  readonly notes: readonly CollectionEntryModel[];
}
