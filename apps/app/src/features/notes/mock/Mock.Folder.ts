import { Folder } from '../models/Folder';

// Folder
export const folders: Folder[] = [
  {
    id: 'personal',
    title: 'Personal',
    parentId: null,
    type: 'folder',
    position: 0,
  },
  {
    id: 'travel',
    title: 'Travel',
    parentId: 'personal',
    type: 'folder',
    position: 0,
  },
  {
    id: 'finance',
    title: 'Finance',
    parentId: 'personal',
    type: 'folder',
    position: 0,
  },
  {
    id: 'recipes',
    title: 'Recipes',
    parentId: 'personal',
    type: 'folder',
    position: 0,
  },

  { id: 'work', title: 'Work', parentId: null, type: 'folder', position: 0 },
  {
    id: 'clutter',
    title: 'Clutter',
    parentId: 'work',
    type: 'folder',
    position: 0,
  },
  {
    id: 'design-system',
    title: 'Design System',
    parentId: 'work',
    type: 'folder',
    position: 0,
  },
  {
    id: 'research',
    title: 'Research',
    parentId: 'work',
    type: 'folder',
    position: 0,
  },

  {
    id: 'archive',
    title: 'Archive',
    parentId: null,
    type: 'folder',
    position: 0,
  },

  {
    id: 'empty-folder',
    title: 'Empty Folder',
    parentId: 'travel',
    type: 'folder',
    position: 0,
  },

  {
    id: 'projects',
    title: 'Projects',
    parentId: null,
    type: 'folder',
    position: 0,
  },
  {
    id: 'mobile-app',
    title: 'Mobile App',
    parentId: 'projects',
    type: 'folder',
    position: 0,
  },
  {
    id: 'prototype',
    title: 'Prototype',
    parentId: 'mobile-app',
    type: 'folder',
    position: 0,
  },
  {
    id: 'v2-concepts',
    title: 'V2 Concepts',
    parentId: 'prototype',
    type: 'folder',
    position: 0,
  },
];
