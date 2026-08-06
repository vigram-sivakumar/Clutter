/**
 * The application's public automation contract — stable `data-testid`
 * selectors that components annotate and packages/automation locates
 * elements by.
 *
 * This is not developer tooling (see ../../../devtools/ for that): it's
 * owned by the application itself, deliberately outside devtools/, so the
 * dependency direction stays one-way — packages/automation imports this
 * file, never the reverse, and production code never imports anything
 * from packages/automation.
 *
 * Naming convention: {surface}.{element} (e.g., sidebar.createFolderButton)
 * where "surface" is the logical UI area (sidebar, editor, navigation).
 */

export const testIds = {
  // Sidebar
  sidebar: {
    root: 'sidebar',
    createFolderButton: 'sidebar.createFolderButton',
    createNoteButton: 'sidebar.createNoteButton',
    folderItem: (folderId: string) => `sidebar.folderItem.${folderId}`,
    noteItem: (pageId: string) => `sidebar.noteItem.${pageId}`,
    folderContextMenu: (folderId: string) => `sidebar.folderContextMenu.${folderId}`,
    noteContextMenu: (pageId: string) => `sidebar.noteContextMenu.${pageId}`,
    expandFolder: (folderId: string) => `sidebar.expandFolder.${folderId}`,
    tab: (tabId: string) => `sidebar.tab.${tabId}`,
  },

  // Editor
  editor: {
    root: 'editor',
    activeNote: 'editor.activeNote',
    titleInput: 'editor.titleInput',
    bodyContent: 'editor.bodyContent',
    autoSaveIndicator: 'editor.autoSaveIndicator',
  },

  // Navigation / Header
  navigation: {
    root: 'navigation',
    activePageLabel: 'navigation.activePageLabel',
    backButton: 'navigation.backButton',
    forwardButton: 'navigation.forwardButton',
  },

  // Search / Quick Find
  search: {
    root: 'search',
    input: 'search.input',
    resultsList: 'search.resultsList',
    resultItem: (pageId: string) => `search.resultItem.${pageId}`,
  },

  // Settings / Preferences
  settings: {
    root: 'settings',
    openSettingsButton: 'settings.openSettingsButton',
    closeButton: 'settings.closeButton',
  },

  // Dialogs / Modals
  dialogs: {
    confirmDeleteButton: 'dialogs.confirmDeleteButton',
    cancelDeleteButton: 'dialogs.cancelDeleteButton',
    renameInput: 'dialogs.renameInput',
    confirmRenameButton: 'dialogs.confirmRenameButton',
  },
} as const;

/**
 * Type-safe test ID lookup. Use this to ensure test IDs exist at compile time.
 * Example: getAttribute(testIds.sidebar.createFolderButton)
 */
export type TestId = typeof testIds[keyof typeof testIds][keyof (typeof testIds)[keyof typeof testIds]];
