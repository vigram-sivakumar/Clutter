import { ReactNode } from 'react';
import { CLUTTERED_FOLDER_ID, DAILY_NOTES_FOLDER_ID } from '@clutter/domain';
import { useTheme } from '../../../../../hooks/useTheme';
import { SidebarSection } from '../sections/Section';
import { SidebarItemNote } from '../items/NoteItem';
import { SidebarItemFolder } from '../items/FolderItem';
import { SidebarEmptyState } from '../sections/EmptyState';
import { transitions } from '../../../../../tokens/transitions';
import { sidebarLayout } from '../../../../../tokens/sidebar';
import { SidebarNote, SidebarFolder, GlobalSelection } from '../types';
import { SECTIONS } from '../../../../../config/sidebarConfig';
import { PAGE_EMPTY_STATES } from '../../../../../config/placeholders';

interface SidebarNotesViewProps {
  // Cluttered Notes
  clutteredNotes: SidebarNote[];
  onClutteredNoteClick: (_noteId: string, _event?: React.MouseEvent) => void;
  isClutteredCollapsed: boolean;
  onClutteredToggle: () => void;
  onClutteredFolderClick?: () => void; // Click folder name to open Cluttered folder view

  // Favourites
  favouriteNotes: SidebarNote[];
  favouriteFolders: SidebarFolder[];
  onFavouriteClick: (_noteId: string, _event?: React.MouseEvent) => void;

  // Selection
  onClearSelection?: () => void; // Clear selection when clicking empty space

  // Folder notes (with context)
  onFolderNoteClick?: (
    _noteId: string,
    _context: string,
    _event?: React.MouseEvent
  ) => void;
  onFavouriteFolderClick?: (
    _folderId: string,
    _event?: React.MouseEvent
  ) => void;
  onFavouriteFolderToggle: (_folderId: string) => void;
  isFavouritesCollapsed: boolean;
  onFavouritesToggle: () => void;
  onFavouritesHeaderClick?: () => void; // Click favourites section header to navigate

  // Folders
  folders: SidebarFolder[];
  onFolderClick?: (
    _folderId: string,
    _context: string,
    _event?: React.MouseEvent
  ) => void; // Click folder name to open folder view (with context)
  onFolderToggle: (_folderId: string) => void; // Click chevron to expand/collapse
  onFolderAdd: () => void;
  isFoldersCollapsed: boolean;
  onFoldersToggle: () => void;
  onFoldersHeaderClick?: () => void; // Click "Folders" section title to navigate
  foldersHeaderActions?: ReactNode[];

  // Selection
  selection: GlobalSelection;
  currentNoteId?: string | null; // Current note open in editor (for highlighting)
  openContextMenuId?: string | null; // ID of item with open context menu (for highlighting)

  // Action builders
  getNoteActions?: (_noteId: string) => ReactNode[];
  getFolderActions?: (_folderId: string) => ReactNode[];

  // Drag and drop
  onNoteDragStart?: (_noteId: string, _context: string) => void;
  onFolderDragStart?: (_folderId: string, _context: string) => void;
  onDragEnd?: () => void;
  onFolderDragOver?: (_folderId: string) => void;
  onClutteredDragOver?: () => void;
  onDragLeave?: () => void;
  onFolderDrop?: (_folderId: string) => void;
  onClutteredDrop?: () => void;
  draggedItemId?: string[] | null;
  dropTargetId?: string | null;
  dropTargetType?: 'folder' | CLUTTERED_FOLDER_ID | 'dailyNotes' | null;

  // Reordering
  onNoteDragOverForReorder?: (
    _noteId: string,
    _position: 'before' | 'after',
    _context: string
  ) => void;
  onNoteDragLeaveForReorder?: () => void;
  onNoteDropForReorder?: (
    _noteId: string,
    _position: 'before' | 'after',
    _context: string
  ) => void;
  onFolderDragOverForReorder?: (
    _folderId: string,
    _position: 'before' | 'after',
    _context: string
  ) => void;
  onFolderDragLeaveForReorder?: () => void;
  onFolderDropForReorder?: (
    _folderId: string,
    _position: 'before' | 'after',
    _context: string
  ) => void;
  reorderDropTarget?: {
    id: string;
    position: 'before' | 'after';
    type: 'note' | 'folder';
  } | null;

