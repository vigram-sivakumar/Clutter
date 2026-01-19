/**
 * useEditorContext - App-owned hook to construct EditorContextValue
 * 
 * This hook adapts Zustand stores into EditorContextValue.
 * It is the boundary between app state and editor.
 * 
 * CRITICAL: This lives in UI package temporarily - should move to app layer
 * when Phase 5 splits shared → domain + state.
 * 
 * ⚠️ ARCHITECTURAL EXCEPTION:
 * This file imports from @clutter/editor, violating the UI package boundary.
 * This is an adapter that should move to apps/ in Phase 5.
 * ESLint exception documented here until migration is complete.
 */

/* eslint-disable no-restricted-imports */
import { useMemo } from 'react';
import { useTagsStore, useNotesStore, useFoldersStore } from '@clutter/state';
import { EditorContextValue, EditorTag, EditorLinkedNote, EditorFolder } from '@clutter/editor';

/**
 * Hook to construct EditorContextValue from app state
 * 
 * This is where we adapt domain objects to editor projections.
 */
export function useEditorContext(): EditorContextValue {
  // Get Zustand stores
  const tags = useTagsStore(state => state.tags);
  const allTagsCache = useTagsStore(state => state.allTagsCache);
  const getTagMetadata = useTagsStore(state => state.getTagMetadata);
  const updateTagMetadata = useTagsStore(state => state.updateTagMetadata);
  const upsertTagMetadata = useTagsStore(state => state.upsertTagMetadata);
  const renameTag = useTagsStore(state => state.renameTag);
  
  const notes = useNotesStore(state => state.notes);
  const createNote = useNotesStore(state => state.createNote);
  const findDailyNoteByDate = useNotesStore(state => state.findDailyNoteByDate);
  const createDailyNote = useNotesStore(state => state.createDailyNote);
  
  const folders = useFoldersStore(state => state.folders);
  const createFolder = useFoldersStore(state => state.createFolder);
  
  // Construct context value
  return useMemo(() => {
    // Project tags to EditorTag
    const availableTags: EditorTag[] = allTagsCache.map(tagName => {
      const metadata = getTagMetadata(tagName);
      return {
        id: tagName,
        label: tagName,
        color: metadata?.color,
      };
    });
    
    // Project notes to EditorLinkedNote
    const availableNotes: EditorLinkedNote[] = notes
      .filter(note => note.deletedAt === null)
      .map(note => ({
        id: note.id,
        title: note.title,
        emoji: note.emoji,
        isDailyNote: !!note.dailyNoteDate,
      }));
    
    // Project folders to EditorFolder
    const availableFolders: EditorFolder[] = folders
      .filter(folder => folder.id !== '__CLUTTERED__' && folder.id !== '__DAILY_NOTES__')
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
      }));
    
    return {
      // Data
      availableTags,
      availableNotes,
      availableFolders,
      
      // Tag operations
      getTagMetadata: (tagName: string) => {
        const metadata = getTagMetadata(tagName);
        if (!metadata) return null;
        return {
          description: metadata.description,
          descriptionVisible: metadata.descriptionVisible,
          isFavorite: metadata.isFavorite,
          color: metadata.color,
        };
      },
      onUpdateTagMetadata: (tagName: string, metadata: any) => {
        updateTagMetadata(tagName, metadata);
      },
      onUpsertTagMetadata: (
        tagName: string,
        description?: string,
        descriptionVisible?: boolean,
        isFavorite?: boolean,
        color?: string
      ) => {
        upsertTagMetadata(tagName, description, descriptionVisible, isFavorite, color);
      },
      onRenameTag: (oldTag: string, newTag: string) => {
        renameTag(oldTag, newTag);
      },
      
      // Note/folder operations
      onCreateNote: async (title: string, navigate?: boolean) => {
        const note = await createNote({ title }, navigate); // ✅ AWAIT
        return {
          id: note.id,
          title: note.title,
          emoji: note.emoji,
          isDailyNote: !!note.dailyNoteDate,
        };
      },
      onCreateFolder: (name: string) => {
        return createFolder(name);
      },
      onFindDailyNote: (date: Date) => {
        const note = findDailyNoteByDate(date);
        if (!note) return null;
        return {
          id: note.id,
          title: note.title,
          emoji: note.emoji,
          isDailyNote: true,
        };
      },
      onCreateDailyNote: async (date: Date, navigate?: boolean) => {
        const note = await createDailyNote(date, navigate); // ✅ AWAIT
        return {
          id: note.id,
          title: note.title,
          emoji: note.emoji,
          isDailyNote: true,
        };
      },
    };
  }, [
    allTagsCache,
    getTagMetadata,
    updateTagMetadata,
    upsertTagMetadata,
    renameTag,
    notes,
    createNote,
    findDailyNoteByDate,
    createDailyNote,
    folders,
    createFolder,
  ]);
}

