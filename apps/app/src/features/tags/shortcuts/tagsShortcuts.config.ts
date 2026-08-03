// 'create-tag' is rendered disabled: NavigationRouter.createTag() throws
// (no TagOperations facade exists yet — ADR-012/013/014's disposition,
// blocked on that aggregate existing). Kept visible rather than removed,
// same as Controls' placeholders, so the affordance isn't lost entirely —
// but it must never be clickable while it can only throw (see ADR-016's
// post-migration cleanup entry).
export const tagsShortcuts = [
  { id: 'create-tag', title: 'New', icon: 'plus', disabled: true },
] as const;

export type TagsShortcutId = (typeof tagsShortcuts)[number]['id'];
