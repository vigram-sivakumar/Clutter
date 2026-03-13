/**
 * Tags store with metadata (descriptions, etc.)
 * Tags are still derived from notes, but we store additional metadata
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useNotesStore } from './notes';
import { useFoldersStore } from './folders';
import type { Tag } from '@clutter/domain';

interface TagsState {
  // Map of tag name (lowercase) to tag metadata
  tagMetadata: Record<string, Tag>;

  // Cached list of all unique tag names (for autocomplete)
  // Updated automatically when notes change
  allTagsCache: string[];

  // Get tag metadata by name (case-insensitive)
  getTagMetadata: (_tagName: string) => Tag | undefined;

  // Get all deleted tags
  getDeletedTags: () => Tag[];

  // Update tag metadata
  updateTagMetadata: (
    _tagName: string,
    _updates: Partial<Omit<Tag, 'name' | 'createdAt'>>
  ) => void;

  // Create or update tag metadata
  upsertTagMetadata: (
    _tagName: string,
    _description?: string,
    _descriptionVisible?: boolean,
    _isFavorite?: boolean,
    _color?: string
  ) => void;

  // Rename a tag globally across all notes
  renameTag: (_oldTag: string, _newTag: string) => void;

  // Delete a tag (soft delete - sets deletedAt)
  deleteTag: (_tagName: string) => void;

  // Restore a deleted tag
  restoreTag: (_tagName: string) => void;

  // Permanently delete a tag (hard delete - removes completely)
  permanentlyDeleteTag: (_tagName: string) => void;

  // Update the cached tag list (called automatically when notes change)
  updateTagsCache: () => void;

  // Set tag metadata from database (for hydration)
  setTagMetadata: (_tags: Tag[]) => void;
}

export const useTagsStore = create<TagsState>()(
  persist(
    (set, get) => ({
      tagMetadata: {},
      allTagsCache: [],

      getTagMetadata: (tagName: string) => {
        const key = tagName.toLowerCase();
        return get().tagMetadata[key];
      },

      getDeletedTags: () => {
        const allTags = Object.values(get().tagMetadata);
        const deleted = allTags.filter((tag) => tag.deletedAt !== null);
        return deleted;
      },

      updateTagMetadata: (tagName: string, updates) => {
        const key = tagName.toLowerCase();
        const existing = get().tagMetadata[key];

        if (existing) {
          const updatedTag = {
            ...existing,
            ...updates,
            updatedAt: new Date().toISOString(),
          };

          set((state) => ({
            tagMetadata: {
              ...state.tagMetadata,
              [key]: updatedTag,
            },
          }));
        }
      },

      upsertTagMetadata: (
        tagName: string,
        description = '',
        descriptionVisible = true,
        isFavorite?: boolean,
        color?: string
      ) => {
        const key = tagName.toLowerCase();
        const existing = get().tagMetadata[key];
        const now = new Date().toISOString();

        const tag: Tag = {
          name: tagName, // Preserve original capitalization
          description: description,
          descriptionVisible: descriptionVisible,
          isFavorite:
            isFavorite !== undefined
              ? isFavorite
              : existing?.isFavorite || false, // Use provided value or preserve existing
          color: color !== undefined ? color : existing?.color, // Use provided value or preserve existing
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          deletedAt: null, // Always null when upserting (creating/updating)
        };

        set((state) => ({
          tagMetadata: {
            ...state.tagMetadata,
            [key]: tag,
          },
        }));
      },

      renameTag: (oldTag: string, newTag: string) => {
        const oldKey = oldTag.toLowerCase();
        const newKey = newTag.toLowerCase();

        // Don't do anything if the tags are the same (case-insensitive)
        if (oldKey === newKey) return;

        // 1. Update all notes that have this tag (batch update)
        const { notes, setNotes } = useNotesStore.getState();

        const now = new Date().toISOString();
        let notesUpdated = 0;
        const updatedNotes = notes.map((note) => {
          if (note.tags.some((t) => t.toLowerCase() === oldKey)) {
            const updatedTags = note.tags.map((t) =>
              t.toLowerCase() === oldKey ? newTag : t
            );
            notesUpdated++;
            return { ...note, tags: updatedTags, updatedAt: now };
          }
          return note;
        });

        // Apply the batch update using the store's setNotes action
        if (notesUpdated > 0) {
          setNotes(updatedNotes);
        }

        // 1b. Update all folders that have this tag (batch update)
        const foldersStore = useFoldersStore.getState();

        let foldersUpdated = 0;
        const updatedFolders = foldersStore.folders.map((folder) => {
          if (folder.tags?.some((t) => t.toLowerCase() === oldKey)) {
            const updatedTags = folder.tags.map((t) =>
              t.toLowerCase() === oldKey ? newTag : t
            );
            foldersUpdated++;
            return { ...folder, tags: updatedTags, updatedAt: now };
          }
          return folder;
        });

        // Apply the batch update
        if (foldersUpdated > 0) {
          useFoldersStore.setState({ folders: updatedFolders });
        }

        // 2. Update tag metadata (move from old key to new key)
        const existing = get().tagMetadata[oldKey];

        if (existing) {
          const updatedMetadata = {
            ...existing,
            name: newTag,
            updatedAt: new Date().toISOString(),
          };

          set((state) => {
            const newTagMetadata = { ...state.tagMetadata };
            delete newTagMetadata[oldKey];
            newTagMetadata[newKey] = updatedMetadata;
            return { tagMetadata: newTagMetadata };
          });
        }

        // 3. Update the cache
        get().updateTagsCache();
      },

      deleteTag: (tagName: string) => {
        const key = tagName.toLowerCase();
        const now = new Date().toISOString();
        const existing = get().tagMetadata[key];

        if (!existing) {
          // Create metadata entry if it doesn't exist
          get().upsertTagMetadata(tagName, '', true, false, undefined);
        }

        // 1. Remove tag from all notes
        const { notes, setNotes } = useNotesStore.getState();
        const notesWithTag = notes.filter((note) =>
          note.tags.some((t) => t.toLowerCase() === key)
        );

        if (notesWithTag.length > 0) {
          const updatedNotes = notes.map((note) => {
            if (note.tags.some((t) => t.toLowerCase() === key)) {
              return {
                ...note,
                tags: note.tags.filter((t) => t.toLowerCase() !== key),
                updatedAt: now,
              };
            }
            return note;
          });

          setNotes(updatedNotes);
        }

        // 2. Remove tag from all folders
        const foldersStore = useFoldersStore.getState();
        const foldersWithTag = foldersStore.folders.filter((folder) =>
          folder.tags?.some((t) => t.toLowerCase() === key)
        );

        if (foldersWithTag.length > 0) {
          const updatedFolders = foldersStore.folders.map((folder) => {
            if (folder.tags?.some((t) => t.toLowerCase() === key)) {
              return {
                ...folder,
                tags: folder.tags.filter((t) => t.toLowerCase() !== key),
                updatedAt: now,
              };
            }
            return folder;
          });

          useFoldersStore.setState({ folders: updatedFolders });
        }

        // 3. Soft delete tag metadata (set deletedAt)
        const updatedTag: Tag = {
          ...(get().tagMetadata[key] || {
            name: tagName,
            description: '',
            descriptionVisible: true,
            isFavorite: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          }),
          deletedAt: now,
          updatedAt: now,
        };

        set((state) => ({
          tagMetadata: {
            ...state.tagMetadata,
            [key]: updatedTag,
          },
        }));

        // 5. Update cache to exclude deleted tag
        get().updateTagsCache();
      },

      restoreTag: (tagName: string) => {
        const key = tagName.toLowerCase();
        const now = new Date().toISOString();
        const existing = get().tagMetadata[key];

        if (!existing) {
          return;
        }

        if (!existing.deletedAt) {
          return;
        }

        // Restore: Clear deletedAt timestamp
        const restoredTag: Tag = {
          ...existing,
          deletedAt: null,
          updatedAt: now,
        };

        set((state) => ({
          tagMetadata: {
            ...state.tagMetadata,
            [key]: restoredTag,
          },
        }));

        // Update cache to include restored tag
        get().updateTagsCache();
      },

      permanentlyDeleteTag: (tagName: string) => {
        const key = tagName.toLowerCase();

        // 1. Delete tag metadata from store
        set((state) => {
          const newTagMetadata = { ...state.tagMetadata };
          delete newTagMetadata[key];
          return { tagMetadata: newTagMetadata };
        });

        // 3. Update cache
        get().updateTagsCache();
      },

      updateTagsCache: () => {
        const notes = useNotesStore.getState().notes;
        const folders = useFoldersStore.getState().folders;
        const metadata = get().tagMetadata;
        const tagsMap = new Map<string, string>();

        // 1. Derive unique tags from all non-deleted notes
        notes.forEach((note) => {
          if (!note.deletedAt) {
            note.tags.forEach((tag) => {
              const lowerTag = tag.toLowerCase();
              if (!tagsMap.has(lowerTag)) {
                tagsMap.set(lowerTag, tag); // Store original capitalization
              }
            });
          }
        });

        // 2. Add tags from folders
        folders.forEach((folder) => {
          if (!folder.deletedAt && folder.tags) {
            folder.tags.forEach((tag) => {
              const lowerTag = tag.toLowerCase();
              if (!tagsMap.has(lowerTag)) {
                tagsMap.set(lowerTag, tag); // Store original capitalization
              }
            });
          }
        });

        // 3. Add standalone tags from metadata
        Object.values(metadata).forEach((tag) => {
          if (tag.deletedAt) return; // Skip deleted tags
          const lowerTag = tag.name.toLowerCase();
          if (!tagsMap.has(lowerTag)) {
            tagsMap.set(lowerTag, tag.name); // Store original capitalization
          }
        });

        set({ allTagsCache: Array.from(tagsMap.values()) });
      },

      setTagMetadata: (tags: Tag[]) => {
        const metadata: Record<string, Tag> = {};
        tags.forEach((tag) => {
          metadata[tag.name.toLowerCase()] = tag;
        });
        set({ tagMetadata: metadata });
      },
    }),
    {
      name: 'clutter-tags-storage',
    }
  )
);

/**
 * Hook that derives all unique tags from notes, folders, and standalone tag metadata
 * Automatically updates when notes, folders, or tag metadata changes
 */
