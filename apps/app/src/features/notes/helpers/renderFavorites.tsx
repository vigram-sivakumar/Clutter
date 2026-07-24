// React
// Components
import { Folder as FolderEntry } from '../sidebar/Folder';
import { Note as NoteEntry } from '../sidebar/Note';
// Models
import type { Page, Folder } from '@core/vault/models';
// Helpers
import { getFavoriteEntries } from './getFavorites';

export function renderFavorites(pages: Page[], folders: Folder[]) {
  const favoriteItems = getFavoriteEntries(pages, folders);

  return favoriteItems.map((item) => {
    if (item.type === 'note') {
      return (
        <NoteEntry
          key={item.id}
          title={item.title}
          hasCaret={false}
          onClick={() => {}}
        />
      );
    }
    return (
      <FolderEntry
        key={item.id}
        title={item.title}
        hasCaret={false}
        onClick={() => {}}
      />
    );
  });
}
