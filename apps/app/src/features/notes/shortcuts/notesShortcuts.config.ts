export const notesShortcuts = [
  { id: 'new-note', title: 'New', icon: 'plus' },
  { id: 'inbox', title: 'Inbox', icon: 'tray' },
  { id: 'templates', title: 'Templates', icon: 'template' },
] as const;

export type NotesShortcutId = (typeof notesShortcuts)[number]['id'];
