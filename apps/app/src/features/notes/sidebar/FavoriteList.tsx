import type { FavoriteEntry } from '../models/FavoriteEntry';
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';
import type { Workspace } from '@core/workspace/Workspace';

interface FavoriteListProps {
  items: FavoriteEntry[];
  workspace: Workspace;
  onOpenPage(id: string): void;
  onOpenFolder(id: string): void;
}

export function FavoriteList({
  items,
  workspace,
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
          selected={workspace.activePageId === item.id}
          onClick={() => onOpenPage(item.id)}
        />
      );
    }

    return (
      <FolderEntry
        key={item.id}
        title={item.title}
        hasCaret={false}
        selected={workspace.activeFolderId === item.id}
        onClick={() => onOpenFolder(item.id)}
      />
    );
  });
}
