import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

/**
 * Same shape as buildNoteSidebarMenu's own rename entry — 'rename' is
 * never a menu action by itself, only the trigger that flips this row
 * into its existing inline-edit mode (Sidebar.Tags.tsx's onStartRename).
 */
export function buildTagSidebarMenu(isPinned: boolean = false): OverflowMenuItemConfig[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
    { id: 'change-icon', label: 'Change icon', icon: 'smile' },
    // Pinning a tag is the tag's `favorite` metadata (what the Pinned
    // grouping reads); the same item un-pins once it is pinned.
    { id: 'toggle-pin', label: isPinned ? 'Unpin' : 'Pin', icon: 'pin' },
    // Confirmed by the Tags panel (Sidebar.Tags.tsx) before TagOperations.deleteTag runs.
    { id: 'delete', label: 'Delete', icon: 'trash', separatorBefore: true },
  ];
}
