import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

/**
 * 'archive' is deliberately absent — FolderOperations has no archive
 * concept anywhere in the frozen architecture (ADR-024: "a permanent
 * impossibility, not a deferred one"), the same reason
 * folderTopBarMenu.config.ts omits it. The sidebar menu is
 * capability-driven, not resource-type-driven: it shows exactly what
 * FolderOperations backs today (rename, delete), not a parity-shaped
 * placeholder. Every folder FolderTree renders is already non-reserved
 * (MembershipSelector.getWorkspaceFolders/query.getChildFolders never
 * surface a system folder here), so no reserved-folder guard is needed.
 */
export const folderSidebarMenu: OverflowMenuItemConfig[] = [
  { id: 'rename', label: 'Rename', icon: 'notePencil' },
  { id: 'delete', label: 'Delete', icon: 'trash' },
];
