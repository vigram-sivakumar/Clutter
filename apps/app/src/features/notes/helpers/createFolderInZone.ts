import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { MovePickerZone } from '@core/vault/initialize/ReservedResources';

/**
 * The Move picker's "create a folder" handler for a zone (ADR-049): the new folder is made inside
 * the zone's own root — the vault root for the workspace, Templates or Assets for those sealed
 * hierarchies — so the folder the picker then selects is a destination the move will accept.
 * Still `FolderOperations.create`; only the parent differs. `undefined` when the zone's root
 * doesn't exist yet (the picker then offers no create row).
 */
export function createFolderInZone(
  folderOperations: Pick<FolderOperations, 'create'>,
  membershipSelector: Pick<MembershipSelector, 'getMoveZoneRoot'>,
  zone: MovePickerZone
): ((name: string) => Promise<string>) | undefined {
  if (zone === 'workspace') {
    return (name) => folderOperations.create(name, null);
  }

  const root = membershipSelector.getMoveZoneRoot(zone);

  return root ? (name) => folderOperations.create(name, root.id) : undefined;
}
