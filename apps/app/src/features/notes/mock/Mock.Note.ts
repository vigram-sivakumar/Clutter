import { Note } from '../models/Note';

// Note
export const notes: Note[] = [
  {
    id: 'meeting-notes',
    title: 'Weekly Design Sync',
    parentId: 'work',
    type: 'note',
    position: 0,
  },
  {
    id: 'ux-audit',
    title: 'UX Audit',
    parentId: 'work',
    type: 'note',
    position: 0,
  },
  {
    id: 'japan-trip',
    title: 'Japan Trip',
    parentId: 'travel',
    type: 'note',
    position: 0,
  },
  {
    id: 'packing-list',
    title: 'Packing List',
    parentId: 'travel',
    type: 'note',
    position: 0,
  },
  {
    id: 'reading-list',
    title: 'Reading List',
    parentId: 'personal',
    type: 'note',
    position: 0,
  },
  {
    id: 'daily-template',
    title: 'Daily Note Template',
    parentId: null,
    type: 'note',
    position: 0,
  },
];