  // Inline editing
  editingNoteId?: string | null;
  editingFolderId?: string | null;
  onNoteRenameComplete?: (_noteId: string, _newTitle: string) => void;
  onNoteRenameCancel?: () => void;
  onFolderRenameComplete?: (_folderId: string, _newName: string) => void;
  onFolderRenameCancel?: () => void;

  // Emoji picker
  onNoteEmojiClick?: (
    _noteId: string,
    _buttonElement: HTMLButtonElement
  ) => void;
  onFolderEmojiClick?: (
    _folderId: string,
    _buttonElement: HTMLButtonElement
  ) => void;
}

export const NotesView = ({
  clutteredNotes,
  onClutteredNoteClick,
  isClutteredCollapsed,
  onClutteredToggle,
  onClutteredFolderClick,
  favouriteNotes,
  favouriteFolders,
  onFavouriteClick,
  onFavouriteFolderClick: _onFavouriteFolderClick,
  onFavouriteFolderToggle: _onFavouriteFolderToggle,
  isFavouritesCollapsed,
  onFavouritesToggle,
  onFavouritesHeaderClick,
  folders,
  onFolderClick,
  onFolderToggle,
  onFolderNoteClick,
  onFolderAdd: _onFolderAdd,
  isFoldersCollapsed,
  onFoldersToggle,
  onFoldersHeaderClick,
  foldersHeaderActions,
  selection,
  currentNoteId: _currentNoteId,
  openContextMenuId,
  onClearSelection,
  getNoteActions,
  getFolderActions,
  onNoteDragStart,
  onFolderDragStart,
  onDragEnd,
  onFolderDragOver,
  onClutteredDragOver,
  onDragLeave,
  onFolderDrop,
  onClutteredDrop,
  draggedItemId,
  dropTargetId,
  dropTargetType,
  onNoteDragOverForReorder,
  onNoteDragLeaveForReorder,
  onNoteDropForReorder,
  onFolderDragOverForReorder,
  onFolderDragLeaveForReorder,
  onFolderDropForReorder,
  reorderDropTarget,
  editingNoteId,
  editingFolderId,
  onNoteRenameComplete,
  onNoteRenameCancel,
  onFolderRenameComplete,
  onFolderRenameCancel,
  onNoteEmojiClick,
  onFolderEmojiClick,
}: SidebarNotesViewProps) => {
  useTheme();

  // Recursive function to render folders and their nested content
  // parentFolderId is used to determine the ordering context
  // Can also be 'favourites' to indicate this folder is in the Favourites section
  const renderFolder = (
    folder: SidebarFolder,
    level: number,
    parentFolderId: string | null = null
  ) => {
    // Determine the context for this folder based on its parent
    // Special case: 'favourites' is passed as a context, not a parent ID
    const isInFavourites =
      parentFolderId === 'favourites' ||
      (typeof parentFolderId === 'string' &&
        parentFolderId.startsWith('favourites-'));
    const folderContext = isInFavourites
      ? 'favourites'
      : parentFolderId
        ? `folder-children-${parentFolderId}`
        : 'root-folders';

    // Context for notes inside this folder
    const notesContext = isInFavourites
      ? `favourites-folder-notes-${folder.id}`
      : `folder-notes-${folder.id}`;

    // Context for child folders (to propagate favourites context)
    const childFolderParentId = isInFavourites
      ? `favourites-${folder.id}`
      : folder.id;

    return (
      <div
        key={folder.id}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: sidebarLayout.itemToItemGap,
        }}
      >
        <SidebarItemFolder
          id={folder.id}
          label={folder.name || 'Untitled Folder'}
          emoji={folder.emoji}
          isOpen={folder.isOpen}
          badge={
            folder.notes.length > 0 ? String(folder.notes.length) : undefined
          }
          level={level}
          onClick={(e) => onFolderClick?.(folder.id, folderContext, e)} // Click folder name to open folder view
          onToggle={() => onFolderToggle(folder.id)} // Click chevron to expand/collapse
          isToggleDisabled={
            folder.notes.length === 0 &&
            (!folder.subfolders || folder.subfolders.length === 0) &&
            !folder.isOpen
          } // Only disable when empty AND collapsed
          actions={getFolderActions ? getFolderActions(folder.id) : undefined}
          hasOpenContextMenu={openContextMenuId === folder.id}
          onDragStart={onFolderDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onFolderDragOver}
          onDragLeave={onDragLeave}
          onDrop={onFolderDrop}
          isDragging={draggedItemId?.includes(folder.id) || false}
          isDropTarget={dropTargetId === folder.id}
          isSelected={
            selection.type === 'folder' &&
            selection.multiSelectIds?.has(folder.id) &&
            selection.context === folderContext
          }
          context={folderContext}
          reorderable={Boolean(onFolderDragOverForReorder)}
          onClearAllReorderIndicators={() => {
            // Clear both note and folder reorder indicators when hovering over folder
            onNoteDragLeaveForReorder?.();
            onFolderDragLeaveForReorder?.();
          }}
          onDragOverForReorder={(id, pos) => {
            onFolderDragOverForReorder?.(id, pos, folderContext);
          }}
          onDragLeaveForReorder={onFolderDragLeaveForReorder}
          onDropForReorder={(id, pos) => {
            onFolderDropForReorder?.(id, pos, folderContext);
          }}
          dropPosition={
            reorderDropTarget?.type === 'folder' &&
            reorderDropTarget?.id === folder.id
              ? reorderDropTarget.position
              : null
          }
          isEditing={editingFolderId === folder.id}
          onRenameComplete={onFolderRenameComplete}
          onRenameCancel={onFolderRenameCancel}
          onEmojiClick={onFolderEmojiClick}
        />
        {/* Folder children with collapse animation */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: folder.isOpen ? '1fr' : '0fr',
            transition: transitions.collapse.height,
            overflow: 'visible',
          }}
        >
          <div
            style={{
              minHeight: 0,
              overflow: 'hidden',
              opacity: folder.isOpen ? 1 : 0,
              transition: transitions.collapse.content,
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: sidebarLayout.itemToItemGap,
                paddingBottom: sidebarLayout.sectionContentPaddingBottom,
              }}
            >
              {/* Empty state - shown when folder has no notes or subfolders */}
              {folder.notes.length === 0 &&
              (!folder.subfolders || folder.subfolders.length === 0) ? (
                <SidebarEmptyState
                  message={PAGE_EMPTY_STATES.folderIsEmpty.message}
                  shortcut={PAGE_EMPTY_STATES.folderIsEmpty.shortcut}
                  suffix={PAGE_EMPTY_STATES.folderIsEmpty.suffix}
                  level={level + 1}
                />
              ) : (
                <>
                  {/* Notes in folder */}
                  {folder.notes.map((note) => (
                    <SidebarItemNote
                      key={note.id}
                      id={note.id}
                      title={note.title}
                      icon={note.icon || undefined}
                      hasContent={note.hasContent}
                      isSelected={
                        selection.type === 'note' &&
                        (selection.multiSelectIds?.has(note.id) ||
                          selection.itemId === note.id) &&
                        selection.context === notesContext
                      }
                      hasOpenContextMenu={openContextMenuId === note.id}
                      level={level + 1}
                      onClick={(e) =>
                        onFolderNoteClick?.(note.id, notesContext, e)
                      }
                      actions={
                        getNoteActions ? getNoteActions(note.id) : undefined
                      }
                      onDragStart={onNoteDragStart}
                      onDragEnd={onDragEnd}
                      isDragging={draggedItemId?.includes(note.id) || false}
                      context={notesContext}
                      reorderable={Boolean(onNoteDragOverForReorder)}
                      onDragOverForReorder={(id, pos) =>
                        onNoteDragOverForReorder?.(id, pos, notesContext)
                      }
                      onDragLeaveForReorder={onNoteDragLeaveForReorder}
                      onDropForReorder={(id, pos) => {
                        
                        onNoteDropForReorder?.(id, pos, notesContext);
                      }}
                      dropPosition={
                        reorderDropTarget?.type === 'note' &&
                        reorderDropTarget?.id === note.id
                          ? reorderDropTarget.position
                          : null
                      }
                      onClearAllReorderIndicators={() => {
                        // Clear both note and folder reorder indicators
                        onNoteDragLeaveForReorder?.();
                        onFolderDragLeaveForReorder?.();
                      }}
                      isEditing={editingNoteId === note.id}
                      onRenameComplete={onNoteRenameComplete}
                      onRenameCancel={onNoteRenameCancel}
                      onEmojiClick={onNoteEmojiClick}
                    />
                  ))}
                  {/* Subfolders */}
                  {folder.subfolders?.map((subfolder) =>
                    renderFolder(subfolder, level + 1, childFolderParentId)
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={(e) => {
        // Clear selection when clicking on empty space (not on child elements)
        if (e.target === e.currentTarget && onClearSelection) {
          onClearSelection();
        }
      }}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: sidebarLayout.sectionToSectionGap,
      }}
    >
      {/* Favourites Section - Always visible */}
      <SidebarSection
        title={SECTIONS['favourites-notes'].label}
        isCollapsed={isFavouritesCollapsed}
        onToggle={onFavouritesToggle}
        isToggleDisabled={
          favouriteNotes.length === 0 &&
          favouriteFolders.length === 0 &&
          isFavouritesCollapsed
        } // Only disable when empty AND collapsed
        onHeaderClick={onFavouritesHeaderClick}
        badge={
          favouriteNotes.length + favouriteFolders.length > 0
            ? String(favouriteNotes.length + favouriteFolders.length)
            : undefined
        }
        onClearAllReorderIndicators={() => {
          // Clear both note and folder reorder indicators when hovering over section
          onNoteDragLeaveForReorder?.();
          onFolderDragLeaveForReorder?.();
        }}
        emptyMessage={SECTIONS['favourites-notes'].emptyMessage}
        emptyShortcut={SECTIONS['favourites-notes'].emptyShortcut}
        emptySuffix={SECTIONS['favourites-notes'].emptySuffix}
      >
        {/* Favorite Folders - Fully functional with expansion */}
        {favouriteFolders.map((folder) =>
          renderFolder(folder, 0, 'favourites')
        )}

        {/* Favorite Notes */}
        {favouriteNotes.map((note) => (
          <SidebarItemNote
            key={note.id}
            id={note.id}
            title={note.title}
            icon={note.icon || undefined}
            hasContent={note.hasContent}
            isSelected={
              selection.type === 'note' &&
              (selection.multiSelectIds?.has(note.id) ||
                selection.itemId === note.id) &&
              selection.context === 'favourites'
            }
            hasOpenContextMenu={openContextMenuId === note.id}
            level={0}
            onClick={(e) => onFavouriteClick(note.id, e)}
            actions={getNoteActions ? getNoteActions(note.id) : undefined}
            onDragStart={onNoteDragStart}
            onDragEnd={onDragEnd}
            isDragging={draggedItemId?.includes(note.id) || false}
            context="favourites"
            onDragOverForReorder={(id, pos) =>
              onNoteDragOverForReorder?.(id, pos, 'favourites')
            }
            onDragLeaveForReorder={onNoteDragLeaveForReorder}
            onDropForReorder={(id, pos) => {
              
              onNoteDropForReorder?.(id, pos, 'favourites');
            }}
            dropPosition={
              reorderDropTarget?.type === 'note' &&
              reorderDropTarget?.id === note.id
                ? reorderDropTarget.position
                : null
            }
            onClearAllReorderIndicators={() => {
              // Clear both note and folder reorder indicators
              onNoteDragLeaveForReorder?.();
              onFolderDragLeaveForReorder?.();
            }}
            isEditing={editingNoteId === note.id}
            onRenameComplete={onNoteRenameComplete}
            onRenameCancel={onNoteRenameCancel}
            onEmojiClick={onNoteEmojiClick}
          />
        ))}
      </SidebarSection>

      {/* Folders Section */}
      <SidebarSection
        title={SECTIONS.folders.label}
        isCollapsed={isFoldersCollapsed}
        onToggle={onFoldersToggle}
        isToggleDisabled={false} // Never disable - Cluttered folder is always visible
        onHeaderClick={onFoldersHeaderClick}
        badge={(() => {
          const count =
            1 + // System folder: Cluttered (always shown)
            folders.filter((f) => f.id !== DAILY_NOTES_FOLDER_ID).length; // Regular folders (Daily Notes filtered out)
          return count > 0 ? String(count) : undefined;
        })()}
        emptyMessage={SECTIONS.folders.emptyMessage}
        emptyShortcut={SECTIONS.folders.emptyShortcut}
        emptySuffix={SECTIONS.folders.emptySuffix}
        actions={foldersHeaderActions}
        enableAutoExpandHeader={true}
        onClearAllReorderIndicators={() => {
          // Clear both note and folder reorder indicators when hovering over section
          onNoteDragLeaveForReorder?.();
          onFolderDragLeaveForReorder?.();
        }}
      >
        <>
          {/* Cluttered Folder - Special system folder - Always visible */}
          <div
            key="cluttered-folder"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: sidebarLayout.itemToItemGap,
            }}
          >
            <SidebarItemFolder
              id="cluttered"
              label={SECTIONS.cluttered.label}
              folderId={CLUTTERED_FOLDER_ID}
              emoji={undefined} // Force no emoji - Cluttered uses Tray icon
              isOpen={!isClutteredCollapsed}
              badge={
                clutteredNotes.length > 0
                  ? String(clutteredNotes.length)
                  : undefined
              }
              level={0}
              onClick={onClutteredFolderClick || (() => {})}
              onToggle={onClutteredToggle}
              isToggleDisabled={
                clutteredNotes.length === 0 && isClutteredCollapsed
              } // Only disable when empty AND collapsed
              onDragEnd={onDragEnd}
              onDragOver={onClutteredDragOver}
              onDragLeave={onDragLeave}
              onDrop={onClutteredDrop}
              isDropTarget={dropTargetType === CLUTTERED_FOLDER_ID}
              isSelected={
                selection.type === 'folder' &&
                selection.multiSelectIds?.has('cluttered') &&
                selection.context === 'cluttered'
              }
              context="cluttered"
              onClearAllReorderIndicators={() => {
                // Clear both note and folder reorder indicators when hovering over cluttered
                onNoteDragLeaveForReorder?.();
                onFolderDragLeaveForReorder?.();
              }}
              // No onEmojiClick - Cluttered is a system folder and icon cannot be changed
            />
            {/* Cluttered folder children with collapse animation */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: !isClutteredCollapsed ? '1fr' : '0fr',
                transition: transitions.collapse.height,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  minHeight: 0,
                  overflow: 'hidden',
                  opacity: !isClutteredCollapsed ? 1 : 0,
                  transition: transitions.collapse.content,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: sidebarLayout.itemToItemGap,
                    paddingTop: '2px',
                    paddingBottom: '2px',
                  }}
                >
                  {clutteredNotes.length === 0 ? (
                    <SidebarEmptyState
                      message={SECTIONS.cluttered.emptyMessage}
                      shortcut={SECTIONS.cluttered.emptyShortcut}
                      suffix={SECTIONS.cluttered.emptySuffix}
                      level={0}
                    />
                  ) : (
                    clutteredNotes.map((note) => (
                      <SidebarItemNote
                        key={note.id}
                        id={note.id}
                        title={note.title}
                        icon={note.icon || undefined}
                        hasContent={note.hasContent}
                        isSelected={
                          selection.type === 'note' &&
                          (selection.multiSelectIds?.has(note.id) ||
                            selection.itemId === note.id) &&
                          selection.context === CLUTTERED_FOLDER_ID
                        }
                        hasOpenContextMenu={openContextMenuId === note.id}
                        level={1}
                        onClick={(e) => onClutteredNoteClick(note.id, e)}
                        actions={
                          getNoteActions ? getNoteActions(note.id) : undefined
                        }
                        onDragStart={onNoteDragStart}
                        onDragEnd={onDragEnd}
                        isDragging={draggedItemId?.includes(note.id) || false}
                        context="cluttered"
                        reorderable={Boolean(onNoteDragOverForReorder)}
                        onDragOverForReorder={(id, pos) =>
                          onNoteDragOverForReorder?.(
                            id,
                            pos,
                            CLUTTERED_FOLDER_ID
                          )
                        }
                        onDragLeaveForReorder={onNoteDragLeaveForReorder}
                        onDropForReorder={(id, pos) => {
                          
                          onNoteDropForReorder?.(id, pos, CLUTTERED_FOLDER_ID);
                        }}
                        dropPosition={
                          reorderDropTarget?.type === 'note' &&
                          reorderDropTarget?.id === note.id
                            ? reorderDropTarget.position
                            : null
                        }
                        onClearAllReorderIndicators={() => {
                          // Clear both note and folder reorder indicators
                          onNoteDragLeaveForReorder?.();
                          onFolderDragLeaveForReorder?.();
                        }}
                        isEditing={editingNoteId === note.id}
                        onRenameComplete={onNoteRenameComplete}
                        onRenameCancel={onNoteRenameCancel}
                        onEmojiClick={onNoteEmojiClick}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Regular folders (exclude system folders like Daily Notes) */}
          {folders
            .filter((folder) => folder.id !== DAILY_NOTES_FOLDER_ID)
            .map((folder) => renderFolder(folder, 0))}
        </>
      </SidebarSection>
    </div>
  );
};
