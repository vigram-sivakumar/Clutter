import { Button } from '@components/button/Button';
import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { Dialog } from '@components/dialog/Dialog';
import { AppIcon } from '@shared/icon';
import { PAGE_DELETE_CONFIRMATION_MESSAGE } from '@features/notes/helpers/folderActionConfirmation';
import { Resource } from '@features/notes/sidebar/Resource';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import {
  renderFolderGrid,
  renderNoteList,
  renderNoteTable,
  NOTE_SORT_OPTIONS,
} from './CollectionBody';

import type { PropertyId } from '@core/properties/collectionProperties';
import { sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import { ARCHIVE_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';

import { PageBody } from './Page.Body';

export interface ArchiveCollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  viewMode?: CollectionLayout;
  /** The visible properties, from the resolved view — the Archive's own, which include Archived. */
  visible?: readonly PropertyId[];
  sort?: CollectionSort;
  resources: readonly VaultResource[];
  /** Invoked for both resource kinds (image, pdf) — see Resource.tsx. */
  onOpenResource?(resource: VaultResource): void;
  onRestoreResource(resourceId: string): void;
  onDeleteResource(resourceId: string): void;
}

/** What the body shows when the page does not say: the Archive's resolved defaults, read from its definition. */
const DEFAULT_VIEW = resolveCollectionView(ARCHIVE_COLLECTION);

/**
 * The page-body rendering for the Archive folder view — folders/notes
 * render through the exact same components every other collection page
 * uses (renderFolderGrid/renderNoteList/renderNoteTable, exported from
 * CollectionBody, one rendering per entry shape, not a second
 * implementation): folders always as generic cards in their grid, notes via
 * the generic CollectionDataList (List) or CollectionDataTable (Table) — same
 * "folders don't switch with viewMode" rule CollectionBody itself follows.
 * A folder or note is restored or deleted from its own page (the topbar) once
 * opened; the rows carry no inline actions. Resources (images/PDFs) stay on the
 * sidebar's own `Resource` row component regardless of viewMode —
 * CollectionEntryModel is folder/note-shaped, with no room for a
 * resource's `kind`, the same reasoning AssetsCollectionBody/
 * TasksCollectionBody already established for their own collections. A
 * resource row uses Resource's own `archiveActions` prop (Restore, Delete
 * permanently); Delete's confirmation reuses the exact same
 * useConfirmationSurface/Confirmation/Dialog primitive every other
 * archived-delete flow already uses.
 */
export function ArchiveCollectionBody({
  folders = [],
  notes = [],
  viewMode = DEFAULT_VIEW.layout,
  visible = DEFAULT_VIEW.visible,
  sort = DEFAULT_VIEW.sort,
  resources,
  onOpenResource,
  onRestoreResource,
  onDeleteResource,
}: ArchiveCollectionBodyProps) {
  const confirmation = useConfirmationSurface();

  function requestDelete(title: string, message: string, onConfirm: () => void) {
    confirmation.request({ title, message, confirmLabel: 'Delete', onConfirm });
  }

  // The Resource row's click handling already refuses to fire when the click
  // target is a nested <button> (the same interactive-descendant guard every
  // activatable row shares), so these buttons need no stopPropagation.
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

  const sortedFolders = sortEntries(folders, sort, NOTE_SORT_OPTIONS);
  const sortedNotes = sortEntries(notes, sort, NOTE_SORT_OPTIONS);

  return (
    <>
      <PageBody className="collection__content">
        {sortedFolders.length > 0 && renderFolderGrid(sortedFolders)}
        {viewMode === 'table' ? (
          renderNoteTable(sortedNotes, visible)
        ) : (
          renderNoteList(sortedNotes, visible)
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
