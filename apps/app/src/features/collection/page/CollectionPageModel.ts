import type { CollectionEntryModel } from './CollectionEntryModel';
import type { CoverLayout } from '@core/vault/models/PageMetadata';

export interface CollectionPageActions {
  onOpenFolder(id: string): void;
  /**
   * Opens a note from this collection. `revealTagName`, set only by the
   * Tag collection view's own entries (`toFilteredCollectionPageModel`'s
   * `view.kind === 'tag'` branch, threaded through `toCollectionEntry`),
   * asks the caller to also resolve every occurrence of that tag in the
   * opened note and reveal/highlight them all — see `PageHost.tsx`'s
   * `openNoteFromCollection` for the one implementation of this. Every
   * other collection source (folder browsing, Workspace, Favorites) always
   * omits it, which is an ordinary open with no reveal, identical to this
   * method's behavior before Tag collection reveal existed.
   */
  onOpenNote(id: string, revealTagName?: string): void;
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
  readonly coverHidden: boolean;
  readonly coverLayout: CoverLayout;
  readonly coverPositionAbove: number;
  readonly coverPositionSide: number;
  readonly folders: readonly CollectionEntryModel[];
  readonly notes: readonly CollectionEntryModel[];
}
