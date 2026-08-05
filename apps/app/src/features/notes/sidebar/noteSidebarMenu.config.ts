import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

/**
 * The sidebar row's overflow menu is deliberately narrower than
 * noteTopBarMenu.config.ts's topbar menu (no "Add a description",
 * "Duplicate", "Add to favorite", "Version history") — this milestone
 * scopes the sidebar menu to exactly the capabilities PageOperations
 * already backs for a Note: rename, archive, delete. A draft (no Vault
 * entry yet) can still be renamed (PageOperations.updateDraftTitle), but
 * archive/delete don't apply until it's persisted — disabled, not
 * omitted, matching ADR-017 Decision item 9's existing convention.
 */
export function buildNoteSidebarMenu(isDraft: boolean): OverflowMenuItemConfig[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil' },
    { id: 'archive', label: 'Archive', icon: 'archive', disabled: isDraft },
    { id: 'delete', label: 'Delete', icon: 'trash', disabled: isDraft },
  ];
}
