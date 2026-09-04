import { useState } from 'react';

import { PageBody } from './Page.Body';
import { Resource } from '@features/notes/sidebar/Resource';
import { buildResourceSidebarMenu } from '@features/notes/sidebar/resourceSidebarMenu.config';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';

export interface AssetsCollectionBodyProps {
  readonly resources: readonly VaultResource[];
  /** Only ever invoked for an image resource — see Resource.tsx. */
  readonly onOpenImage?: (resource: VaultResource) => void;
  /**
   * ResourceOperations.renameResource(resourceId, name) — the caller's
   * job, not this component's, per rule 11 (UI never imports a concrete
   * application-layer class directly). `name` is the extension-free stem
   * Resource.tsx's own EditableText already produces; the resource's
   * current parent is preserved automatically by the Gate/MoveService,
   * never recomputed here.
   */
  readonly onRenameResource: (resourceId: string, name: string) => void;
  /** ResourceOperations.archiveResource(resourceId) — same reasoning. */
  readonly onArchiveResource: (resourceId: string) => void;
  /**
   * Exports a copy of an image resource's original file via the native Save
   * dialog (`downloadResource.ts`) — same read-only-from-the-Vault's-
   * perspective reasoning as the sidebar's own SidebarRowActions.
   * onDownloadResource (FolderTree.tsx). Only ever dispatched for an image
   * resource — buildResourceSidebarMenu only renders the item for
   * `resource.kind === 'image'`.
   */
  readonly onDownloadResource: (resourceId: string) => void;
  /**
   * The same shared destination list the sidebar's own resource row uses
   * (buildResourceMoveDestinationItems), computed by the caller — this
   * component never builds its own list, same reasoning onRenameResource/
   * onArchiveResource above already establish.
   */
  readonly resourceMoveDestinations: FolderPickerItem[];
  /** ResourceOperations.moveResource(resourceId, destinationFolderId) — same reasoning. */
  readonly onMoveResource: (resourceId: string, destinationFolderId: string | null) => void;
  /** FolderOperations.create(name, null) — the Move picker's own "Create ..." row. */
  readonly onCreateFolder: (name: string) => Promise<string>;
}

/**
 * The page-body rendering for the Assets collection view — deliberately
 * not a CollectionBody variant, the same reasoning TasksCollectionBody
 * already established: CollectionEntryModel is folder/note-shaped, with no
 * room for `kind` (image vs. pdf), so forcing resources through it would
 * repeat the mistake ADR-022 already rejected one layer over. Instead this
 * reuses the sidebar's own Resource row component directly, the same way
 * CollectionBody reuses Note/Folder — one row rendering per resource
 * shape, never two.
 *
 * Assets is the logical collection (every visible, non-archived
 * VaultResource anywhere in the vault — MembershipSelector.
 * getAllVisibleResources(), computed by the caller, never here), not "files
 * physically inside Assets/" — this component has no opinion about where a
 * resource lives and never filters by path itself.
 *
 * Rename/Move/Archive reuse the exact same menu (buildResourceSidebarMenu)
 * and rename-editing/Move-picker wiring (Resource's isEditing/onTitleCommit/
 * onTitleEditingEnd/moveDestinations/onMove) the sidebar's own ResourceRow
 * (FolderTree.tsx) already uses — this component owns only its own local
 * "which row's menu/rename session is active" state (mirroring
 * Sidebar.Notes.tsx's openMenuId/editingId, scoped to this list the same
 * way FavoriteList's favoriteOpenMenuId is scoped to its own), never a
 * second implementation of the menu/rename/Move mechanism itself. No
 * Restore/Delete/Favorites here — those are Archive-only
 * (ArchiveCollectionBody), never reachable from a normal, non-archived
 * resource row.
 */
export function AssetsCollectionBody({
  resources,
  onOpenImage,
  onRenameResource,
  onArchiveResource,
  onDownloadResource,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
}: AssetsCollectionBodyProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <PageBody className="collection__content">
      {resources.map((resource) => {
        const isEditing = editingId === resource.id;

        return (
          <Resource
            key={resource.id}
            resource={resource}
            onClick={isEditing ? undefined : onOpenImage}
            isEditing={isEditing}
            onTitleCommit={(value) => onRenameResource(resource.id, value)}
            onTitleEditingEnd={() => setEditingId(null)}
            menuItems={buildResourceSidebarMenu(resource.kind)}
            menuOpen={openMenuId === resource.id}
            onMenuOpenChange={(open) => setOpenMenuId(open ? resource.id : null)}
            onMenuSelect={(id) => {
              if (id === 'rename') {
                setOpenMenuId(null);
                setEditingId(resource.id);
              } else if (id === 'archive') {
                onArchiveResource(resource.id);
              } else if (id === 'download') {
                onDownloadResource(resource.id);
              }
            }}
            moveDestinations={resourceMoveDestinations}
            onMove={(destinationFolderId) => onMoveResource(resource.id, destinationFolderId)}
            onCreateFolder={onCreateFolder}
          />
        );
      })}
    </PageBody>
  );
}
