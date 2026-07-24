import type { Folder, Page } from '@core/vault/models';
import { FavoriteEntry } from '../models/FavoriteEntry';
/**
 * Returns all favorite notes and folders
 * as a single list of sidebar entries.
 */
export function getFavoriteEntries(
  pages: Page[],
  folders: Folder[]
): FavoriteEntry[] {
  // Convert favorite folders into sidebar entries.
  const favoriteFolders = folders
    .filter((folder) => folder.metadata.favorite)
    .map((folder) => ({
      id: folder.id,
      title: folder.name,
      type: 'folder' as const,
    }));

  // Convert favorite notes into sidebar entries.
  const favoriteNotes = pages
    .filter((page) => page.metadata.favorite)
    .map((page) => ({
      id: page.id,
      title: page.name,
      type: 'note' as const,
    }));

  // Combine notes and folders into a single list.
  const favoriteEntries = [...favoriteFolders, ...favoriteNotes];

  // Sort the entries before returning them.
  // This is where future sorting options (A-Z, Z-A,
  // folders first, notes first, etc.) should be applied.
  // Example:
  // favoriteEntries.sort((a, b) => a.title.localeCompare(b.title));

  return favoriteEntries;
}
