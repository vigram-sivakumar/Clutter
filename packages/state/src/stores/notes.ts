/**
 * Notes store using Zustand
 * Local-only, synchronous state management
 */

import { create } from 'zustand';
import { Note, DAILY_NOTES_FOLDER_ID } from '@clutter/domain';

// Generate a unique ID
const generateId = () => {
  return `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Create a new empty note
const createEmptyNote = (initialValues?: Partial<Note>): Note => {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: '',
    description: '',
    descriptionVisible: true,
    emoji: null,
    content: '',
    tags: [],
    tagsVisible: true,
    isFavorite: false,
    folderId: null, // null = "Uncluttered" (root)
    dailyNoteDate: null, // null = regular note, ISO date string = daily note
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...initialValues, // Override with any provided initial values
  };
};

// Internal helper: Get relative date prefix ("Today", "Yesterday", "Tomorrow", or empty)
const getRelativeDatePrefix = (date: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today, ';
  if (diffDays === -1) return 'Yesterday, ';
  if (diffDays === 1) return 'Tomorrow, ';
  return '';
};

// Internal helper: Format daily note title ("Today, 3 Jan 2026" or "3 Jan 2026")
const formatDailyNoteTitle = (date: Date): string => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const prefix = getRelativeDatePrefix(date);
  const dateStr = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  
  return `${prefix}${dateStr}`;
};

interface NotesStore {
  // State
  notes: Note[];
  currentNoteId: string | null;
  
  // Derived
  currentNote: Note | null;
  
  // Actions
  setNotes: (_notes: Note[]) => void;
  setCurrentNoteId: (_id: string | null) => void;
  createNote: (_initialValues?: Partial<Note>, _setAsCurrent?: boolean) => Promise<Note>;
  updateNote: (_id: string, _updates: Partial<Note>) => void;
  deleteNote: (_id: string) => void;
  duplicateNote: (_id: string) => Note | null;
  restoreNote: (_id: string) => void;
  permanentlyDeleteNote: (_id: string) => void;
  
  // Single-writer pattern (prevents race conditions)
  updateNoteContent: (_id: string, _content: string) => void;
  updateNoteMeta: (_id: string, _updates: Omit<Partial<Note>, 'content' | 'id' | 'createdAt' | 'updatedAt'>) => void;
  
  // Daily notes
  findDailyNoteByDate: (_date: Date) => Note | null;
  createDailyNote: (_date: Date, _setAsCurrent?: boolean) => Promise<Note>;
  updateDailyNoteTitles: () => void;
  
  // Helpers
  getNoteById: (_id: string) => Note | null;
  getActiveNotes: () => Note[];
  getDeletedNotes: () => Note[];
  searchNotes: (_query: string) => Note[];
}

export const useNotesStore = create<NotesStore>()((set, get) => ({
  // Initial state
  notes: [],
  currentNoteId: null,
  
  // Derived state (computed in selectors)
  get currentNote() {
    const { notes, currentNoteId } = get();
    return notes.find(n => n.id === currentNoteId) || null;
  },
  
  // Actions
  setNotes: (notes) => {
    set({ notes });
  },
  
  setCurrentNoteId: (id) => {
    set({ currentNoteId: id });
  },
  
  createNote: async (initialValues, setAsCurrent = true) => {
    const note = createEmptyNote(initialValues);
    
    // Add note to state
    set((state) => ({
      notes: [note, ...state.notes],
      currentNoteId: setAsCurrent ? note.id : state.currentNoteId,
    }));
    
    return note;
  },
  
  updateNote: (id, updates) => {
    const now = new Date().toISOString();
    const hadTagsBefore = get().notes.find(n => n.id === id)?.tags;
    
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? { ...note, ...updates, updatedAt: now }
          : note
      ),
    }));
    
    // Update tags cache if tags changed (deferred to avoid render-phase updates)
    const note = get().notes.find(n => n.id === id);
    if (note && hadTagsBefore && updates.tags && JSON.stringify(hadTagsBefore) !== JSON.stringify(updates.tags)) {
      setTimeout(() => {
        import('./tags').then(({ useTagsStore }) => {
          useTagsStore.getState().updateTagsCache();
        });
      }, 0);
    }
  },
  
  updateNoteContent: (id, content) => {
    console.log('[NotesStore] updateNoteContent:', { id, contentLength: content.length, contentPreview: content.substring(0, 200) });
    const now = new Date().toISOString();
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? { ...note, content, updatedAt: now }
          : note
      ),
    }));
  },
  
  updateNoteMeta: (id, updates) => {
    const now = new Date().toISOString();
    const hadTagsBefore = get().notes.find(n => n.id === id)?.tags;
    
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? { ...note, ...updates, updatedAt: now }
          : note
      ),
    }));
    
    // Update tags cache if tags changed
    const note = get().notes.find(n => n.id === id);
    if (note && hadTagsBefore && updates.tags && JSON.stringify(hadTagsBefore) !== JSON.stringify(updates.tags)) {
      setTimeout(() => {
        import('./tags').then(({ useTagsStore }) => {
          useTagsStore.getState().updateTagsCache();
        });
      }, 0);
    }
  },
  
  deleteNote: (id) => {
    const note = get().notes.find(n => n.id === id);
    const hadTags = note?.tags && note.tags.length > 0;
    
    // Soft delete (notes go to "Recently deleted")
    // Keep currentNoteId set - user stays on the note, UI updates context to "deleted"
    const now = new Date().toISOString();
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? { ...note, deletedAt: now, updatedAt: now }
          : note
      ),
    }));
    
    // Update tags cache if note had tags (deferred)
    if (hadTags) {
      setTimeout(() => {
        import('./tags').then(({ useTagsStore }) => {
          useTagsStore.getState().updateTagsCache();
        });
      }, 0);
    }
  },
  
  duplicateNote: (id) => {
    const original = get().notes.find(n => n.id === id);
    if (!original) return null;
    
    const now = new Date().toISOString();
    const duplicate: Note = {
      ...original,
      id: generateId(),
      title: original.title ? `${original.title} (copy)` : '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    
    set((state) => ({
      notes: [duplicate, ...state.notes],
      currentNoteId: duplicate.id,
    }));
    
    return duplicate;
  },
  
  restoreNote: (id) => {
    const note = get().notes.find(n => n.id === id);
    const hadTags = note?.tags && note.tags.length > 0;
    
    const now = new Date().toISOString();
    let updates: Partial<Note> = { deletedAt: null, updatedAt: now };
    
    // Check if parent folder is deleted (lazy import to avoid circular dependency)
    if (note?.folderId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useFoldersStore } = require('./folders');
        const folder = useFoldersStore.getState().folders.find((f: any) => f.id === note.folderId);
        
        if (folder?.deletedAt) {
          updates = {
            ...updates,
            folderId: null,  // Move to Cluttered (root)
          };
        }
      } catch (e) {
        // Folders store not available, skip check
      }
    }
    
    if (note?.dailyNoteDate && !updates.folderId) {
      // Check if there's already an active daily note for this date
      const existingDailyNote = get().notes.find(n => 
        n.dailyNoteDate === note.dailyNoteDate && 
        n.id !== id && 
        !n.deletedAt
      );
      
      if (existingDailyNote) {
        // Convert to regular note (Cluttered)
        updates = {
          ...updates,
          dailyNoteDate: null,
          folderId: null,
        };
      } else {
        // Restore as daily note
        updates = {
          ...updates,
          folderId: DAILY_NOTES_FOLDER_ID,
        };
      }
    }
    
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id
          ? { ...n, ...updates }
          : n
      ),
    }));
    
    // Update tags cache if note has tags (deferred)
    if (hadTags) {
      setTimeout(() => {
        import('./tags').then(({ useTagsStore }) => {
          useTagsStore.getState().updateTagsCache();
        });
      }, 0);
    }
  },
  
  permanentlyDeleteNote: (id) => {
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
      currentNoteId: state.currentNoteId === id ? null : state.currentNoteId,
    }));
  },
  
  // Daily notes
  findDailyNoteByDate: (date) => {
    // Use local date string to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD in local time
    
    // Find all daily notes for this date
    const dailyNotes = get().notes.filter(n => n.dailyNoteDate === dateStr && !n.deletedAt);
    
    if (dailyNotes.length === 0) return null;
    
    // Return the LATEST one by updated_at (in case of duplicates)
    return dailyNotes.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0] || null;
  },
  
  createDailyNote: async (date, setAsCurrent = true) => {
    // Use local date string to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD in local time
    const title = formatDailyNoteTitle(date);
    
    // Convert any deleted daily note for this date to a regular note
    const deletedDailyNote = get().notes.find(n => 
      n.dailyNoteDate === dateStr && 
      n.deletedAt !== null
    );
    
    if (deletedDailyNote) {
      // Create a fixed title without "Today/Yesterday" prefix
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fixedTitle = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
      
      get().updateNote(deletedDailyNote.id, {
        dailyNoteDate: null,  // Convert to regular note
        title: fixedTitle,
        updatedAt: new Date().toISOString(),
      });
    }
    
    const note = createEmptyNote({
      dailyNoteDate: dateStr,
      title,
      emoji: null, // No emoji - will show calendar icon instead
      folderId: DAILY_NOTES_FOLDER_ID, // Special folder for daily notes
    });
    
    // Add note to state
    set((state) => ({
      notes: [note, ...state.notes],
      currentNoteId: setAsCurrent ? note.id : state.currentNoteId,
    }));
    
    return note;
  },
  
  updateDailyNoteTitles: () => {
    const notes = get().notes;
    const dailyNotes = notes.filter(n => n.dailyNoteDate && !n.deletedAt);
    
    if (dailyNotes.length === 0) return;
    
    dailyNotes.forEach(note => {
      // Parse the date from dailyNoteDate (YYYY-MM-DD format)
      const [year, month, day] = note.dailyNoteDate!.split('-').map(Number);
      if (year === undefined || month === undefined || day === undefined) return;
      const noteDate = new Date(year, month - 1, day);
      
      // Generate new title with current relative prefix
      const newTitle = formatDailyNoteTitle(noteDate);
      
      // Update if changed
      if (newTitle !== note.title) {
        get().updateNoteMeta(note.id, { title: newTitle });
      }
    });
  },
  
  // Helpers
  getNoteById: (id) => get().notes.find(n => n.id === id) || null,
  
  getActiveNotes: () => get().notes.filter(n => !n.deletedAt),
  
  getDeletedNotes: () => get().notes.filter(n => n.deletedAt),
  
  searchNotes: (query) => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return get().getActiveNotes();
    
    return get().notes.filter((note) => {
      if (note.deletedAt) return false;
      return (
        note.title.toLowerCase().includes(normalizedQuery) ||
        note.description.toLowerCase().includes(normalizedQuery) ||
        note.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
      );
    });
  },
}));
