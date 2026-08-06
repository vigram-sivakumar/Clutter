/**
 * Centralized test ID constants.
 *
 * Components use these constants to annotate interactive elements with data-testid.
 * Tests import the same constants to locate elements reliably.
 *
 * This approach ensures test IDs are stable across design changes and gives us
 * one place to refactor selector strings if needed.
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
