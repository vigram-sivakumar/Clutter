import { Button } from '@components/button/Button';
import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { Dialog } from '@components/dialog/Dialog';
import { AppIcon } from '@shared/icon';
import {
  getFolderDeleteConfirmation,
  PAGE_DELETE_CONFIRMATION_MESSAGE,
} from '@features/notes/helpers/folderActionConfirmation';
import { Resource } from '@features/notes/sidebar/Resource';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { Vault } from '@core/vault/models/Vault';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import {
  renderFolderCard,
  renderNoteListItem,
  renderNoteTableRow,
  toTableColumns,
  sortCollectionEntries,
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  DEFAULT_COLLECTION_SORT,
  type CollectionViewMode,
  type CollectionPropertyVisibility,
  type CollectionSortState,
} from './CollectionBody';
import { NoteTable } from '@features/collection/components/note/table/NoteTable';
import { NoteListGrid } from '@features/collection/components/note/list/NoteListGrid';
import { FolderGrid } from '@features/collection/components/folder/grid/FolderGrid';

import { PageBody } from './Page.Body';

export interface ArchiveCollectionBodyProps {
  vault: Vault;
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  viewMode?: CollectionViewMode;
  properties?: CollectionPropertyVisibility;
  sort?: CollectionSortState;
  resources: readonly VaultResource[];
  /** Invoked for both resource kinds (image, pdf) — see Resource.tsx. */
  onOpenResource?(resource: VaultResource): void;
  onRestoreResource(resourceId: string): void;
  onDeleteResource(resourceId: string): void;
  /**
   * FolderOperations.restore()/delete() — the archived-folder counterpart
   * to onRestoreResource/onDeleteResource, same shape. Available alongside
   * (not instead of) the existing topbar Restore/Delete a folder still
   * gets once opened — both paths reach the same two operations, per the
   * approved UX decision keeping the topbar path unchanged.
   */
  onRestoreFolder(folderId: string): void;
  onDeleteFolder(folderId: string): void;
  /**
   * PageOperations.restore()/delete() — covers both Notes and Daily Notes
   * identically (a Daily Note is a Page; toCollectionPageModel's
   * getVisibleChildPages already renders both as the same 'note'-typed
   * CollectionEntryModel, so there is no separate Daily Note case here).
   * Same "alongside the topbar, not instead of it" shape as folders.
   */
  onRestoreNote(pageId: string): void;
  onDeleteNote(pageId: string): void;
}

/**
 * The page-body rendering for the Archive folder view — folders/notes
 * render through the exact same components every other collection page
 * uses (renderFolderCard/renderNoteListItem/renderNoteTableRow, exported
 * from CollectionBody, one rendering per entry shape, not a second
 * implementation): folders always via FolderGrid/FolderCard, notes via
 * NoteListGrid/NoteList (List) or NoteTable/NoteTableRow (Table) — same
 * "folders don't switch with viewMode" rule CollectionBody itself follows.
 * Restore/Delete reuse the `actions` slot those components now carry
 * (CollectionEntry's `actions` prop). Resources (images/PDFs) stay on the
 * sidebar's own `Resource` row component regardless of viewMode —
 * CollectionEntryModel is folder/note-shaped, with no room for a
 * resource's `kind`, the same reasoning AssetsCollectionBody/
 * TasksCollectionBody already established for their own collections.
 *
 * Every folder/note row here gets exactly two hover-only icon buttons
 * (Restore, Delete permanently); a resource row instead uses Resource's
 * own `archiveActions` prop (unchanged from before). Delete's confirmation
 * reuses the exact same useConfirmationSurface/Confirmation/Dialog
 * primitive every other archived-delete flow already uses.
 */
