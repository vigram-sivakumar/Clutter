/**
 * Folders Store
 * Manages folder hierarchy and operations
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Folder } from '@clutter/domain';
import { useNotesStore } from './notes';

// Maximum folder nesting depth
const MAX_FOLDER_DEPTH = 10;

interface FoldersState {
  folders: Folder[];

  // Actions
  createFolder: (
    _name: string,
    _parentId?: string | null,
    _emoji?: string | null,
    _tags?: string[]
  ) => string | null;
  updateFolder: (_id: string, _updates: Partial<Folder>) => void;
  deleteFolder: (_id: string, _options?: { keepNotes?: boolean }) => void;
  restoreFolder: (_id: string) => void;
  permanentlyDeleteFolder: (_id: string) => void;
  toggleFolderExpanded: (_id: string) => void;
  moveFolder: (_folderId: string, _newParentId: string | null) => void;
  setFolders: (_folders: Folder[]) => void; // For hydration from database

  // Queries
  getFolderPath: (_folderId: string | null) => string[];
  getFolderPathWithIds: (
    _folderId: string | null
  ) => Array<{ id: string; name: string }>;
  getChildFolders: (_parentId: string | null) => Folder[];
  getFolderDepth: (_folderId: string | null) => number;
  getDeletedFolders: () => Folder[];
  getSafeParentForRestore: (_folderId: string) => string | null;
}

// Helper function to sanitize folder data (for future use in migrations)
/* Disabled in local-only mode
const sanitizeFolder = (folder: any): Folder => {
  // Valid folder properties
  const validProps = ['id', 'name', 'parentId', 'description', 'descriptionVisible', 'color', 'emoji', 'tags', 'tagsVisible', 'isFavorite', 'isExpanded', 'createdAt', 'updatedAt', 'deletedAt'];
  
  // Log if we find corrupted data
  const hasInvalidProps = Object.keys(folder).some(key => !validProps.includes(key));
  
  if (hasInvalidProps) {
    // Sanitizing corrupted folder
  }
  
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    description: folder.description || '',
    descriptionVisible: folder.descriptionVisible ?? true,
    color: folder.color,
    emoji: folder.emoji,
    tags: Array.isArray(folder.tags) ? folder.tags : [], // Ensure tags is always an array
    tagsVisible: folder.tagsVisible ?? true,
    isFavorite: folder.isFavorite ?? false, // Default to not favorite
    isExpanded: folder.isExpanded ?? true,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt,
  };
};
*/

