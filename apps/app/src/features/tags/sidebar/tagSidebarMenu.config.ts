import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

/**
 * Same shape as buildNoteSidebarMenu's own rename entry — 'rename' is
 * never a menu action by itself, only the trigger that flips this row
 * into its existing inline-edit mode (Sidebar.Tags.tsx's onStartRename).
 */
export function buildTagSidebarMenu(): OverflowMenuItemConfig[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
    { id: 'change-icon', label: 'Change icon', icon: 'smile' },
  ];
}
