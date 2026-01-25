/**
 * Entity Search - Search for notes and folders to link
 * Used by @ mention menu to suggest notes/folders
 */

import type { EditorLinkedNote } from '../types';

export interface EditorFolder {
  id: string;
  name: string;
  emoji: string | null;
}

export interface EntitySuggestion {
  type: 'note' | 'folder';
  id: string;
  title: string;
  emoji: string | null;
  isDailyNote?: boolean;
}

export interface EntitySearchResult {
  matches: EntitySuggestion[];
  showCreateNote: boolean;
  showCreateFolder: boolean;
}

/**
 * Search notes and folders based on query
 * Returns top matches + create options
 */
export function searchEntities(
  query: string,
  allNotes: EditorLinkedNote[],
  allFolders: EditorFolder[],
  maxResults: number = 6
): EntitySearchResult {
  if (!query || query.trim() === '') {
    // No query - don't show any suggestions
    return {
      matches: [],
      showCreateNote: false,
      showCreateFolder: false,
    };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matches: EntitySuggestion[] = [];

  // Search notes (including daily notes)
  // Note: EditorLinkedNote only has id, title, emoji, isDailyNote
  // App is responsible for filtering out deleted notes before passing to editor
  const noteMatches = allNotes
    .filter(note => {
      // Defensive: Skip notes with invalid titles
      if (!note || typeof note.title !== 'string') return false;
      return note.title.toLowerCase().includes(normalizedQuery);
    })
    .map(note => ({
      type: 'note' as const,
      id: note.id,
      title: note.title,
      emoji: note.emoji || null,
      isDailyNote: note.isDailyNote || false,
    }));

  // Search folders
  // Note: EditorFolder only has id, name, emoji
  // App is responsible for filtering out deleted folders before passing to editor
  const folderMatches = allFolders
    .filter(folder => {
      // Defensive: Skip folders with invalid names
      if (!folder || typeof folder.name !== 'string') return false;
      return folder.name.toLowerCase().includes(normalizedQuery);
    })
    .map(folder => ({
      type: 'folder' as const,
      id: folder.id,
      title: folder.name,
      emoji: folder.emoji,
    }));

  // Combine and limit results
  matches.push(...noteMatches.slice(0, maxResults));
  const remainingSlots = maxResults - matches.length;
  if (remainingSlots > 0) {
    matches.push(...folderMatches.slice(0, remainingSlots));
  }

  // Check if we should show create options
  // Show create only if:
  // 1. No exact match exists
  // 2. Query is at least 2 characters (avoid showing "Create 'a'" etc.)
  // 3. No strong match (title doesn't start with query)
  const hasExactNoteMatch = noteMatches.some(
    n => typeof n.title === 'string' && n.title.toLowerCase() === normalizedQuery
  );
  const hasExactFolderMatch = folderMatches.some(
    f => typeof f.title === 'string' && f.title.toLowerCase() === normalizedQuery
  );

  const hasStrongNoteMatch = noteMatches.some(
    n => typeof n.title === 'string' && n.title.toLowerCase().startsWith(normalizedQuery)
  );
  const hasStrongFolderMatch = folderMatches.some(
    f => typeof f.title === 'string' && f.title.toLowerCase().startsWith(normalizedQuery)
  );

  return {
    matches,
    showCreateNote: !hasExactNoteMatch && !hasStrongNoteMatch && normalizedQuery.length >= 2,
    showCreateFolder: !hasExactFolderMatch && !hasStrongFolderMatch && normalizedQuery.length >= 2,
  };
}

