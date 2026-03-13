/**
 * UI State Store
 * Manages persistent UI preferences and state across app sessions
 * Uses Zustand with localStorage persistence (will be migrated to SQLite for desktop)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Main view type for navigation
 */
export type MainView =
  | { type: 'editor'; source?: 'deletedItems' | 'default' }
  | { type: 'tagFilter'; tag: string; source: 'all' | 'favorites' }
  | {
      type: 'folderView';
      folderId: string;
      source?: 'deletedItems' | 'default';
    }
  | { type: 'allFoldersView' }
  | { type: 'favouritesView' }
  | { type: 'allTagsView' }
  | { type: 'favouriteTagsView' }
  | { type: 'allTasksView' }
  | { type: 'todayTasksView' }
  | { type: 'overdueTasksView' }
  | { type: 'upcomingTasksView' }
  | { type: 'unplannedTasksView' }
  | { type: 'completedTasksView' }
  | { type: 'deletedItemsView' }
  | { type: 'dailyNotesYearView'; year: string } // View all months in a specific year
  | { type: 'dailyNotesMonthView'; year: string; month: string }; // View all notes in a specific month

interface UIStateStore {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarTab: 'notes' | 'tasks' | 'tags' | 'task';

  // Notes tab - section collapse states
  clutteredCollapsed: boolean;
  dailyNotesCollapsed: boolean;
  favouritesCollapsed: boolean;
  foldersCollapsed: boolean;

  // Notes tab - folder expansion
  openFolderIds: Set<string>;

  // Daily Notes - year/month group collapse states (main list view)
  // Stores keys like "2026" for years or "2026-January" for months
  collapsedDailyNoteGroups: Set<string>;

  // Daily Notes - year/month group collapse states (sidebar)
  // Independent from main list view collapse states
  sidebarCollapsedDailyNoteGroups: Set<string>;

  // Notes tab - manual toggle tracking
  hasManuallyToggledCluttered: boolean;
  hasManuallyToggledDailyNotes: boolean;
  hasManuallyToggledFavourites: boolean;
  hasManuallyToggledFolders: boolean;

  // Task tab (new organized view) - section collapse states
  taskTodayCollapsed: boolean;
  taskOverdueCollapsed: boolean;
  taskUpcomingCollapsed: boolean;
  taskUnplannedCollapsed: boolean;
  taskCompletedCollapsed: boolean;

  // Tags tab
  allTagsCollapsed: boolean;
  favouriteTagsCollapsed: boolean;

  // Calendar
  calendarWeekStart: string; // ISO date string

  // Navigation
  mainView: MainView;
  lastNoteId: string | null;

  // Editor
  editorFullWidth: boolean;

  // Per-view collapse states
  folderViewSubfoldersCollapsed: boolean;
  folderViewNotesCollapsed: boolean;
  deletedItemsFoldersCollapsed: boolean;
  deletedItemsNotesCollapsed: boolean;

  // Actions
  setSidebarCollapsed: (_collapsed: boolean) => void;
  setSidebarWidth: (_width: number) => void;
  setSidebarTab: (_tab: 'notes' | 'tasks' | 'tags' | 'task') => void;

  setClutteredCollapsed: (_collapsed: boolean) => void;
  setDailyNotesCollapsed: (_collapsed: boolean) => void;
  setFavouritesCollapsed: (_collapsed: boolean) => void;
  setFoldersCollapsed: (_collapsed: boolean) => void;

  setOpenFolderIds: (_ids: Set<string>) => void;
  toggleFolderOpen: (_folderId: string) => void;

  setCollapsedDailyNoteGroups: (_groups: Set<string>) => void;
  toggleDailyNoteGroupCollapsed: (_groupKey: string) => void;
  isDailyNoteGroupCollapsed: (_groupKey: string) => boolean;

  setSidebarCollapsedDailyNoteGroups: (_groups: Set<string>) => void;
  toggleSidebarDailyNoteGroupCollapsed: (_groupKey: string) => void;
  isSidebarDailyNoteGroupCollapsed: (_groupKey: string) => boolean;

  setHasManuallyToggledCluttered: (_toggled: boolean) => void;
  setHasManuallyToggledDailyNotes: (_toggled: boolean) => void;
  setHasManuallyToggledFavourites: (_toggled: boolean) => void;
  setHasManuallyToggledFolders: (_toggled: boolean) => void;

