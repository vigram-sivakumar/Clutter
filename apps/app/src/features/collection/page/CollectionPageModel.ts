import type { VaultResource } from '@core/vault/models/VaultResource';

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
  /**
   * ResourceOperations.open(id) — only ever invoked for an image resource
   * today (Resource.tsx's own isClickable guard covers pdf), same
   * reasoning as AssetsCollectionBody's onOpenImage. Optional: only a real
   * Folder source ever populates `resources` (see toFolderCollectionPageModel),
   * so the filtered-view branch never needs this action at all.
   */
  onOpenResource?(id: string): void;
}

export interface CollectionPageModel {
  readonly title: string;
  readonly description: string;
  readonly coverImage: string | null;
  readonly folders: readonly CollectionEntryModel[];
  readonly notes: readonly CollectionEntryModel[];
  /**
   * VaultResources (image/pdf) directly inside this folder — empty for
   * every filtered-view source (Workspace-root/Favorites/tag), which are
   * Note/Folder-scoped by definition. Rendered by CollectionBody via the
   * shared Resource row component, same as AssetsCollectionBody/the
   * sidebar already do.
   */
  readonly resources: readonly VaultResource[];
}
