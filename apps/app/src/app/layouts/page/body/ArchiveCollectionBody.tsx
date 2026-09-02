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
import { renderEntry } from './CollectionBody';
import type { CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';

import { PageBody } from './Page.Body';

export interface ArchiveCollectionBodyProps {
  vault: Vault;
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  resources: readonly VaultResource[];
  /** Only ever invoked for an image resource — see Resource.tsx. */
  onOpenImage?(resource: VaultResource): void;
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
  resolveWikiLink?: CompactMarkdownResolvers['resolveWikiLink'];
  resolveTag?: CompactMarkdownResolvers['resolveTag'];
}

/**
 * The page-body rendering for the Archive folder view — deliberately not a
 * `CollectionPageModel`/`CollectionBody` extension: that model is folder/
 * note-shaped, with no room for a resource's `kind` (image vs. pdf), the
 * exact same reasoning AssetsCollectionBody/TasksCollectionBody already
 * established for their own collections (see AssetsCollectionBody's doc
 * comment). Archive is the one collection that needs all three entry
 * shapes together, so this reuses both existing row renderers directly —
 * `renderEntry` (exported from CollectionBody, now accepting an optional
 * `actions` node) for folders/notes, and the sidebar's own `Resource`
 * component for resources — rather than introducing a fourth row
 * implementation for any of them.
 *
 * Every row here gets exactly two hover-only icon buttons (Restore,
 * Delete permanently) via the same reused `actions` slot
 * (Entry's existing hover-gated `.entry__actions`, the same slot
 * Folder.tsx's own "+" button already shares with its overflow menu — no
 * new hover mechanism). A folder/note row keeps its normal navigation
 * onClick (opening it still works, and its topbar Restore/Delete are
 * unchanged — this is an additional path to the same two operations, not
 * a replacement, per the approved UX decision); a resource row instead
 * uses Resource's own `archiveActions` prop (it already has no menu here —
 * unchanged from before).
 *
 * Delete's confirmation reuses the exact same useConfirmationSurface/
 * Confirmation/Dialog primitive every other archived-delete flow already
 * uses (ResourceTopBarActions/Sidebar.Notes.tsx) — one confirmation
 * mechanism, shared, not a per-type one. The message text is also reused
 * verbatim: PAGE_DELETE_CONFIRMATION_MESSAGE for notes/resources (a leaf,
 * no descendant count), getFolderDeleteConfirmation(vault, folderId) for
 * folders (its existing descendant-aware message — a folder can contain
 * other archived items, so its delete copy says so, same as the topbar's
 * own folder-delete confirmation already does).
 */
export function ArchiveCollectionBody({
  vault,
  folders = [],
  notes = [],
  resources,
  onOpenImage,
  onRestoreResource,
  onDeleteResource,
  onRestoreFolder,
  onDeleteFolder,
  onRestoreNote,
  onDeleteNote,
  resolveWikiLink,
  resolveTag,
}: ArchiveCollectionBodyProps) {
  const resolvers: CompactMarkdownResolvers = { resolveWikiLink, resolveTag };
  const confirmation = useConfirmationSurface();

  function requestDelete(title: string, message: string, onConfirm: () => void) {
    confirmation.request({ title, message, confirmLabel: 'Delete', onConfirm });
  }

  // Entry's own click handler already refuses to fire the row's onClick
  // when the click target is a nested <button> (see Entry.tsx's
  // interactive-descendant guard) — the same reason Resource.tsx's
  // archiveActions buttons (below) never needed stopPropagation either.
  // No new event-isolation mechanism here, folder/note rows included.
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

  return (
    <>
      <PageBody className="collection__content">
        {folders.map((entry) =>
          renderEntry(
            entry,
            resolvers,
            hoverActions(
              () => onRestoreFolder(entry.id),
              () =>
                requestDelete(
                  'Delete permanently?',
                  getFolderDeleteConfirmation(vault, entry.id).message,
                  () => onDeleteFolder(entry.id)
                )
            )
          )
        )}
        {notes.map((entry) =>
          renderEntry(
            entry,
            resolvers,
            hoverActions(
              () => onRestoreNote(entry.id),
              () =>
                requestDelete(
                  'Delete permanently?',
                  PAGE_DELETE_CONFIRMATION_MESSAGE,
                  () => onDeleteNote(entry.id)
                )
            )
          )
        )}
        {resources.map((resource) => (
          <Resource
            key={resource.id}
            resource={resource}
            onClick={onOpenImage}
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
