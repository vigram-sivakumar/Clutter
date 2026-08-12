import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type { FolderMetadata } from '@core/vault/models/FolderMetadata';

/**
 * 'archive' is status-dependent (ADR-026): shown for an active folder,
 * omitted for an already-archived one (restore isn't implemented yet —
 * ADR-026's implementation-sequencing amendment — so there is no
 * alternative action to show in its place). The sidebar menu is otherwise
 * capability-driven, not resource-type-driven: it shows exactly what
 * FolderOperations backs today (rename, archive, delete), not a
 * parity-shaped placeholder. Folders are never duplicable — Duplicate is
 * a Note-only capability. Every folder FolderTree
 * renders is already non-reserved (MembershipSelector.getWorkspaceFolders/
 * query.getChildFolders never surface a system folder here), so no
 * reserved-folder guard is needed.
 */
export function buildFolderSidebarMenu(
  status: FolderMetadata['status']
): OverflowMenuItemConfig[] {
  const items: OverflowMenuItemConfig[] = [
    { id: 'rename', label: 'Rename', icon: 'notePencil' },
  ];

  if (status !== 'archived') {
    items.push({ id: 'archive', label: 'Archive', icon: 'archive' });
  }

  items.push({ id: 'delete', label: 'Delete', icon: 'trash' });

  return items;
}
