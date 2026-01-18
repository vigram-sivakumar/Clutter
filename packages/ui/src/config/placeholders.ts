/**
 * Application-wide Placeholders & Empty States
 *
 * Single source of truth for all placeholder text, empty state messages,
 * default names, and helper text throughout the application.
 *
 * Categories:
 * - Sidebar empty states
 * - Page view empty states
 * - Input placeholders
 * - Default names
 * - Keyboard shortcuts
 */

// ============================================================================
// SIDEBAR EMPTY STATES
// ============================================================================

export const SIDEBAR_EMPTY_STATES = {
  // --- Notes Tab ---
  favouritesNotes: {
    message: 'Press',
    shortcut: ['⌘ N'],
    suffix: 'to create note.',
  },
  folders: {
    message: 'Press',
    shortcut: ['⌘', 'N'],
    suffix: 'to create note.',
  },
  cluttered: {
    message: 'Press',
    shortcut: ['⌘', 'N'],
    suffix: 'to create note.',
  },

  // --- Calendar Tab ---
  dailyNotes: {
    message: 'Press',
    shortcut: ['⇧', '⌃', 'D'],
    suffix: "to open Today's note.",
  },

  // --- Tasks Tab ---
  today: {
    message: "You're all clear for today 🧹. Press",
    shortcut: ['⌘', 'T'],
    suffix: 'to create a new task.',
  },
  overdue: {
    message: 'Press',
    shortcut: ['⌘', 'T'],
    suffix: 'to create a new task.',
  },
  upcoming: {
    message: 'Press',
    shortcut: ['⌘', 'T'],
    suffix: 'to create a new task.',
  },
  someday: {
    message: 'Press',
    shortcut: ['⌘', 'T'],
    suffix: 'to create a new task.',
  },
  completed: {
    message: 'No completed tasks yet',
    shortcut: null,
    suffix: null,
  },

  // --- Tags Tab ---
  favouriteTags: {
    message: 'No favourite tags yet. Press',
    shortcut: ['⌘ ⇧ T'],
    suffix: 'to create a new tag.',
  },
  allTags: {
    message: 'No tags yet. Press',
    shortcut: ['⌘ ⇧ T'],
    suffix: 'to create a new tag.',
  },
} as const;

// ============================================================================
// PAGE VIEW EMPTY STATES
// ============================================================================

export const PAGE_EMPTY_STATES = {
  // --- Favourites Page ---
  favouritesPage: 'No favourites yet.',

  // --- All Folders Page ---
  allFoldersPage: 'No folders yet',

  // --- Folder Views ---
  folderNoNotes: 'No notes in this folder',
  folderNoNotesInMonth: 'No notes in this month',
  folderIsEmpty: {
    message: 'Folder is empty. Press',
    shortcut: ['⌘', 'N'],
    suffix: 'to create a new note.',
  },

  // --- Tag Views ---
  tagNoContent: 'No folders or notes with this tag',
  allTagsPage: 'No tags yet.',
  favouriteTagsPage: 'No favourite tags yet.',

  // --- Daily Notes ---
  dailyNotesYear: (year: string) => `No daily notes in ${year}`,
  dailyNotesMonth: (month: string, year: string) =>
    `No daily notes in ${month} ${year}`,

  // --- Task Views ---
  todayTasksPage: "You're all clear for today.",
  upcomingTasksPage: 'Nothing scheduled ahead.',
  somedayTasksPage: 'Ideas for later go here.',
  completedTasksPage: 'No completed tasks yet',
  overdueTasksPage: 'No overdue tasks',

  // --- Deleted Items ---
  deletedItemsPage: 'No deleted items',
} as const;

// ============================================================================
// INPUT PLACEHOLDERS
// ============================================================================

export const INPUT_PLACEHOLDERS = {
  // --- Page Titles ---
  noteTitle: 'Untitled',
  folderTitle: 'Untitled Folder',
  tagTitle: 'Untitled Tag',

  // --- Editor ---
  editorDefault: 'Start writing...',
  editorDaily: 'What happened today?',
  editorTask: 'Task content...',

  // --- Search & URL ---
  search: 'Search...',
  searchNotes: 'Search notes...',
  searchTags: 'Search tags...',
  urlInput: 'Enter URL...',

  // --- Tags ---
  tagInput: 'Add tags...',
  tagSearch: 'Search or create tags...',

  // --- Other ---
  description: 'Add a description...',
  emoji: 'Search emoji...',
} as const;

// ============================================================================
// DEFAULT NAMES (for creation)
// ============================================================================

export const DEFAULT_NAMES = {
  // Base names
  note: 'Untitled',
  folder: 'Untitled Folder',
  tag: 'Untitled Tag',

  // Helper functions for numbered defaults
  noteWithNumber: (n: number) => `Untitled ${n}`,
  folderWithNumber: (n: number) => `Untitled Folder ${n}`,
  tagWithNumber: (n: number) => `Untitled Tag ${n}`,

  // Display helpers (for showing in UI)
  getNoteName: (title?: string | null) => title || 'Untitled',
  getFolderName: (name?: string | null) => name || 'Untitled Folder',
  getTagName: (name?: string | null) => name || 'Untitled Tag',
} as const;

// ============================================================================
// KEYBOARD SHORTCUTS (for empty states)
// ============================================================================

export const EMPTY_STATE_SHORTCUTS = {
  createTask: {
    keys: ['⌘', 'T'],
    text: 'Create a task with',
  },
  createNote: {
    keys: ['⌘', 'N'],
    text: 'Create a note with',
  },
  createTag: {
    keys: ['⌘', '⇧', 'T'],
    text: 'Create a tag with',
  },
  search: {
    keys: ['⌘', 'K'],
    text: 'Search with',
  },
} as const;

// ============================================================================
// CONFIRMATION MESSAGES
// ============================================================================

export const CONFIRMATIONS = {
  deleteFolder: (name: string) => `Delete "${name}"?`,
  deleteFolderWithNotes: (name: string, count: number) =>
    `Delete "${name}" and ${count} note${count === 1 ? '' : 's'}?`,
  deleteNote: (title?: string) => `Delete "${title || 'Untitled'}"?`,
  deleteTag: (tag: string) => `Delete "${tag}"?`,
  deleteMultipleItems: (count: number) => `Delete ${count} items?`,
} as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a unique name by appending a number if needed
 */
export function getUniqueName(
  baseName: string,
  existingNames: string[],
  startNumber = 1
): string {
  if (!existingNames.some((n) => n.toLowerCase() === baseName.toLowerCase())) {
    return baseName;
  }

  let counter = startNumber;
  let uniqueName = `${baseName} ${counter}`;

  while (
    existingNames.some((n) => n.toLowerCase() === uniqueName.toLowerCase())
  ) {
    counter++;
    uniqueName = `${baseName} ${counter}`;
  }

  return uniqueName;
}

/**
 * Check if a name is an untitled default
 */
export function isUntitled(name?: string | null): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase();
  return (
    normalized === 'untitled' ||
    normalized === 'untitled folder' ||
    normalized === 'untitled tag' ||
    /^untitled( folder| tag)? \d+$/.test(normalized)
  );
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SidebarEmptyStateKey = keyof typeof SIDEBAR_EMPTY_STATES;
export type PageEmptyStateKey = keyof typeof PAGE_EMPTY_STATES;
export type InputPlaceholderKey = keyof typeof INPUT_PLACEHOLDERS;
export type DefaultNameKey = keyof typeof DEFAULT_NAMES;
export type EmptyStateShortcutKey = keyof typeof EMPTY_STATE_SHORTCUTS;