  setTaskTodayCollapsed: (_collapsed: boolean) => void;
  setTaskOverdueCollapsed: (_collapsed: boolean) => void;
  setTaskUpcomingCollapsed: (_collapsed: boolean) => void;
  setTaskUnplannedCollapsed: (_collapsed: boolean) => void;
  setTaskCompletedCollapsed: (_collapsed: boolean) => void;

  setAllTagsCollapsed: (_collapsed: boolean) => void;
  setFavouriteTagsCollapsed: (_collapsed: boolean) => void;

  setCalendarWeekStart: (_date: string) => void;

  setMainView: (_view: MainView) => void;
  setLastNoteId: (_noteId: string | null) => void;

  setEditorFullWidth: (_fullWidth: boolean) => void;

  setFolderViewSubfoldersCollapsed: (_collapsed: boolean) => void;
  setFolderViewNotesCollapsed: (_collapsed: boolean) => void;
  setDeletedItemsFoldersCollapsed: (_collapsed: boolean) => void;
  setDeletedItemsNotesCollapsed: (_collapsed: boolean) => void;
}

// Safe localStorage wrapper
const getLocalStorage = () => {
  try {
    // eslint-disable-next-line no-undef
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const safeStorage = {
  getItem: (name: string) => {
    try {
      const storage = getLocalStorage();
      return storage ? storage.getItem(name) : null;
    } catch (error) {
      // Error handled
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.setItem(name, value);
      }
    } catch (error) {
      // Error handled
    }
  },
  removeItem: (name: string) => {
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.removeItem(name);
      }
    } catch (error) {
      // Error handled
    }
  },
};

// Get today's week start for calendar default
const getTodayWeekStart = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  return startOfWeek.toISOString();
};