export function ArchiveCollectionBody({
  vault,
  folders = [],
  notes = [],
  viewMode = 'table',
  properties = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  sort = DEFAULT_COLLECTION_SORT,
  resources,
  onOpenResource,
  onRestoreResource,
  onDeleteResource,
  onRestoreFolder,
  onDeleteFolder,
  onRestoreNote,
  onDeleteNote,
}: ArchiveCollectionBodyProps) {
  const confirmation = useConfirmationSurface();

  function requestDelete(title: string, message: string, onConfirm: () => void) {
    confirmation.request({ title, message, confirmLabel: 'Delete', onConfirm });
  }

  // CollectionEntry's and NoteTableRow's own click handlers already refuse
  // to fire the row's onClick when the click target is a nested <button>
  // (the same interactive-descendant guard Entry.tsx originally
  // established) — the same reason Resource.tsx's archiveActions buttons
  // (below) never needed stopPropagation either. No new event-isolation
  // mechanism here, folder/note rows included.
  function hoverActions(onRestore: () => void, onDeleteClick: () => void) {
    return (
      <>
        <Button
          size="small"
          variant="ghost"
          interaction="subtle"
          isIconOnly
          onClick={onRestore}
          aria-label="Restore"
        >
          <AppIcon icon="restore" />
        </Button>
        <Button
          size="small"
          variant="ghost"
          interaction="subtle"
          isIconOnly
          onClick={onDeleteClick}
          aria-label="Delete permanently"
        >
          <AppIcon icon="trash" />
        </Button>
      </>
    );
  }

  function folderActions(entry: CollectionEntryModel) {
    return hoverActions(
      () => onRestoreFolder(entry.id),
      () =>
        requestDelete(
          'Delete permanently?',
          getFolderDeleteConfirmation(vault, entry.id).message,
          () => onDeleteFolder(entry.id)
        )
    );
  }

  function noteActions(entry: CollectionEntryModel) {
    return hoverActions(
      () => onRestoreNote(entry.id),
      () =>
        requestDelete('Delete permanently?', PAGE_DELETE_CONFIRMATION_MESSAGE, () =>
          onDeleteNote(entry.id)
        )
    );
  }

  const sortedFolders = sortCollectionEntries(folders, sort);
  const sortedNotes = sortCollectionEntries(notes, sort);

  const noteRows = sortedNotes.map((entry) =>
    viewMode === 'table'
      ? renderNoteTableRow(entry, properties, noteActions(entry))
      : renderNoteListItem(entry, properties, noteActions(entry))
  );

  return (
    <>
      <PageBody className="collection__content">
        {sortedFolders.length > 0 && (
          <FolderGrid>
            {sortedFolders.map((entry) => renderFolderCard(entry, folderActions(entry)))}
          </FolderGrid>
        )}
        {viewMode === 'table' ? (
          <NoteTable columns={toTableColumns(properties)}>{noteRows}</NoteTable>
        ) : (
          <NoteListGrid>{noteRows}</NoteListGrid>
        )}
        {resources.map((resource) => (
          <Resource
            key={resource.id}
            resource={resource}
            onClick={onOpenResource}
            archiveActions={hoverActions(
              () => onRestoreResource(resource.id),
              () =>
                requestDelete(
                  'Delete permanently?',
                  PAGE_DELETE_CONFIRMATION_MESSAGE,
                  () => onDeleteResource(resource.id)
                )
            )}
          />
        ))}
        {/* Trailing breathing room below the last row/card — see
            .collection__bottom-spacer's own comment in
            CollectionBody.css for why it's a real flex child rather
            than padding on .collection__content. */}
        <div className="collection__bottom-spacer" aria-hidden="true" />
      </PageBody>
      <Dialog open={confirmation.pending !== null} onClose={confirmation.cancel} size="medium">
        {confirmation.pending && (
          <Confirmation
            title={confirmation.pending.title}
            description={confirmation.pending.message}
            confirmLabel={confirmation.pending.confirmLabel}
            onConfirm={confirmation.confirm}
            onCancel={confirmation.cancel}
          />
        )}
      </Dialog>
    </>
  );
}
