import type { FavoriteItem } from '../models/FavoriteItem';
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';
import { buildNoteSidebarMenu } from './noteSidebarMenu.config';
import { buildFolderSidebarMenu } from './folderSidebarMenu.config';
import type { SidebarRowActions } from './FolderTree';
import type { Workspace } from '@core/workspace/Workspace';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';

interface FavoriteListProps {
  items: FavoriteItem[];
  workspace: Workspace;
  onOpenPage(id: string): void;
  onOpenFolder(id: string): void;
  /**
   * Same shared object Sidebar.Notes.tsx builds for FolderTree — reused
   * here so a favorited row's overflow menu (archive/delete/duplicate/
   * move/toggle-favorite) dispatches through the exact same
   * PageOperations/FolderOperations calls, and so opening this row's menu
   * closes any other row's menu open elsewhere in the sidebar (shared
   * openMenuId). Optional so existing callers/tests that don't wire row
   * actions keep rendering the plain, unwired overflow button Note/Folder
   * already fall back to.
   */
  rowActions?: SidebarRowActions;
  /**
   * Same injected resolution boundary the page editor uses — see Note's
   * own prop doc comment. A favorited note's title is markdown-bearing
   * (getPageDisplayLabel's description/content fallbacks) the same way
   * FolderTree's rows are; a favorited folder's title is a plain name
   * (getFolderDisplayLabel), so only the note branch below uses these.
   */
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;
}

export function FavoriteList({
  items,
  workspace,
  onOpenPage,
  onOpenFolder,
  rowActions,
  resolveWikiLink,
  resolveTag,
}: FavoriteListProps) {
  return items.map((item) => {
    if (item.type === 'note') {
      // Every item here is already a favorite (isFavorite hardcoded true)
      // and always durable (isDraft hardcoded false — a draft can never be
      // favorited, see getFavoriteItems.ts). 'rename' is filtered out: this
      // row has no inline-edit affordance the way FolderTree's rows do, so
      // leaving it in would be a dead menu entry.
      const menuItems = rowActions
        ? buildNoteSidebarMenu(false, true).filter((menuItem) => menuItem.id !== 'rename')
        : undefined;

      return (
        <NoteEntry
          key={item.id}
          title={item.title}
          titleStyle={item.titleStyle}
          emoji={item.emoji}
          resolveWikiLink={resolveWikiLink}
          resolveTag={resolveTag}
          selected={workspace.activePageId === item.id}
          onClick={() => onOpenPage(item.id)}
          menuItems={menuItems}
          menuOpen={rowActions?.openMenuId === item.id}
          onMenuOpenChange={
            rowActions
              ? (open) => (open ? rowActions.onOpenMenu(item.id) : rowActions.onCloseMenu())
              : undefined
          }
          onMenuSelect={
            rowActions
              ? (id) => {
                  if (id === 'duplicate') {
                    rowActions.onDuplicateNote(item.id);
                  } else if (id === 'toggle-favorite') {
                    rowActions.onToggleFavoriteNote(item.id, true);
                  } else if (id === 'archive') {
                    rowActions.onArchiveNote(item.id);
                  }
                }
              : undefined
          }
          moveDestinations={rowActions ? rowActions.noteMoveDestinations : undefined}
          onMove={
            rowActions
              ? (destinationFolderId) => rowActions.onMoveNote(item.id, destinationFolderId)
              : undefined
          }
          onCreateFolder={rowActions ? rowActions.onCreateFolder : undefined}
          onChangeIcon={
            rowActions
              ? (emoji) => rowActions.onChangeNoteIcon(item.id, emoji)
              : undefined
          }
        />
      );
    }

    const menuItems = rowActions
      ? buildFolderSidebarMenu(item.status ?? 'active', true).filter(
          (menuItem) => menuItem.id !== 'rename'
        )
      : undefined;

    return (
      <FolderEntry
        key={item.id}
        title={item.title}
        emoji={item.emoji}
        hasCaret={false}
        selected={workspace.activeFolderId === item.id}
        onClick={() => onOpenFolder(item.id)}
        menuItems={menuItems}
        menuOpen={rowActions?.openMenuId === item.id}
        onMenuOpenChange={
          rowActions
            ? (open) => (open ? rowActions.onOpenMenu(item.id) : rowActions.onCloseMenu())
            : undefined
        }
        onMenuSelect={
          rowActions
            ? (id) => {
                if (id === 'toggle-favorite') {
                  rowActions.onToggleFavoriteFolder(item.id, true);
                } else if (id === 'archive') {
                  rowActions.onArchiveFolder(item.id);
                }
              }
            : undefined
        }
        moveDestinations={
          rowActions ? rowActions.getFolderMoveDestinations(item.id) : undefined
        }
        onMove={
          rowActions
            ? (destinationFolderId) => rowActions.onMoveFolder(item.id, destinationFolderId)
            : undefined
        }
        onCreateFolder={rowActions ? rowActions.onCreateFolder : undefined}
        onChangeIcon={
          rowActions
            ? (emoji) => rowActions.onChangeFolderIcon(item.id, emoji)
            : undefined
        }
      />
    );
  });
}