export const useAllTags = (): string[] => {
  const notes = useNotesStore((state) => state.notes);
  const folders = useFoldersStore((state) => state.folders);
  const tagMetadata = useTagsStore((state) => state.tagMetadata);

  return useMemo(() => {
    // Use Map to deduplicate case-insensitively while preserving first occurrence's capitalization
    const tagsMap = new Map<string, string>();

    // 1. Add tags from notes
    notes.forEach((note) => {
      if (!note.deletedAt) {
        note.tags.forEach((tag) => {
          const lowerTag = tag.toLowerCase();
          if (!tagsMap.has(lowerTag)) {
            tagsMap.set(lowerTag, tag); // Store original capitalization
          }
        });
      }
    });

    // 2. Add tags from folders
    folders.forEach((folder) => {
      if (!folder.deletedAt && folder.tags) {
        folder.tags.forEach((tag) => {
          const lowerTag = tag.toLowerCase();
          if (!tagsMap.has(lowerTag)) {
            tagsMap.set(lowerTag, tag); // Store original capitalization
          }
        });
      }
    });

    // 3. Add standalone tags from metadata (tags that exist but aren't assigned anywhere yet)
    Object.values(tagMetadata).forEach((tag) => {
      if (tag.deletedAt) return; // Skip deleted tags
      const lowerTag = tag.name.toLowerCase();
      if (!tagsMap.has(lowerTag)) {
        tagsMap.set(lowerTag, tag.name); // Store original capitalization from metadata
      }
    });

    return Array.from(tagsMap.values()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [notes, folders, tagMetadata]);
};

/**
 * Hook that provides tag suggestions based on query
 * @param query - The search query
 * @param excludeTags - Tags to exclude from suggestions
 */
export const useTagSuggestions = (
  query: string,
  excludeTags: string[] = []
): string[] => {
  const allTags = useAllTags();

  return useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const excludeSet = new Set(excludeTags.map((t) => t.toLowerCase()));

    if (!normalizedQuery) {
      return [];
    }

    return allTags
      .filter((tag) => {
        // Case-insensitive matching since allTags now preserves original capitalization
        return (
          tag.toLowerCase().startsWith(normalizedQuery) &&
          !excludeSet.has(tag.toLowerCase())
        );
      })
      .slice(0, 5); // Limit to 5 suggestions
  }, [allTags, query, excludeTags]);
};
