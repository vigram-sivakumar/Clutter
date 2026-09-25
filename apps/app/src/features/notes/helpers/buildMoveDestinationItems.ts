import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type {
  FolderPickerAncestor,
  FolderPickerItem,
} from '@components/folder-picker/FolderPicker.types';
import { getFolderDisplayLabel } from '@core/presentation/getFolderDisplayLabel';

/**
 * The one place a Move destination-picker's folder list is built — shared
 * by every Move entry point (Note and Folder, topbar and sidebar). Walks
 * exactly the same folder tree the sidebar renders (MembershipSelector.
 * getWorkspaceFolders/getVisibleChildFolders), which already excludes
 * everything Move's contract requires excluded, with no new filtering
 * logic needed here:
 *
 * - Reserved folders (Archive, Daily Notes, Inbox, Templates, .clutter)
 *   are never returned by getWorkspaceFolders() (root-level only, and
 *   these all have parentId === null but fail isSystemFolder's negation).
 * - An archived folder is relocated under Archive/ at archive time (ADR-
 *   026), so its parentId is no longer null and it is never enumerated by
 *   getWorkspaceFolders(); getVisibleChildFolders() independently refuses
 *   to descend into an effectively-archived folder, so nothing nested
 *   inside one can appear either.
 *
 * The vault root is deliberately never included as an item — it's the
 * implicit container, not a destination row (FolderPickerItem has no
 * concept of "this represents the root"). MoveDestinationPicker represents
 * "move to root" separately, outside FolderPicker's own list, via the
 * existing `null` destination contract every Move facade method already
 * accepts.
 *
 * `excludeFolderId`, when given (a folder being moved, never a page), is
 * the one exclusion this helper does add: the folder itself is omitted,
 * and recursion never descends into it, so none of its descendants can
 * appear — the picker-side half of "cannot move into itself or a
 * descendant" (FolderPathResolver.resolveMoveDestination enforces the
 * same rule at the resolver boundary; this is the picker not offering the
 * rejected choice in the first place, not the sole guard against it).
 */
export function buildMoveDestinationItems(
  membershipSelector: MembershipSelector,
  excludeFolderId?: string
): FolderPickerItem[] {
  const items: FolderPickerItem[] = [];

  function walk(
    folders: readonly Folder[],
    level: number,
    parentId: string | null,
    ancestors: FolderPickerAncestor[]
  ) {
    for (const folder of folders) {
      if (folder.id === excludeFolderId) {
        continue;
      }

      const label = getFolderDisplayLabel(folder);

      items.push({
        id: folder.id,
        title: label.text,
        level,
        parentId,
        emoji: folder.metadata.icon,
        ancestors: ancestors.length > 0 ? ancestors : undefined,
      });

      walk(
        membershipSelector.getVisibleChildFolders(folder.id),
        level + 1,
        folder.id,
        [...ancestors, { id: folder.id, title: label.text, emoji: folder.metadata.icon }]
      );
    }
  }

  walk(membershipSelector.getWorkspaceFolders(), 0, null, []);

  return items;
}

/**
 * The Resource-scoped counterpart to buildMoveDestinationItems — same
 * shared list every Move entry point already uses, plus the one addition
 * Resource Move specifically needs: the managed Assets/ folder as a
 * selectable destination. buildMoveDestinationItems deliberately excludes
 * it everywhere else (MembershipSelector.isWorkspaceFolder's own
 * `!isAssetsStorageFolder` filter — Assets/ isn't a normal Note/Folder
 * destination), but "move a resource into Assets/" is one of the required
 * destinations per the approved Resource Move design, so this appends it
 * back — as a plain root-level item, not by changing
 * isWorkspaceFolder/buildMoveDestinationItems for every other caller.
 *
 * If Assets/ hasn't been registered as a tracked Vault Folder yet (it's
 * lazily created — see ensureAssetsFolder), it simply isn't offered: this
 * never creates it speculatively just to populate a picker list.
 */
export function buildResourceMoveDestinationItems(
  membershipSelector: MembershipSelector,
  query: VaultQuery
): FolderPickerItem[] {
  const items = buildMoveDestinationItems(membershipSelector);
  const assetsFolder = query
    .getRootFolders()
    .find((folder) => membershipSelector.isAssetsStorageFolder(folder));

  if (!assetsFolder) {
    return items;
  }

  const label = getFolderDisplayLabel(assetsFolder);

  return [
    ...items,
    {
      id: assetsFolder.id,
      title: label.text,
      level: 0,
      parentId: null,
      emoji: assetsFolder.metadata.icon,
    },
  ];
}
