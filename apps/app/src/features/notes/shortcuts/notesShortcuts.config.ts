import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

export const notesShortcuts = [
  { id: 'new-note', title: 'New', icon: 'plus' },
  {
    id: 'inbox',
    title: getSystemLocationPresentation('inbox').label,
    icon: getSystemLocationPresentation('inbox').icon,
  },
  {
    id: 'templates',
    title: getSystemLocationPresentation('templates').label,
    icon: getSystemLocationPresentation('templates').icon,
  },
] as const;

export type NotesShortcutId = (typeof notesShortcuts)[number]['id'];
