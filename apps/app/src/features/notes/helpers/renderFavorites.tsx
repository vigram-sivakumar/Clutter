// React
// Components
import { Folder } from '../components/Folder';
import { Note } from '../components/Note';
// Models
import type { Note as NoteModels } from '../models/Note';
import type { Folder as FolderModels } from '../models/Folder';
// Helpers
import { getFavoriteEntries } from './getFavorites';

export function renderFavorites(notes: NoteModels[], folders: FolderModels[]) {
  const favoriteItems = getFavoriteEntries(notes, folders);

  return favoriteItems.map((item) => {
    if (item.type === 'note') {
      return (
        <Note
          key={item.id}
          title={item.title}
          hasCaret={false}
          onClick={() => {}}
        />
      );
    }
    return (
      <Folder
        key={item.id}
        title={item.title}
        hasCaret={false}
        onClick={() => {}}
      />
    );
  });
}
