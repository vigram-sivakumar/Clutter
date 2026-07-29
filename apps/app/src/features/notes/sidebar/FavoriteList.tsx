import type { FavoriteEntry } from '../models/FavoriteEntry';
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';

interface FavoriteListProps {
  items: FavoriteEntry[];
  onOpenPage(id: string): void;
  onOpenFolder(id: string): void;
}

export function FavoriteList({
  items,
  onOpenPage,
  onOpenFolder,
}: FavoriteListProps) {
  return items.map((item) => {
    if (item.type === 'note') {
      return (
        <NoteEntry
          key={item.id}
          title={item.title}
          hasCaret={false}
          onClick={() => onOpenPage(item.id)}
        />
      );
    }

    return (
      <FolderEntry
        key={item.id}
        title={item.title}
        hasCaret={false}
        onClick={() => onOpenFolder(item.id)}
      />
    );
  });
}
