import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

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
  {
    id: 'assets',
    title: getSystemLocationPresentation('assets').label,
    icon: getSystemLocationPresentation('assets').icon,
  },
] as const satisfies readonly NavigationItem[];

export type NotesShortcutId = (typeof notesShortcuts)[number]['id'];
