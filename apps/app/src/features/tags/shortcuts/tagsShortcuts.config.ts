export const tagsShortcuts = [
  { id: 'create-tag', title: 'Create tag', icon: 'plus' },
] as const;

export type TagsShortcutId = (typeof tagsShortcuts)[number]['id'];
