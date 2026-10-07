import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

// 'create-tag' no longer dispatches through onShortcut/NavigationRouter —
// TagsShortcuts intercepts its click locally to open the New tag dialog,
// which creates a tag definition through TagOperations (the same shape
// 'create-task' uses). NavigationRouter.createTag() still throws and must
// stay unreachable from this button.
export const tagsShortcuts = [
  { id: 'create-tag', title: 'New', icon: 'plus', disabled: false },
  // Like 'create-tag', handled locally by TagsShortcuts: opens the Tidy up menu
  // (Remove unused, then one-time Style restyle) — never dispatched through
  // NavigationRouter, and nothing it does is remembered.
  { id: 'tidy-up', title: 'Tidy up', icon: 'brush', disabled: false },
] as const satisfies readonly NavigationItem[];

export type TagsShortcutId = (typeof tagsShortcuts)[number]['id'];