export const useFoldersStore = create<FoldersState>()(
  persist(
    (set, get) => ({
      folders: [],

      createFolder: (
        name: string,
        parentId: string | null = null,
        emoji: string | null = null,
        tags: string[] = []
      ) => {
        // Validate input types to prevent corruption
        if (typeof name !== 'string') {
          return null;
        }

        // Check depth limit
        if (parentId) {
          const depth = get().getFolderDepth(parentId);
          if (depth >= MAX_FOLDER_DEPTH) {
            return null; // Return null instead of creating
          }
        }

        const id = `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        // Explicitly define ONLY valid properties for folders
        const newFolder: Folder = {
          id,
          name,
          parentId,
          description: '',
          descriptionVisible: true,
          color: null,
          emoji,
          tags: Array.isArray(tags) ? tags : [], // Ensure tags is always an array
          tagsVisible: true,
          isFavorite: false, // Default to not favorite
          isExpanded: true,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        set((state) => ({
          folders: [...state.folders, newFolder],
        }));

        return id;
      },

      updateFolder: (id: string, updates: Partial<Folder>) => {
        set((state) => ({
          folders: state.folders.map((folder) =>
            folder.id === id
              ? { ...folder, ...updates, updatedAt: new Date().toISOString() }
              : folder
          ),
        }));
      },

      deleteFolder: (id: string, options?: { keepNotes?: boolean }) => {
        const now = new Date().toISOString();
        const keepNotes = options?.keepNotes ?? false;

        // 🔄 CASCADE DELETE: Find all child folders (recursively)
        const getDescendantFolders = (parentId: string): string[] => {
          const children = get().folders.filter(
            (f) => f.parentId === parentId && !f.deletedAt
          );
          const descendants: string[] = [];

          children.forEach((child) => {
            descendants.push(child.id);
            descendants.push(...getDescendantFolders(child.id));
          });

          return descendants;
        };

        const descendantIds = getDescendantFolders(id);
        const allFolderIds = [id, ...descendantIds];

        // Soft delete the folder and all descendants
        set((state) => ({
          folders: state.folders.map((folder) =>
            allFolderIds.includes(folder.id)
              ? { ...folder, deletedAt: now }
              : folder
          ),
        }));

        // 🔄 Handle notes based on user choice
        const { notes, setNotes } = useNotesStore.getState();
        const notesInFolders = notes.filter(
          (note: any) => allFolderIds.includes(note.folderId) && !note.deletedAt
        );

        if (notesInFolders.length > 0) {
          if (keepNotes) {
            // Move notes to root (Cluttered) instead of deleting
            const updatedNotes = notes.map((note: any) =>
              allFolderIds.includes(note.folderId) && !note.deletedAt
                ? { ...note, folderId: null, updatedAt: now }
                : note
            );

            setNotes(updatedNotes);
          } else {
            // Delete notes together with folder (original behavior)
            const updatedNotes = notes.map((note: any) =>
              allFolderIds.includes(note.folderId) && !note.deletedAt
                ? { ...note, deletedAt: now }
                : note
            );

            setNotes(updatedNotes);
          }
        }
      },

      restoreFolder: (id: string) => {
        const safeParentId = get().getSafeParentForRestore(id);
        const now = new Date().toISOString();

        // 🔄 CASCADE RESTORE: Find all child folders (that were deleted at the same time)
        const folder = get().folders.find((f) => f.id === id);
        if (!folder) return;

        const getDescendantFolders = (parentId: string): string[] => {
          const children = get().folders.filter(
            (f) => f.parentId === parentId && f.deletedAt !== null // Only include deleted children
          );
          const descendants: string[] = [];

          children.forEach((child) => {
            descendants.push(child.id);
            descendants.push(...getDescendantFolders(child.id));
          });

          return descendants;
        };

        const descendantIds = getDescendantFolders(id);
        const allFolderIds = [id, ...descendantIds];

        // Restore the folder and all descendants
        set((state) => ({
          folders: state.folders.map((folder) => {
            if (folder.id === id) {
              return {
                ...folder,
                deletedAt: null,
                parentId: safeParentId, // Use safe parent (null if parent is deleted)
                updatedAt: now,
              };
            } else if (descendantIds.includes(folder.id)) {
              return { ...folder, deletedAt: null, updatedAt: now };
            }
            return folder;
          }),
        }));

        // 🔄 CASCADE TO NOTES: Restore all notes in these folders
        const { notes, setNotes } = useNotesStore.getState();
        const notesInFolders = notes.filter(
          (note: any) =>
            allFolderIds.includes(note.folderId) && note.deletedAt !== null
        );

        if (notesInFolders.length > 0) {
          const updatedNotes = notes.map((note: any) =>
            allFolderIds.includes(note.folderId) && note.deletedAt !== null
              ? { ...note, deletedAt: null, updatedAt: now }
              : note
          );

          setNotes(updatedNotes);
        }
      },

      toggleFolderExpanded: (id: string) => {
        set((state) => ({
          folders: state.folders.map((folder) =>
            folder.id === id
              ? { ...folder, isExpanded: !folder.isExpanded }
              : folder
          ),
        }));
      },

      moveFolder: (folderId: string, newParentId: string | null) => {
        // Check depth limit when moving to a new parent
        if (newParentId !== null) {
          const targetDepth = get().getFolderDepth(newParentId);
          const folderSubtreeDepth =
            get().getFolderDepth(folderId) -
            get().getFolderDepth(
              get().folders.find((f) => f.id === folderId)?.parentId ?? null
            );

          if (targetDepth + folderSubtreeDepth >= MAX_FOLDER_DEPTH) {
            return;
          }
        }

        set((state) => ({
          folders: state.folders.map((folder) =>
            folder.id === folderId
              ? {
                  ...folder,
                  parentId: newParentId,
                  updatedAt: new Date().toISOString(),
                }
              : folder
          ),
        }));
      },

      getFolderPath: (folderId: string | null): string[] => {
        if (!folderId) return [];

        const { folders } = get();
        const path: string[] = [];
        const visited = new Set<string>(); // Prevent circular references
        let currentId: string | null = folderId;

        // Build path from current folder up to root
        while (currentId) {
          // Detect circular reference
          if (visited.has(currentId)) {
            break;
          }
          visited.add(currentId);

          const folder = folders.find(
            (f) => f.id === currentId && !f.deletedAt
          );
          if (!folder) break;

          path.unshift(folder.name || 'Untitled Folder');
          currentId = folder.parentId;
        }

        return path;
      },

      getFolderPathWithIds: (
        folderId: string | null
      ): Array<{ id: string; name: string }> => {
        if (!folderId) return [];

        const { folders } = get();
        const path: Array<{ id: string; name: string }> = [];
        const visited = new Set<string>(); // Prevent circular references
        let currentId: string | null = folderId;

        // Build path from current folder up to root
        while (currentId) {
          // Detect circular reference
          if (visited.has(currentId)) {
            break;
          }
          visited.add(currentId);

          const folder = folders.find(
            (f) => f.id === currentId && !f.deletedAt
          );
          if (!folder) break;

          path.unshift({
            id: folder.id,
            name: folder.name || 'Untitled Folder',
          });
          currentId = folder.parentId;
        }

        return path;
      },

      getChildFolders: (parentId: string | null): Folder[] => {
        const { folders } = get();
        return folders
          .filter((f) => f.parentId === parentId && !f.deletedAt)
          .sort((a, b) => a.name.localeCompare(b.name));
      },

      getFolderDepth: (folderId: string | null): number => {
        if (!folderId) return 0;

        const { folders } = get();
        let depth = 0;
        let currentId: string | null = folderId;

        // Prevent infinite loops
        while (currentId && depth < MAX_FOLDER_DEPTH + 1) {
          const folder = folders.find((f) => f.id === currentId);
          if (!folder) break;
          depth++;
          currentId = folder.parentId;
        }

        return depth;
      },

      getDeletedFolders: (): Folder[] => {
        const { folders } = get();
        return folders.filter((f) => f.deletedAt !== null);
      },

      getSafeParentForRestore: (folderId: string): string | null => {
        const { folders } = get();
        const folder = folders.find((f) => f.id === folderId);
        if (!folder) return null;

        // If no parent, restore to root
        if (!folder.parentId) return null;

        // If parent doesn't exist or is deleted, restore to root
        const parent = folders.find((f) => f.id === folder.parentId);
        if (!parent || parent.deletedAt) {
          return null;
        }

        return folder.parentId;
      },

      permanentlyDeleteFolder: (id: string) => {
        set((state) => ({
          folders: state.folders.filter((folder) => folder.id !== id),
        }));
      },

      setFolders: (folders: Folder[]) => {
        set({ folders });
      },
    }),
    {
      name: 'clutter-folders-storage',
    }
  )
);
