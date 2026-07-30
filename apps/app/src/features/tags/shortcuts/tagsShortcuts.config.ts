export const tagsShortcuts = [
  { id: 'create-tag', title: 'Create tag', icon: 'plus' },
  { id: 'all-tag', title: 'All tag', icon: 'tag' },
] as const;

export type TagsShortcutId = (typeof tagsShortcuts)[number]['id'];
