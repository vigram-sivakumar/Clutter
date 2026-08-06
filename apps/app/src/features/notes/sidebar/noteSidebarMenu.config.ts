import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

/**
 * The sidebar row's overflow menu is deliberately narrower than
 * noteTopBarMenu.config.ts's topbar menu (no "Add a description",
 * "Duplicate", "Add to favorite", "Version history") — this milestone
 * scopes the sidebar menu to exactly the capabilities PageOperations
 * already backs for a Note: rename, archive, delete.
 *
 * A draft (no Vault entry yet) gets no menu items at all — capability-
 * driven, not disabled-and-shown (ADR-017 Decision item 9's "disabled,
 * not omitted" convention governs the topbar menu specifically, not this
 * sidebar surface). OverflowMenu itself renders nothing when given an
 * empty item list, so a draft row's overflow button simply doesn't
 * appear.
 */
export function buildNoteSidebarMenu(isDraft: boolean): OverflowMenuItemConfig[] {
  if (isDraft) {
    return [];
  }

  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil' },
    { id: 'archive', label: 'Archive', icon: 'archive' },
    { id: 'delete', label: 'Delete', icon: 'trash' },
  ];
}
