export const notesShortcuts = [
  { id: 'new-note', title: 'New note', icon: 'notePencil' },
  { id: 'inbox', title: 'Inbox', icon: 'tray' },
  { id: 'templates', title: 'Templates', icon: 'template' },
] as const;

export type NotesShortcutId = (typeof notesShortcuts)[number]['id'];
