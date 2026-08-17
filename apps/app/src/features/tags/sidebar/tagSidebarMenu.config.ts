import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

export function buildTagSidebarMenu(): OverflowMenuItemConfig[] {
  return [{ id: 'change-icon', label: 'Change icon', icon: 'smile' }];
}
