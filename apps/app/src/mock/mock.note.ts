import { Icons } from '../design-system/icons';

export const notesNavigation = [
  { id: 'new-note', title: 'New note', icon: Icons.NotePencil },
  {
    id: 'all-notes',
    title: 'All notes',
    icon: Icons.Note,
  },
  { id: 'inbox', title: 'Unsorted', icon: Icons.Tray },
  { id: 'templates', title: 'Templates', icon: Icons.Template },
];

// Note
export interface NoteData {
  id: string;
  title: string;
  folderId: string | null;
}

export const notesData: NoteData[] = [
  {
    id: 'meeting-notes',
    title: 'Weekly Design Sync',
    folderId: 'work',
  },
  {
    id: 'ux-audit',
    title: 'UX Audit',
    folderId: 'work',
  },
  {
    id: 'japan-trip',
    title: 'Japan Trip',
    folderId: 'travel',
  },
  {
    id: 'packing-list',
    title: 'Packing List',
    folderId: 'travel',
  },
  {
    id: 'reading-list',
    title: 'Reading List',
    folderId: 'personal',
  },
  {
    id: 'daily-template',
    title: 'Daily Note Template',
    folderId: null,
  },
];

// Folder
export interface FolderData {
  id: string;
  title: string;
  parentId: string | null;
}

export const foldersData: FolderData[] = [
  { id: 'personal', title: 'Personal', parentId: null },
  { id: 'travel', title: 'Travel', parentId: 'personal' },
  { id: 'finance', title: 'Finance', parentId: 'personal' },
  { id: 'recipes', title: 'Recipes', parentId: 'personal' },

  { id: 'work', title: 'Work', parentId: null },
  { id: 'clutter', title: 'Clutter', parentId: 'work' },
  { id: 'design-system', title: 'Design System', parentId: 'work' },
  { id: 'research', title: 'Research', parentId: 'work' },

  { id: 'archive', title: 'Archive', parentId: null },

  { id: 'empty-folder', title: 'Empty Folder', parentId: 'travel' },

  { id: 'projects', title: 'Projects', parentId: null },
  { id: 'mobile-app', title: 'Mobile App', parentId: 'projects' },
  { id: 'prototype', title: 'Prototype', parentId: 'mobile-app' },
  { id: 'v2-concepts', title: 'V2 Concepts', parentId: 'prototype' },
];
