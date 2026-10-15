import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Folder } from '@core/vault/models/Folder';
import type { MovePickerZone } from '@core/vault/initialize/ReservedResources';
import {
  ROOT_DESTINATION_ID,
  type PickerListAncestor,
  type PickerListItem,
} from '@components/picker-list/PickerList.types';
import { getFolderDisplayLabel } from '@core/presentation/getFolderDisplayLabel';
import { getVaultDisplayName } from '@core/presentation/getVaultDisplayName';
import { getSystemLocationIconForFolder } from '@core/presentation/systemPresentation';
import { DROP_ZONE_ACCEPTS } from '@features/notes/sidebar/dropTarget';

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
 * The vault root is included as the first item, with id ROOT_DESTINATION_ID, only when a folder is
 * being moved (`excludeFolderId` given): a folder may move to the root, a note may not.
 * Its `title` is the vault's own physical folder name — getVaultDisplayName
 * (membershipSelector.vaultRoot), the exact same function the sidebar's
 * root-folders section title reads (Sidebar.Notes.tsx), so there is one
 * source of truth for "what is the vault root called," never a separate
 * hardcoded name here. Its `secondaryLabel` is "Home", rendered in the row's trailing slot
 * next to the title in PickerList's existing muted/small-text styling.
 * MoveDestinationPicker is the one place that recognizes that sentinel id
 * and translates it back to the `null` destination every Move facade
 * method already accepts.
 *
 * The Inbox, when it exists (it is created when a note first lands there), is offered first among the
 * pinned rows — above Templates — but only for a note: it accepts notes only, the same rule the sidebar's
 * Inbox drop target reads (DROP_ZONE_ACCEPTS), so a folder's list never carries it. Moving there is the
 * ordinary move to that folder's id.
 *
 * `zone` (ADR-049) picks the root: `'workspace'` (default) is the vault root, then Templates (an
 * ordinary destination: moving in makes a template, moving out makes an ordinary item again) with
 * its folders, then the ordinary folders; `'assets'` is the Assets hierarchy — its own root row first (the one the picker pins,
 * like the vault root), then only folders inside it. An Asset moves only within Assets, and nothing
 * else is offered it.
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
  excludeFolderId?: string,
  zone: MovePickerZone = 'workspace',
  // A non-Move caller of this folder walk (the cover picker) has no use for the Templates entry.
  {
    includeTemplates = true,
    includeInbox = true,
  }: { readonly includeTemplates?: boolean; readonly includeInbox?: boolean } = {}
): PickerListItem[] {
  const items: PickerListItem[] = [];
  let startFolders: readonly Folder[];
  let startAncestors: PickerListAncestor[] = [];
  let pinnedAfterRoot: { folder: Folder; ancestors: PickerListAncestor[] } | undefined;

  if (zone === 'workspace') {
    // A folder may be moved to the vault root; a note may not. `excludeFolderId` is only ever
    // given for a folder being moved, so its absence means a note (or other non-folder) move.
    if (excludeFolderId !== undefined) {
      items.push({
        id: ROOT_DESTINATION_ID,
        title: getVaultDisplayName(membershipSelector.vaultRoot),
        secondaryLabel: 'Home',
        isRoot: true,
        level: 0,
        parentId: null,
      });
    }
    // Inbox leads the pinned rows, for a note only (`excludeFolderId` is only ever given for a folder).
    const inbox = includeInbox ? membershipSelector.getInboxFolder() : undefined;
    const movingKind = excludeFolderId === undefined ? 'note' : 'folder';

    if (inbox && DROP_ZONE_ACCEPTS.inbox.includes(movingKind)) {
      items.push({
        id: inbox.id,
        title: getFolderDisplayLabel(inbox).text,
        isRoot: true,
        icon: getSystemLocationIconForFolder(inbox, membershipSelector),
        level: 0,
        parentId: null,
      });
    }

    // Templates sits directly below the vault root, whatever its alphabetical place. It exists only
    // once a first template has been made (ADR-030), so it is offered only then.
    const templates = includeTemplates ? membershipSelector.getTemplatesFolder() : undefined;

    if (templates && templates.id !== excludeFolderId) {
      const label = getFolderDisplayLabel(templates);

      items.push({
        id: templates.id,
        title: label.text,
        isRoot: true,
        icon: getSystemLocationIconForFolder(templates, membershipSelector),
        level: 0,
        parentId: null,
      });
      pinnedAfterRoot = {
        folder: templates,
        ancestors: [{ id: templates.id, title: label.text, emoji: templates.metadata.icon }],
      };
    }

    startFolders = membershipSelector.getWorkspaceFolders();
  } else {
    // The Assets hierarchy (ADR-049): its own root takes the vault root's place, and nothing outside
    // it is offered. The same picker renders it; selecting the root is selecting that folder.
    const root = membershipSelector.getMoveZoneRoot(zone);

    if (!root) {
      return items;
    }

    const label = getFolderDisplayLabel(root);

    items.push({
      id: root.id,
      title: label.text,
      isRoot: true,
      emoji: root.metadata.icon,
      icon: getSystemLocationIconForFolder(root, membershipSelector),
      level: 0,
      parentId: null,
    });
    startFolders = membershipSelector.getVisibleChildFolders(root.id);
    startAncestors = [{ id: root.id, title: label.text, emoji: root.metadata.icon }];
  }

  function walk(
    folders: readonly Folder[],
    level: number,
    parentId: string | null,
    ancestors: PickerListAncestor[]
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

  if (pinnedAfterRoot) {
    walk(
      membershipSelector.getVisibleChildFolders(pinnedAfterRoot.folder.id),
      1,
      pinnedAfterRoot.folder.id,
      pinnedAfterRoot.ancestors
    );
  }

  walk(startFolders, zone === 'workspace' ? 0 : 1, zone === 'workspace' ? null : (items[0]?.id ?? null), startAncestors);

  return items;
}