export const useUIStateStore = create<UIStateStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sidebarCollapsed: false,
      sidebarWidth: 256,
      sidebarTab: 'task',

      clutteredCollapsed: true,
      dailyNotesCollapsed: true,
      favouritesCollapsed: true,
      foldersCollapsed: false,

      openFolderIds: new Set<string>(),

      collapsedDailyNoteGroups: new Set<string>(),
      sidebarCollapsedDailyNoteGroups: new Set<string>(),

      hasManuallyToggledCluttered: false,
      hasManuallyToggledDailyNotes: false,
      hasManuallyToggledFavourites: false,
      hasManuallyToggledFolders: false,

      // Task folders collapsed by default when empty (first-time user)
      taskTodayCollapsed: true,
      taskOverdueCollapsed: true,
      taskUpcomingCollapsed: true,
      taskUnplannedCollapsed: true,
      taskCompletedCollapsed: true,

      allTagsCollapsed: false,
      favouriteTagsCollapsed: true,

      calendarWeekStart: getTodayWeekStart(),

      mainView: { type: 'editor' },
      lastNoteId: null,

      editorFullWidth: false,

      folderViewSubfoldersCollapsed: false,
      folderViewNotesCollapsed: false,
      deletedItemsFoldersCollapsed: false,
      deletedItemsNotesCollapsed: false,

      // Actions
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),

      setClutteredCollapsed: (collapsed) =>
        set({ clutteredCollapsed: collapsed }),
      setDailyNotesCollapsed: (collapsed) =>
        set({ dailyNotesCollapsed: collapsed }),
      setFavouritesCollapsed: (collapsed) =>
        set({ favouritesCollapsed: collapsed }),
      setFoldersCollapsed: (collapsed) => set({ foldersCollapsed: collapsed }),

      setOpenFolderIds: (ids) => set({ openFolderIds: ids }),
      toggleFolderOpen: (folderId) =>
        set((state) => {
          const newSet = new Set(state.openFolderIds);
          if (newSet.has(folderId)) {
            newSet.delete(folderId);
          } else {
            newSet.add(folderId);
          }
          return { openFolderIds: newSet };
        }),

      setCollapsedDailyNoteGroups: (groups) =>
        set({ collapsedDailyNoteGroups: groups }),
      toggleDailyNoteGroupCollapsed: (groupKey) =>
        set((state) => {
          const newSet = new Set(state.collapsedDailyNoteGroups);
          if (newSet.has(groupKey)) {
            newSet.delete(groupKey);
          } else {
            newSet.add(groupKey);
          }
          return { collapsedDailyNoteGroups: newSet };
        }),
      isDailyNoteGroupCollapsed: (groupKey) => {
        const state = get();
        return state.collapsedDailyNoteGroups.has(groupKey);
      },

      setSidebarCollapsedDailyNoteGroups: (groups) =>
        set({ sidebarCollapsedDailyNoteGroups: groups }),
      toggleSidebarDailyNoteGroupCollapsed: (groupKey) =>
        set((state) => {
          const newSet = new Set(state.sidebarCollapsedDailyNoteGroups);
          if (newSet.has(groupKey)) {
            newSet.delete(groupKey);
          } else {
            newSet.add(groupKey);
          }
          return { sidebarCollapsedDailyNoteGroups: newSet };
        }),
      isSidebarDailyNoteGroupCollapsed: (groupKey) => {
        const state = get();
        return state.sidebarCollapsedDailyNoteGroups.has(groupKey);
      },

      setHasManuallyToggledCluttered: (toggled) =>
        set({ hasManuallyToggledCluttered: toggled }),
      setHasManuallyToggledDailyNotes: (toggled) =>
        set({ hasManuallyToggledDailyNotes: toggled }),
      setHasManuallyToggledFavourites: (toggled) =>
        set({ hasManuallyToggledFavourites: toggled }),
      setHasManuallyToggledFolders: (toggled) =>
        set({ hasManuallyToggledFolders: toggled }),

      setTaskTodayCollapsed: (collapsed) =>
        set({ taskTodayCollapsed: collapsed }),
      setTaskOverdueCollapsed: (collapsed) =>
        set({ taskOverdueCollapsed: collapsed }),
      setTaskUpcomingCollapsed: (collapsed) =>
        set({ taskUpcomingCollapsed: collapsed }),
      setTaskUnplannedCollapsed: (collapsed) =>
        set({ taskUnplannedCollapsed: collapsed }),
      setTaskCompletedCollapsed: (collapsed) =>
        set({ taskCompletedCollapsed: collapsed }),

      setAllTagsCollapsed: (collapsed) => set({ allTagsCollapsed: collapsed }),
      setFavouriteTagsCollapsed: (collapsed) =>
        set({ favouriteTagsCollapsed: collapsed }),

      setCalendarWeekStart: (date) => set({ calendarWeekStart: date }),

      setMainView: (view) => set({ mainView: view }),
      setLastNoteId: (noteId) => set({ lastNoteId: noteId }),

      setEditorFullWidth: (fullWidth) => set({ editorFullWidth: fullWidth }),

      setFolderViewSubfoldersCollapsed: (collapsed) =>
        set({ folderViewSubfoldersCollapsed: collapsed }),
      setFolderViewNotesCollapsed: (collapsed) =>
        set({ folderViewNotesCollapsed: collapsed }),
      setDeletedItemsFoldersCollapsed: (collapsed) =>
        set({ deletedItemsFoldersCollapsed: collapsed }),
      setDeletedItemsNotesCollapsed: (collapsed) =>
        set({ deletedItemsNotesCollapsed: collapsed }),
    }),
    {
      name: 'clutter-ui-state',
      storage: {
        getItem: (name) => {
          const str = safeStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Convert openFolderIds array back to Set
          if (parsed.state && Array.isArray(parsed.state.openFolderIds)) {
            parsed.state.openFolderIds = new Set(parsed.state.openFolderIds);
          }
          // Convert collapsedDailyNoteGroups array back to Set
          if (
            parsed.state &&
            Array.isArray(parsed.state.collapsedDailyNoteGroups)
          ) {
            parsed.state.collapsedDailyNoteGroups = new Set(
              parsed.state.collapsedDailyNoteGroups
            );
          }
          // Convert sidebarCollapsedDailyNoteGroups array back to Set
          if (
            parsed.state &&
            Array.isArray(parsed.state.sidebarCollapsedDailyNoteGroups)
          ) {
            parsed.state.sidebarCollapsedDailyNoteGroups = new Set(
              parsed.state.sidebarCollapsedDailyNoteGroups
            );
          }
          return parsed;
        },
        setItem: (name, value) => {
          // Convert Sets to arrays for JSON serialization
          const toStore = {
            ...value,
            state: {
              ...value.state,
              openFolderIds: Array.from(value.state.openFolderIds || []),
              collapsedDailyNoteGroups: Array.from(
                value.state.collapsedDailyNoteGroups || []
              ),
              sidebarCollapsedDailyNoteGroups: Array.from(
                value.state.sidebarCollapsedDailyNoteGroups || []
              ),
            },
          };
          safeStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => safeStorage.removeItem(name),
      },
    }
  )
);
