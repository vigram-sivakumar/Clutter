import {
  RefObject,
  ReactNode,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Keyboard,
  Sun,
  Moon,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
} from '../../../../icons';
import { TertiaryButton, Button, DismissButton } from '../../../ui-buttons';
import { ContextMenu } from '../../../ui-primitives';
import { SidebarContainer } from './SidebarContainer';
import { NotesView } from './views/NotesView';
import { TagsView } from './views/TagsView';
import { CalendarView } from './views/CalendarView';
import { TaskView } from './views/TaskView';
import { EmojiTray } from '../../shared/emoji';
import { sizing } from '../../../../tokens/sizing';
import { useTheme } from '../../../../hooks/useTheme';
import { useMultiSelect } from '../../../../hooks/useMultiSelect';
import { useSidebarResize } from '../../../../hooks/useSidebarResize';
import { CLUTTERED_FOLDER_ID, DAILY_NOTES_FOLDER_ID } from '@clutter/domain';
import {
  useNotesStore,
  useFoldersStore,
  useOrderingStore,
  useTagsStore,
  useAllTags,
  useUIStateStore,
} from '@clutter/state';
import { sortByOrder, useConfirmation } from '@clutter/shared';
import { Note, Folder } from '@clutter/domain';
import { getFolderIcon, getNoteIcon } from '../../../../utils/itemIcons';
import { handleTagRenameWithColorPreservation } from '../../../../utils/tagRenameHelpers';
import type { SidebarNote, SidebarFolder, GlobalSelection } from './types';

/**
 * AppSidebar Design Specification
 * Single source of truth for all design tokens used in this component
 */
const DESIGN = {
  sizing: {
    minWidth: 220, // Minimum sidebar width (resizable)
    maxWidth: 400, // Maximum sidebar width (resizable)
    defaultWidth: 256, // Default sidebar width
    collapsedWidth: sizing.layout.sidebarCollapsedWidth, // Width when sidebar is collapsed
    iconSize: sizing.icon.sm, // Size of icons in footer buttons
  },
  footer: {
    iconButtonGap: '4px', // Gap between footer buttons
    padding: '16px', // Footer padding when sidebar is expanded
  },
} as const;

// Check if running in Tauri (native app) - Reserved for future use
// const _isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Helper component for emoji picker button with hover state
const EmojiPickerButton = ({
  icon,
  hasCustomEmoji,
  onClick,
  onDismiss,
}: {
  icon: React.ReactNode;
  hasCustomEmoji: boolean;
  onClick: (_e: React.MouseEvent<HTMLButtonElement>) => void;
  onDismiss: (_e: React.MouseEvent<HTMLButtonElement>) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Button variant="filled" icon={icon} onClick={onClick} size="medium" />
      {hasCustomEmoji && isHovered && (
        <DismissButton onClick={onDismiss} size={16} iconSize={12} />
      )}
    </div>
  );
};

interface AppSidebarProps {
  onToggleTheme: () => void;
  onShowKeyboardShortcuts: () => void;
  keyboardButtonRef: RefObject<HTMLDivElement>;
  isCollapsed?: boolean;
  onTagClick?: (_tag: string, _source: 'all' | 'favorites') => void;
  onFolderClick?: (_folderId: string) => void; // Called when folder is clicked
  onBackToEditor?: () => void; // Called when we need to go back (e.g., tag deleted)
  onNoteClickFromSidebar?: () => void; // Called when note clicked from sidebar
  onNoteClickWithBlock?: (_noteId: string, _blockId: string) => void; // Called when task clicked from sidebar
  onDateSelect?: (_date: Date) => void; // Called when calendar date is selected (for daily notes)
  onToggleSidebar?: () => void;
  currentView?: { type: 'editor' } | { type: 'tagFilter'; tag: string }; // Current main view
  onYearClick?: (_year: string) => void; // Called when year is clicked in daily notes
  onMonthClick?: (_year: string, _month: string) => void; // Called when month is clicked in daily notes
}

export const AppSidebar = ({
  onToggleTheme,
  onShowKeyboardShortcuts,
  keyboardButtonRef,
  isCollapsed = false,
  onTagClick,
  onFolderClick,
  onYearClick,
  onMonthClick,
  onBackToEditor,
  onNoteClickFromSidebar,
  onNoteClickWithBlock,
  onDateSelect,
  onToggleSidebar,
  currentView,
}: AppSidebarProps) => {
  const { mode, colors } = useTheme();
  const { openMultiActionConfirmation } = useConfirmation();

  // Connect to stores
  const {
    notes,
    currentNoteId,
    setCurrentNoteId,
    createNote,
    updateNote,
    deleteNote,
  } = useNotesStore();

  const {
    folders: storeFolders,
    createFolder,
    moveFolder,
    updateFolder,
    deleteFolder,
    getFolderDepth,
  } = useFoldersStore();

  // Subscribe to the entire orders object so we re-render when it changes
  const orders = useOrderingStore((state) => state.orders);
  const { getOrder, insertBefore, insertAfter, setOrder } = useOrderingStore();

  // Get all tags (needed for unique tag name generation)
  const allTags = useAllTags();

  // Tab state - read from persisted store
  const sidebarTab = useUIStateStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStateStore((state) => state.setSidebarTab);

  // Local state for contentType (synced with store)
  const [contentType, setContentType] = useState<
    'notes' | 'tasks' | 'tags' | 'task'
  >(sidebarTab);

  // Sync local state with store on mount
  useEffect(() => {
    setContentType(sidebarTab);
  }, [sidebarTab]);

  // Global selection state - unified selection tracking for all sidebar items
  const [selection, setSelection] = useState<GlobalSelection>({
    type: null,
    itemId: null,
    context: null,
    multiSelectIds: new Set(),
  });

  // Track which item has an open context menu for highlighting
  const [openContextMenuId, setOpenContextMenuId] = useState<string | null>(
    null
  );

  // Debug: Log when context menu ID changes

  // Calendar week state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek); // Go back to Sunday
    return startOfWeek;
  });

  // Calendar selected date state
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    return today;
  });

  // Handle date selection - update local state and call parent handler
  const handleDateSelect = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      onDateSelect?.(date);
    },
    [onDateSelect]
  );

  // 🕐 AUTO-UPDATE: Detect day change at exactly 00:00:00 and update calendar
  useEffect(() => {
    const scheduleNextDayCheck = () => {
      const now = new Date();
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0
      ); // 00:00:00 tomorrow
      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      // Set timeout to trigger at exactly 00:00:00
      const timeoutId = setTimeout(() => {
        const newToday = new Date();
        newToday.setHours(0, 0, 0, 0); // Normalize to start of day

        // Update selected date to today
        setSelectedDate(newToday);

        // Update week to current week
        const dayOfWeek = newToday.getDay();
        const startOfWeek = new Date(newToday);
        startOfWeek.setDate(newToday.getDate() - dayOfWeek); // Go back to Sunday
        setCurrentWeekStart(startOfWeek);

        // Notify parent if handler exists
        onDateSelect?.(newToday);

        // Schedule next day check
        scheduleNextDayCheck();
      }, msUntilMidnight);

      return timeoutId;
    };

    const timeoutId = scheduleNextDayCheck();

    return () => clearTimeout(timeoutId);
  }, [onDateSelect]);

  // Sidebar resize
  const {
    sidebarWidth,
    isResizing,
    handleMouseDown: handleResizeMouseDown,
  } = useSidebarResize({
    minWidth: DESIGN.sizing.minWidth,
    maxWidth: DESIGN.sizing.maxWidth,
    defaultWidth: DESIGN.sizing.defaultWidth,
    isCollapsed,
    onToggleSidebar,
  });

  // Section collapse states - Use persistent UI state store
  const isClutteredCollapsed = useUIStateStore(
    (state) => state.clutteredCollapsed
  );
  const setClutteredCollapsed = useUIStateStore(
    (state) => state.setClutteredCollapsed
  );

  const isDailyNotesCollapsed = useUIStateStore(
    (state) => state.dailyNotesCollapsed
  );
  const setDailyNotesCollapsed = useUIStateStore(
    (state) => state.setDailyNotesCollapsed
  );

  const isFavouritesCollapsed = useUIStateStore(
    (state) => state.favouritesCollapsed
  );
  const setFavouritesCollapsed = useUIStateStore(
    (state) => state.setFavouritesCollapsed
  );

  const isFoldersCollapsed = useUIStateStore((state) => state.foldersCollapsed);
  const setFoldersCollapsed = useUIStateStore(
    (state) => state.setFoldersCollapsed
  );

  const openFolderIds =
    useUIStateStore((state) => state.openFolderIds) || new Set<string>();
  const setOpenFolderIds = useUIStateStore((state) => state.setOpenFolderIds);
  const toggleFolderOpen = useUIStateStore((state) => state.toggleFolderOpen);

  const isAllTagsCollapsed = useUIStateStore((state) => state.allTagsCollapsed);
  const setAllTagsCollapsed = useUIStateStore(
    (state) => state.setAllTagsCollapsed
  );

  const isFavouriteTagsCollapsed = useUIStateStore(
    (state) => state.favouriteTagsCollapsed
  );
  const setFavouriteTagsCollapsed = useUIStateStore(
    (state) => state.setFavouriteTagsCollapsed
  );

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{
    type: 'note' | 'folder';
    id: string;
    ids: string[];
    context?: string; // Track where drag originated
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    type: 'folder' | 'cluttered' | 'dailyNotes';
    id: string | null;
  } | null>(null);

  // Ref to track drag leave timeout (prevents flicker when moving between items)
  const dragLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Inline editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);

  // Emoji picker state
  const [isEmojiTrayOpen, setIsEmojiTrayOpen] = useState(false);
  const [emojiTrayPosition, setEmojiTrayPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 100, left: 100 });
  const [editingEmojiNoteId, setEditingEmojiNoteId] = useState<string | null>(
    null
  );
  const [editingEmojiFolderId, setEditingEmojiFolderId] = useState<
    string | null
  >(null);

  // Reordering state
  const [reorderDropTarget, setReorderDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
    type: 'note' | 'folder';
  } | null>(null);

  const handleFolderToggle = useCallback(
    (folderId: string) => {
      toggleFolderOpen(folderId);
    },
    [toggleFolderOpen]
  );

  // Helper to check if TipTap JSON content is empty
  const isContentEmpty = useCallback((content: string): boolean => {
    try {
      if (!content || content.trim() === '') return true;

      const json = JSON.parse(content);
      // Empty TipTap document: {"type":"doc","content":[{"type":"paragraph"}]} or similar
      if (!json.content || json.content.length === 0) return true;

      // Check if all nodes are empty paragraphs
      return json.content.every((node: any) => {
        if (
          node.type === 'paragraph' &&
          (!node.content || node.content.length === 0)
        ) {
          return true;
        }
        return false;
      });
    } catch {
      return true; // If parsing fails, consider it empty
    }
  }, []);

  // Transform store data to sidebar format
  // Filter out only deleted notes - show all others (including empty ones)
  // Active notes (non-deleted)
  const activeNotes = useMemo(
    () => notes.filter((n: Note) => !n.deletedAt),
    [notes]
  );

  // Cluttered notes (notes without a folder OR with invalid folder reference)
  // Excludes daily notes - they're saved under DAILY_NOTES_FOLDER_ID
  const clutteredNotes: SidebarNote[] = useMemo(() => {
    const activeFolderIds = new Set(
      storeFolders.filter((f: Folder) => !f.deletedAt).map((f: Folder) => f.id)
    );

    const notes = activeNotes
      .filter((n: Note) => {
        // Exclude daily notes - they're saved under special "Daily notes" folder ID
        if (n.folderId === DAILY_NOTES_FOLDER_ID) return false;
        // No folder assigned = cluttered
        if (!n.folderId) return true;
        // Has folder but folder doesn't exist or is deleted = cluttered
        return !activeFolderIds.has(n.folderId);
      })
      .map((n: Note) => ({
        id: n.id,
        title: n.title || 'Untitled',
        icon: n.emoji,
        isFavorite: n.isFavorite,
        hasContent: !isContentEmpty(n.content),
        dailyNoteDate: n.dailyNoteDate, // Include dailyNoteDate for icon logic
      }));

    // Apply custom ordering
    const orderedIds = getOrder(CLUTTERED_FOLDER_ID);
    return sortByOrder(notes, orderedIds);
  }, [activeNotes, storeFolders, getOrder, orders, isContentEmpty]);

  // Daily notes (notes with dailyNoteDate field)
  const dailyNotes: SidebarNote[] = useMemo(() => {
    const notes = activeNotes
      .filter((n: Note) => n.folderId === DAILY_NOTES_FOLDER_ID)
      .map((n: Note) => ({
        id: n.id,
        title: n.title || 'Untitled',
        icon: n.emoji,
        isFavorite: n.isFavorite,
        hasContent: !isContentEmpty(n.content),
        dailyNoteDate: n.dailyNoteDate, // Include dailyNoteDate for icon logic
      }));

    // Apply custom ordering
    const orderedIds = getOrder('daily-notes');
    return sortByOrder(notes, orderedIds);
  }, [activeNotes, getOrder, orders, isContentEmpty]);

  // Favorite notes
  // Excludes daily notes - they're saved under DAILY_NOTES_FOLDER_ID
  const favouriteNotes: SidebarNote[] = useMemo(() => {
    const notes = activeNotes
      .filter((n: Note) => n.isFavorite && n.folderId !== DAILY_NOTES_FOLDER_ID)
      .map((n: Note) => ({
        id: n.id,
        title: n.title || 'Untitled',
        icon: n.emoji,
        isFavorite: n.isFavorite,
        hasContent: !isContentEmpty(n.content),
        dailyNoteDate: n.dailyNoteDate, // Include dailyNoteDate for icon logic
      }));

    // Apply custom ordering
    const orderedIds = getOrder('favourites');
    return sortByOrder(notes, orderedIds);
  }, [activeNotes, getOrder, orders, isContentEmpty]);

  // Favorite folders
  // Excludes system folders (Cluttered, Daily Notes)
  const favouriteFolders: SidebarFolder[] = useMemo(() => {
    const activeFolders = storeFolders.filter((f: Folder) => !f.deletedAt);

    // Recursive function to build full folder tree (same as sidebarFolders)
    const buildFolderTree = (parentId: string | null): SidebarFolder[] => {
      const folders = activeFolders
        .filter((f: Folder) => f.parentId === parentId)
        .map((f: Folder) => {
          // Get notes in this folder and apply ordering
          const folderNotes = activeNotes
            .filter((n: Note) => n.folderId === f.id)
            .map((n: Note) => ({
              id: n.id,
              title: n.title || 'Untitled',
              icon: n.emoji,
              isFavorite: n.isFavorite,
              hasContent: !isContentEmpty(n.content),
              dailyNoteDate: n.dailyNoteDate,
            }));

          const noteOrderIds = getOrder(`folder-notes-${f.id}`);
          const sortedNotes = sortByOrder(folderNotes, noteOrderIds);

          // Recursively get subfolders
          const subfolders = buildFolderTree(f.id);

          return {
            id: f.id || '',
            name: f.name || 'Untitled Folder',
            emoji: f.emoji || null,
            isOpen: openFolderIds.has(f.id),
            notes: sortedNotes,
            subfolders: subfolders,
          };
        });

      // Apply ordering based on parent context
      const context = parentId ? `folder-children-${parentId}` : 'root-folders';
      const orderedIds = getOrder(context);
      return sortByOrder(folders, orderedIds);
    };

    // Get favorite folders and build their full trees
    const favoriteRootFolders = storeFolders
      .filter(
        (f: Folder) =>
          !f.deletedAt &&
          f.isFavorite &&
          f.id !== CLUTTERED_FOLDER_ID &&
          f.id !== DAILY_NOTES_FOLDER_ID
      )
      .map((f: Folder) => {
        // Get notes in this folder
        const folderNotes = activeNotes
          .filter((n: Note) => n.folderId === f.id)
          .map((n: Note) => ({
            id: n.id,
            title: n.title || 'Untitled',
            icon: n.emoji,
            isFavorite: n.isFavorite,
            hasContent: !isContentEmpty(n.content),
            dailyNoteDate: n.dailyNoteDate,
          }));

        const noteOrderIds = getOrder(`folder-notes-${f.id}`);
        const sortedNotes = sortByOrder(folderNotes, noteOrderIds);

        // Get subfolders
        const subfolders = buildFolderTree(f.id);

        return {
          id: f.id || '',
          name: f.name || 'Untitled Folder',
          emoji: f.emoji || null,
          isOpen: openFolderIds.has(f.id),
          notes: sortedNotes,
          subfolders: subfolders,
        };
      });

    // Apply custom ordering for favorites
    const orderedIds = getOrder('favourites');
    return sortByOrder(favoriteRootFolders, orderedIds);
  }, [
    storeFolders,
    activeNotes,
    openFolderIds,
    getOrder,
    orders,
    isContentEmpty,
  ]);

  // Transform folders with hierarchy
  const sidebarFolders: SidebarFolder[] = useMemo(() => {
    const activeFolders = storeFolders.filter((f: Folder) => !f.deletedAt);

    // Recursive function to build folder hierarchy
    const buildFolderTree = (parentId: string | null): SidebarFolder[] => {
      const folders = activeFolders
        .filter((f: Folder) => f.parentId === parentId)
        .map((f: Folder) => {
          // Get notes in this folder and apply ordering
          // Daily notes automatically excluded (they have folderId === DAILY_NOTES_FOLDER_ID)
          const folderNotes = activeNotes
            .filter((n: Note) => n.folderId === f.id)
            .map((n: Note) => ({
              id: n.id,
              title: n.title || 'Untitled',
              icon: n.emoji,
              isFavorite: n.isFavorite,
              hasContent: !isContentEmpty(n.content),
              dailyNoteDate: n.dailyNoteDate, // Include dailyNoteDate for icon logic
            }));

          const noteOrderIds = getOrder(`folder-notes-${f.id}`);
          const sortedNotes = sortByOrder(folderNotes, noteOrderIds);

          return {
            id: f.id || '',
            name: f.name || 'Untitled Folder',
            emoji: f.emoji || null,
            isOpen: openFolderIds.has(f.id),
            notes: sortedNotes,
            subfolders: buildFolderTree(f.id), // Recursively build subfolders
          };
        });

      // Apply ordering to folders at this level
      const context = parentId ? `folder-children-${parentId}` : 'root-folders';
      const orderedIds = getOrder(context);
      return sortByOrder(folders, orderedIds);
    };

    // Start with root folders (parentId === null)
    return buildFolderTree(null);
  }, [
    storeFolders,
    activeNotes,
    openFolderIds,
    getOrder,
    orders,
    isContentEmpty,
  ]);

  // Build flat list of all visible notes for multi-select (in display order)
  const visibleNotes = useMemo(() => {
    const flatNotes: SidebarNote[] = [];

    // Add favourite notes
    if (!isFavouritesCollapsed) {
      flatNotes.push(...favouriteNotes);
    }

    // Add cluttered notes
    if (!isClutteredCollapsed) {
      flatNotes.push(...clutteredNotes);
    }

    // Add folder notes (recursively)
    const addFolderNotes = (folders: SidebarFolder[]) => {
      folders.forEach((folder) => {
        if (folder.isOpen) {
          flatNotes.push(...folder.notes);
          addFolderNotes(folder.subfolders || []);
        }
      });
    };

    if (!isFoldersCollapsed) {
      addFolderNotes(sidebarFolders);
    }

    return flatNotes;
  }, [
    favouriteNotes,
    clutteredNotes,
    sidebarFolders,
    isClutteredCollapsed,
    isFavouritesCollapsed,
    isFoldersCollapsed,
  ]);

  // Use multi-select hook for notes
  const {
    selectedIds: selectedNoteIds,
    lastClickedId: lastClickedNoteId,
    handleClick: handleNoteMultiSelectBase,
    clearSelection: clearNoteSelection,
  } = useMultiSelect({
    items: visibleNotes,
    getItemId: (note) => note.id,
    onSingleSelect: (noteId) => {
      // 🔍 DIAGNOSTIC: Track sidebar note selection

      setCurrentNoteId(noteId);
      onNoteClickFromSidebar?.();
    },
  });

  // Build flat list of all visible folders for multi-select (in display order)
  const visibleFolders = useMemo(() => {
    const flatFolders: SidebarFolder[] = [];

    const addFolders = (folders: SidebarFolder[]) => {
      folders.forEach((folder) => {
        flatFolders.push(folder);
        // If folder is open, recursively add subfolders
        if (
          folder.isOpen &&
          folder.subfolders &&
          folder.subfolders.length > 0
        ) {
          addFolders(folder.subfolders);
        }
      });
    };

    if (!isFoldersCollapsed) {
      addFolders(sidebarFolders);
    }

    return flatFolders;
  }, [sidebarFolders, isFoldersCollapsed]);

  // Use multi-select hook for folders
  const {
    selectedIds: selectedFolderIds,
    lastClickedId: lastClickedFolderId,
    handleClick: handleFolderMultiSelectBase,
    clearSelection: clearFolderSelection,
  } = useMultiSelect({
    items: visibleFolders,
    getItemId: (folder) => folder.id,
    onSingleSelect: (folderId) => {
      onFolderClick?.(folderId);
    },
  });

  // Wrap handlers to implement exclusive selection (only notes OR folders, not both)
  // and track selection context for context-aware highlighting
  // Track the last note click context for selection state
  const lastNoteContextRef = useRef<string | null>(null);

  const handleNoteMultiSelect = useCallback(
    (noteId: string, event?: React.MouseEvent, context?: string) => {
      // Clear folder selection when selecting notes
      clearFolderSelection();
      // Store context for the effect to use
      lastNoteContextRef.current = context || null;
      handleNoteMultiSelectBase(noteId, event);
    },
    [handleNoteMultiSelectBase, clearFolderSelection]
  );

  // Sync selection state when selectedNoteIds changes (after multi-select hook updates)
  useEffect(() => {
    if (selectedNoteIds.size > 0 && lastClickedNoteId) {
      setSelection({
        type: 'note',
        itemId: lastClickedNoteId,
        context: lastNoteContextRef.current,
        multiSelectIds: selectedNoteIds,
      });
    }
  }, [selectedNoteIds, lastClickedNoteId]);

  // Track the last folder click context for selection state
  const lastFolderContextRef = useRef<string | null>(null);

  const handleFolderMultiSelect = useCallback(
    (folderId: string, event?: React.MouseEvent, context?: string) => {
      // Clear note selection when selecting folders
      clearNoteSelection();
      // Store context for the effect to use
      lastFolderContextRef.current = context || null;
      handleFolderMultiSelectBase(folderId, event);
    },
    [handleFolderMultiSelectBase, clearNoteSelection]
  );

  // Sync selection state when selectedFolderIds changes (after multi-select hook updates)
  useEffect(() => {
    if (selectedFolderIds.size > 0 && lastClickedFolderId) {
      setSelection({
        type: 'folder',
        itemId: lastClickedFolderId,
        context: lastFolderContextRef.current,
        multiSelectIds: selectedFolderIds,
      });
    }
  }, [selectedFolderIds, lastClickedFolderId]);

  // Build flat list of all visible tasks for multi-select
  const visibleTasks = useMemo(() => {
    const activeNotes = notes.filter((n: Note) => !n.deletedAt);
    const tasks: Array<{
      id: string;
      text: string;
      checked: boolean;
      noteId: string;
      noteTitle: string;
      noteEmoji: string | null;
    }> = [];

    activeNotes.forEach((note) => {
      try {
        const parsed = JSON.parse(note.content);
        const traverseNodes = (node: any) => {
          if (node.type === 'listBlock' && node.attrs?.listType === 'task') {
            let text = '';
            if (node.content && Array.isArray(node.content)) {
              text = node.content
                .map((child: any) => {
                  if (child.type === 'text') {
                    return child.text || '';
                  }
                  return '';
                })
                .join('');
            }

            if (text.trim()) {
              tasks.push({
                id: node.attrs.blockId || crypto.randomUUID(),
                text: text.trim(),
                checked: node.attrs.checked || false,
                noteId: note.id,
                noteTitle: note.title || 'Untitled',
                noteEmoji: note.emoji,
              });
            }
          }

          if (node.content && Array.isArray(node.content)) {
            node.content.forEach(traverseNodes);
          }
        };

        if (parsed.type === 'doc' && parsed.content) {
          parsed.content.forEach(traverseNodes);
        }
      } catch {
        // Ignore parsing errors
      }
    });

    return tasks;
  }, [notes]);

  // Use multi-select hook for tasks
  const {
    selectedIds: selectedTaskIds,
    lastClickedId: lastClickedTaskId,
    handleClick: handleTaskMultiSelectBase,
    clearSelection: clearTaskSelection,
  } = useMultiSelect({
    items: visibleTasks,
    getItemId: (task) => task.id,
    onSingleSelect: (_taskId) => {
      // Optional: single click behavior for tasks
    },
  });

  // Track the last task click context for selection state
  const lastTaskContextRef = useRef<string | null>(null);

  const handleTaskMultiSelect = useCallback(
    (taskId: string, event?: React.MouseEvent, context?: string) => {
      // Clear note/folder selection when selecting tasks
      clearNoteSelection();
      clearFolderSelection();
      // Store context for the effect to use
      lastTaskContextRef.current = context || null;
      handleTaskMultiSelectBase(taskId, event);

      // If this is a normal click (no modifiers), navigate to task (like tags do)
      if (!event?.metaKey && !event?.ctrlKey && !event?.shiftKey) {
        // Find the task to get its noteId
        const task = visibleTasks.find((t) => t.id === taskId);
        if (task && onNoteClickWithBlock) {
          onNoteClickWithBlock(task.noteId, taskId);
        }
      }
    },
    [
      handleTaskMultiSelectBase,
      clearNoteSelection,
      clearFolderSelection,
      visibleTasks,
      onNoteClickWithBlock,
    ]
  );

  // Sync selection state when selectedTaskIds changes (after multi-select hook updates)
  useEffect(() => {
    if (selectedTaskIds.size > 0 && lastClickedTaskId) {
      setSelection({
        type: 'task',
        itemId: lastClickedTaskId,
        context: lastTaskContextRef.current,
        multiSelectIds: selectedTaskIds,
      });
    }
  }, [selectedTaskIds, lastClickedTaskId]);

  // Build flat list of all visible tags for multi-select
  const visibleTags = useMemo(() => {
    return allTags.map((tag) => ({ id: tag }));
  }, [allTags]);

  // Use multi-select hook for tags
  const {
    selectedIds: selectedTagIds,
    lastClickedId: lastClickedTagId,
    handleClick: handleTagMultiSelectBase,
    clearSelection: clearTagSelection,
  } = useMultiSelect({
    items: visibleTags,
    getItemId: (tag) => tag.id,
    onSingleSelect: (_tagId) => {
      // Normal click: Navigate to tag filtered view (preserve existing behavior)
      // The context will be set by the wrapper handler
    },
  });

  // Track the last tag click context for selection state
  const lastTagContextRef = useRef<string | null>(null);

  const handleTagMultiSelect = useCallback(
    (tagId: string, event?: React.MouseEvent, context?: string) => {
      // Clear note/folder/task selection when selecting tags
      clearNoteSelection();
      clearFolderSelection();
      clearTaskSelection();
      // Store context for the effect to use
      lastTagContextRef.current = context || null;
      handleTagMultiSelectBase(tagId, event);

      // If this is a normal click (no modifiers), navigate to tag
      if (!event?.metaKey && !event?.ctrlKey && !event?.shiftKey) {
        onTagClick?.(tagId, context as 'all' | 'favorites');
      }
    },
    [
      handleTagMultiSelectBase,
      clearNoteSelection,
      clearFolderSelection,
      clearTaskSelection,
      onTagClick,
    ]
  );

  // Sync selection state when selectedTagIds changes (after multi-select hook updates)
  useEffect(() => {
    if (selectedTagIds.size > 0 && lastClickedTagId) {
      setSelection({
        type: 'tag',
        itemId: lastClickedTagId,
        context: lastTagContextRef.current,
        multiSelectIds: selectedTagIds,
      });
    }
  }, [selectedTagIds, lastClickedTagId]);

  // Clear all selections (called when clicking empty space)
  const handleClearSelection = useCallback(() => {
    clearNoteSelection();
    clearFolderSelection();
    clearTaskSelection();
    clearTagSelection();
    setSelection({
      type: null,
      itemId: null,
      context: null,
      multiSelectIds: new Set(),
    });
  }, [
    clearNoteSelection,
    clearFolderSelection,
    clearTaskSelection,
    clearTagSelection,
  ]);

  // Handlers
  const handleCreateNote = useCallback(async () => {
    // Simply create a new note - no auto-deletion (matches Notion/Craft/Tana)
    await createNote(); // ✅ AWAIT block creation
    // Note: setCurrentNoteId is called internally by createNote after block exists

    // Notify parent to switch to full-page editor view
    onNoteClickFromSidebar?.();
  }, [createNote, onNoteClickFromSidebar]);

  const handleCreateFolder = useCallback(
    (parentId?: string) => {
      // Check depth limit before creating subfolder
      if (parentId) {
        const depth = getFolderDepth(parentId);
        if (depth >= 10) {
          alert(
            'Maximum folder depth (10 levels) reached. Cannot create subfolder.'
          );
          return;
        }
      }

      // Create folder with empty name (shows "Untitled Folder" placeholder)
      const folderId = createFolder('', parentId || null);
      if (folderId && onFolderClick) {
        onFolderClick(folderId); // Navigate to the newly created folder
      }
    },
    [createFolder, getFolderDepth, onFolderClick]
  );

  const handleFoldersHeaderClick = useCallback(() => {
    // Navigate to "All Folders" view when clicking "Folders" section title
    if (onFolderClick) {
      onFolderClick('all-folders'); // Special ID for All Folders view
    }
  }, [onFolderClick]);

  const handleFavouritesHeaderClick = useCallback(() => {
    // Navigate to "Favourites" view when clicking "Favourites" section title
    if (onFolderClick) {
      onFolderClick('all-favourites'); // Special ID for Favourites view
    }
  }, [onFolderClick]);

  const handleAllTagsHeaderClick = useCallback(() => {
    // Navigate to "All Tags" view when clicking "All Tags" section title
    if (onFolderClick) {
      onFolderClick('all-tags'); // Special ID for All Tags view
    }
  }, [onFolderClick]);

  const handleFavouriteTagsHeaderClick = useCallback(() => {
    // Navigate to "Favourite Tags" view when clicking "Favourites" section title in Tags tab
    if (onFolderClick) {
      onFolderClick('favourite-tags'); // Special ID for Favourite Tags view
    }
  }, [onFolderClick]);

  const handleTodayHeaderClick = useCallback(() => {
    if (onFolderClick) {
      onFolderClick('today-tasks');
    }
  }, [onFolderClick]);

  const handleOverdueHeaderClick = useCallback(() => {
    if (onFolderClick) {
      onFolderClick('overdue-tasks');
    }
  }, [onFolderClick]);

  const handleUpcomingHeaderClick = useCallback(() => {
    if (onFolderClick) {
      onFolderClick('upcoming-tasks');
    }
  }, [onFolderClick]);

  const handleUnplannedHeaderClick = useCallback(() => {
    if (onFolderClick) {
      onFolderClick('unplanned-tasks');
    }
  }, [onFolderClick]);

  const handleCompletedHeaderClick = useCallback(() => {
    if (onFolderClick) {
      onFolderClick('completed-tasks');
    }
  }, [onFolderClick]);

  const handleCreateNoteInFolder = useCallback(
    async (folderId: string) => {
      // Simply create a new note in the folder - no auto-deletion
      const newNote = await createNote({ folderId });
      setCurrentNoteId(newNote.id);

      // Notify parent to switch to full-page editor view
      onNoteClickFromSidebar?.();
    },
    [createNote, setCurrentNoteId, onNoteClickFromSidebar]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (type: 'note' | 'folder', id: string, context: string) => {
      let itemsToDrag: string[] = [id];

      if (type === 'note' && selectedNoteIds.has(id)) {
        // Dragging a selected note → drag all selected notes
        itemsToDrag = Array.from(selectedNoteIds);
      } else if (type === 'folder' && selectedFolderIds.has(id)) {
        // Dragging a selected folder → drag all selected folders
        itemsToDrag = Array.from(selectedFolderIds);
      } else {
        // Dragging non-selected item → clear selection, drag only this item
        clearNoteSelection();
        clearFolderSelection();
      }

      setDraggedItem({ type, id, ids: itemsToDrag, context });
    },
    [
      selectedNoteIds,
      selectedFolderIds,
      clearNoteSelection,
      clearFolderSelection,
    ]
  );

  const handleDragOver = useCallback(
    (type: 'folder' | 'cluttered', id: string | null) => {
      setDropTarget({ type, id });
      // Clear reorder indicator when showing folder drop highlight
      setReorderDropTarget(null);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  // Helper to check if targetId is a descendant of folderId
  const isDescendantOf = useCallback(
    (folderId: string, targetId: string): boolean => {
      const visited = new Set<string>();
      let currentId: string | null = targetId;

      // Walk up the tree from targetId
      while (currentId && visited.size < 100) {
        // Safety limit to prevent infinite loops
        if (currentId === folderId) return true;
        visited.add(currentId);

        const folder = storeFolders.find((f) => f.id === currentId);
        if (!folder) break;

        currentId = folder.parentId;
      }

      return false;
    },
    [storeFolders]
  );

  const handleDrop = useCallback(
    (
      targetType: 'folder' | 'cluttered' | 'dailyNotes',
      targetId: string | null
    ) => {
      if (!draggedItem) return;

      const { type: dragType, ids: draggedIds } = draggedItem;

      if (dragType === 'note') {
        // Daily notes folder is system-managed - users can't manually move notes into it
        if (targetType === 'dailyNotes') {
          setDraggedItem(null);
          setDropTarget(null);
          return;
        }

        // Move all selected notes to folder or cluttered
        const newFolderId =
          targetType === 'cluttered'
            ? null
            : targetType === 'folder'
              ? targetId
              : null;

        // Move all dragged notes to new folder
        draggedIds.forEach((noteId) => {
          updateNote(noteId, { folderId: newFolderId });
        });

        // If moving to a folder, open the folder to show the notes
        if (newFolderId) {
          setOpenFolderIds(
            (prev: Set<string>) => new Set([...prev, newFolderId])
          );
        }
      } else if (dragType === 'folder') {
        // Move all selected folders into another folder or to root
        const newParentId = targetType === 'cluttered' ? null : targetId;

        let hasErrors = false;

        // Validate and move each folder
        draggedIds.forEach((folderId) => {
          // Prevent moving folder into itself
          if (newParentId === folderId) {
            hasErrors = true;
            return; // Skip this folder
          }

          // Prevent moving folder into its own descendants (would create circular reference)
          if (newParentId && isDescendantOf(folderId, newParentId)) {
            hasErrors = true;
            return; // Skip this folder
          }

          // Safe to move this folder
          moveFolder(folderId, newParentId);
        });

        // Show error message if any folders couldn't be moved
        if (hasErrors) {
          alert(
            'Some folders could not be moved to prevent circular references'
          );
        }
      }

      setDraggedItem(null);
      setDropTarget(null);
    },
    [draggedItem, updateNote, moveFolder, setOpenFolderIds, isDescendantOf]
  );

  const handleDragEnd = useCallback(() => {
    // If we have a valid drop target when drag ends, manually trigger the drop
    // This is a fallback for when the browser's native drop event doesn't fire
    if (dropTarget && draggedItem) {
      handleDrop(dropTarget.type, dropTarget.id);
    }

    setDraggedItem(null);
    setDropTarget(null);
    setReorderDropTarget(null);
  }, [dropTarget, draggedItem, handleDrop]);

  // Reordering handlers
  const handleDragOverForReorder = useCallback(
    (
      type: 'note' | 'folder',
      id: string,
      position: 'before' | 'after',
      context: string
    ) => {
      // Cancel any pending hide from dragLeave (prevents flicker)
      if (dragLeaveTimeoutRef.current) {
        clearTimeout(dragLeaveTimeoutRef.current);
        dragLeaveTimeoutRef.current = null;
      }

      if (!draggedItem || draggedItem.type !== type) {
        return; // Types don't match
      }

      // Don't show reorder indicator when hovering over ourselves
      if (draggedItem.id === id) {
        return;
      }

      // Check if we should show reorder indicator
      const shouldShowIndicator = (() => {
        // Same context → always allow reorder
        if (draggedItem.context === context) return true;

        // Different context → check if cross-context move is allowed

        // For notes: allow moving into an expanded folder's note list
        if (type === 'note') {
          // Extract folder ID from context (e.g., "folder-notes-123")
          const folderMatch = context.match(/folder-notes-(.+)/);
          if (folderMatch) {
            const folderId = folderMatch[1];
            return openFolderIds.has(folderId); // Allow if folder is expanded
          }
          // Allow moving to cluttered
          if (context === CLUTTERED_FOLDER_ID) return true;
        }

        // For folders: allow moving between root and subfolders, or between different subfolder levels
        if (type === 'folder') {
          // Moving to root-folders → always allow (unnesting)
          if (context === 'root-folders') return true;

          // Moving into an expanded folder's children
          const folderMatch = context.match(/folder-children-(.+)/);
          if (folderMatch) {
            const folderId = folderMatch[1];
            return openFolderIds.has(folderId); // Allow if folder is expanded
          }
        }

        return false;
      })();

      if (shouldShowIndicator) {
        setReorderDropTarget({ id, position, type });
        // Clear folder drop highlight when showing reorder indicator
        setDropTarget(null);
      }
    },
    [draggedItem, openFolderIds]
  );

  const handleDragLeaveForReorder = useCallback(() => {
    // Clear any existing timeout
    if (dragLeaveTimeoutRef.current) {
      clearTimeout(dragLeaveTimeoutRef.current);
    }

    // Add a small delay before hiding the indicator
    // If dragOver is called within this time, it will cancel this
    dragLeaveTimeoutRef.current = setTimeout(() => {
      setReorderDropTarget(null);
      dragLeaveTimeoutRef.current = null;
    }, 50); // 50ms delay - enough to prevent flicker, not noticeable
  }, []);

  const handleDropForReorder = useCallback(
    (
      type: 'note' | 'folder',
      targetId: string,
      position: 'before' | 'after',
      context: string
    ) => {
      if (!draggedItem || draggedItem.type !== type) {
        return;
      }

      const draggedId = draggedItem.id;
      const draggedContext = draggedItem.context;

      // Don't reorder if dropping on itself
      if (draggedId === targetId) {
        setReorderDropTarget(null);
        return;
      }

      // Check if we're moving between different contexts (e.g., cluttered → folder)
      const isContextChange = draggedContext !== context;

      // If moving a note to a different context (e.g., from cluttered to a folder)
      if (isContextChange && type === 'note') {
        // Extract folderId from context
        let newFolderId: string | null = null;
        if (context.startsWith('folder-notes-')) {
          newFolderId = context.replace('folder-notes-', '');
        } else if (context === CLUTTERED_FOLDER_ID) {
          newFolderId = null;
        }

        // Move the note to the new folder
        updateNote(draggedId, { folderId: newFolderId });

        // If moving to a folder, ensure it's open
        if (newFolderId) {
          setOpenFolderIds(
            (prev: Set<string>) => new Set([...prev, newFolderId])
          );
        }
      }

      // If moving a folder to a different context (e.g., root → into another folder, or subfolder → root)
      if (isContextChange && type === 'folder') {
        // Extract parent folder ID from context
        let newParentId: string | null = null;
        if (context.startsWith('folder-children-')) {
          newParentId = context.replace('folder-children-', '');
        } else if (context === 'root-folders') {
          newParentId = null;
        }

        // Prevent moving folder into itself
        if (newParentId === draggedId) {
          setReorderDropTarget(null);
          setDraggedItem(null);
          setDropTarget(null);
          return;
        }

        // Prevent moving folder into its own descendants (would create circular reference)
        if (newParentId && isDescendantOf(draggedId, newParentId)) {
          alert('Cannot move a folder into its own subfolder');
          setReorderDropTarget(null);
          setDraggedItem(null);
          setDropTarget(null);
          return;
        }

        // Move the folder to the new parent
        moveFolder(draggedId, newParentId);

        // If moving into a folder, ensure it's open
        if (newParentId) {
          setOpenFolderIds(
            (prev: Set<string>) => new Set([...prev, newParentId])
          );
        }
      }

      // Initialize order if empty - add all items in this context
      const currentOrder = getOrder(context);

      if (currentOrder.length === 0) {
        // Get all items in this context
        let allItemIds: string[] = [];

        if (type === 'note') {
          if (context === 'favourites') {
            allItemIds = favouriteNotes.map((n) => n.id);
          } else if (context === CLUTTERED_FOLDER_ID) {
            allItemIds = clutteredNotes.map((n) => n.id);
          } else if (context.startsWith('folder-notes-')) {
            const folderId = context.replace('folder-notes-', '');
            allItemIds = activeNotes
              .filter((n) => n.folderId === folderId)
              .map((n) => n.id);
          }
        } else if (type === 'folder') {
          if (context === 'root-folders') {
            allItemIds = sidebarFolders.map((f) => f.id);
          } else if (context.startsWith('folder-children-')) {
            const parentId = context.replace('folder-children-', '');
            // Find subfolder IDs recursively
            const findSubfolders = (folders: SidebarFolder[]): string[] => {
              for (const f of folders) {
                if (f.id === parentId) {
                  return f.subfolders?.map((sf) => sf.id) || [];
                }
                const found = findSubfolders(f.subfolders || []);
                if (found.length > 0) return found;
              }
              return [];
            };
            allItemIds = findSubfolders(sidebarFolders);
          }
        }

        // If the item is moving to a new context, include it in the list
        if (isContextChange && !allItemIds.includes(draggedId)) {
          allItemIds.push(draggedId);
        }

        // Initialize with current display order
        if (allItemIds.length > 0) {
          setOrder(context, allItemIds);
        }
      }

      // Update the order in the store
      if (position === 'before') {
        insertBefore(context, draggedId, targetId);
      } else {
        insertAfter(context, draggedId, targetId);
      }

      // Clear all drag states
      setReorderDropTarget(null);
      setDraggedItem(null);
      setDropTarget(null);
    },
    [
      draggedItem,
      insertBefore,
      insertAfter,
      getOrder,
      setOrder,
      favouriteNotes,
      clutteredNotes,
      sidebarFolders,
      activeNotes,
      updateNote,
      setOpenFolderIds,
      moveFolder,
      isDescendantOf,
    ]
  );

  // Note actions with context menu
  const handleRenameNote = useCallback((noteId: string) => {
    setEditingNoteId(noteId);
  }, []);

  const handleNoteRenameComplete = useCallback(
    (noteId: string, newTitle: string) => {
      if (newTitle.trim() !== '') {
        updateNote(noteId, { title: newTitle.trim() });
      }
      setEditingNoteId(null);
    },
    [updateNote]
  );

  const handleNoteRenameCancel = useCallback(() => {
    setEditingNoteId(null);
  }, []);

  // Emoji picker handlers
  const handleNoteEmojiClick = useCallback(
    (noteId: string, buttonElement: HTMLButtonElement) => {
      const rect = buttonElement.getBoundingClientRect();
      setEmojiTrayPosition({ top: rect.bottom + 8, left: rect.left });
      setEditingEmojiNoteId(noteId);
      setEditingEmojiFolderId(null);
      setIsEmojiTrayOpen(true);
    },
    []
  );

  const handleFolderEmojiClick = useCallback(
    (folderId: string, buttonElement: HTMLButtonElement) => {
      const rect = buttonElement.getBoundingClientRect();
      setEmojiTrayPosition({ top: rect.bottom + 8, left: rect.left });
      setEditingEmojiFolderId(folderId);
      setEditingEmojiNoteId(null);
      setIsEmojiTrayOpen(true);
    },
    []
  );

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      if (editingEmojiNoteId) {
        updateNote(editingEmojiNoteId, { emoji });
      } else if (editingEmojiFolderId) {
        updateFolder(editingEmojiFolderId, { emoji });
      }
      setIsEmojiTrayOpen(false);
      setEditingEmojiNoteId(null);
      setEditingEmojiFolderId(null);
    },
    [editingEmojiNoteId, editingEmojiFolderId, updateNote, updateFolder]
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      // Delete note immediately without confirmation
      deleteNote(noteId);

      // If deleting the currently open note, keep it open but update context
      // The parent component (NoteEditor) will handle updating the view context
      // No navigation needed - user stays on the same note
    },
    [deleteNote]
  );

  // Cache note actions to prevent re-creating JSX elements on every render
  const noteActionsCache = useMemo(() => {
    const cache = new Map<string, ReactNode[]>();

    notes.forEach((note) => {
      const noteId = note.id;
      const hasCustomEmoji = !!note.emoji;
      const currentIcon = getNoteIcon({
        emoji: note.emoji,
        dailyNoteDate: note.dailyNoteDate,
        hasContent: !!note.content && note.content.trim().length > 0,
        size: 16,
        color: colors.text.secondary,
      });

      cache.set(noteId, [
        <ContextMenu
          key="more"
          items={[
            {
              buttonGroup: [
                <Button
                  key="rename"
                  variant="tertiary"
                  icon={<Pencil size={16} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRenameNote(noteId);
                  }}
                  size="medium"
                  fullWidth
                >
                  Rename
                </Button>,
                <EmojiPickerButton
                  key="emoji"
                  icon={currentIcon}
                  hasCustomEmoji={hasCustomEmoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    const buttonElement = e.currentTarget as HTMLButtonElement;
                    handleNoteEmojiClick(noteId, buttonElement);
                  }}
                  onDismiss={(e) => {
                    e.stopPropagation();
                    updateNote(noteId, { emoji: undefined });
                  }}
                />,
              ],
            },
            { separator: true },
            {
              icon: <Trash2 size={16} />,
              label: 'Delete',
              onClick: () => handleDeleteNote(noteId),
              danger: true,
            },
          ]}
          onOpenChange={(isOpen) =>
            setOpenContextMenuId(isOpen ? noteId : null)
          }
        >
          <TertiaryButton icon={<MoreVertical size={16} />} size="xs" />
        </ContextMenu>,
      ]);
    });

    return cache;
  }, [
    notes,
    colors.text.secondary,
    handleRenameNote,
    handleNoteEmojiClick,
    handleDeleteNote,
    updateNote,
  ]);

  const getNoteActions = useCallback(
    (noteId: string): ReactNode[] => {
      return noteActionsCache.get(noteId) || [];
    },
    [noteActionsCache]
  );

  // Folder actions with context menu
  const handleRenameFolder = useCallback((folderId: string) => {
    setEditingFolderId(folderId);
  }, []);

  const handleFolderRenameComplete = useCallback(
    (folderId: string, newName: string) => {
      if (newName.trim() !== '') {
        updateFolder(folderId, { name: newName.trim() });
      }
      setEditingFolderId(null);
    },
    [updateFolder]
  );

  const handleFolderRenameCancel = useCallback(() => {
    setEditingFolderId(null);
  }, []);

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      // Count notes in folder (including subfolders)
      const countNotesInFolder = (id: string): number => {
        const directNotes = notes.filter(
          (n) => n.folderId === id && !n.deletedAt
        ).length;
        const childFolders = storeFolders.filter(
          (f) => f.parentId === id && !f.deletedAt
        );
        const childNotes = childFolders.reduce(
          (sum, child) => sum + countNotesInFolder(child.id),
          0
        );
        return directNotes + childNotes;
      };

      const noteCount = countNotesInFolder(folderId);
      const folder = storeFolders.find((f) => f.id === folderId);
      const folderName = folder?.name || 'this folder';

      if (noteCount === 0) {
        // Empty folder - delete immediately without confirmation
        deleteFolder(folderId);
      } else {
        // Has notes - show confirmation with 3 options
        openMultiActionConfirmation(
          'Delete Folder',
          `"${folderName}" contains ${noteCount} note${noteCount === 1 ? '' : 's'}.\n\nWhat would you like to do?`,
          [
            {
              label: 'Cancel',
              variant: 'secondary',
              onClick: () => {}, // Just closes
            },
            {
              label: 'Delete Folder Only',
              variant: 'primary',
              onClick: () => deleteFolder(folderId, { keepNotes: true }),
            },
            {
              label: 'Delete All',
              variant: 'danger',
              onClick: () => deleteFolder(folderId, { keepNotes: false }),
            },
          ]
        );
      }
    },
    [notes, storeFolders, deleteFolder, openMultiActionConfirmation]
  );

  // Cache folder actions to prevent re-creating JSX elements on every render
  const folderActionsCache = useMemo(() => {
    const cache = new Map<string, ReactNode[]>();

    // Add system folder actions
    const systemFolderIds = [CLUTTERED_FOLDER_ID, DAILY_NOTES_FOLDER_ID];
    systemFolderIds.forEach((folderId) => {
      cache.set(folderId, [
        <TertiaryButton
          key="add"
          icon={<Plus size={16} />}
          onClick={(e) => {
            e.stopPropagation();
            handleCreateNoteInFolder(folderId);
          }}
          size="xs"
        />,
      ]);
    });

    // Add regular folder actions
    storeFolders.forEach((folder) => {
      const folderId = folder.id;
      const isSystemFolder = systemFolderIds.includes(folderId);

      if (!isSystemFolder) {
        const hasCustomEmoji = !!folder.emoji;
        const currentIcon = getFolderIcon({
          folderId,
          emoji: folder.emoji,
          isOpen: false,
          size: 16,
          color: colors.text.secondary,
        });

        cache.set(folderId, [
          <TertiaryButton
            key="add"
            icon={<Plus size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              handleCreateNoteInFolder(folderId);
            }}
            size="xs"
          />,
          <ContextMenu
            key="more"
            items={[
              {
                buttonGroup: [
                  <Button
                    key="rename"
                    variant="tertiary"
                    icon={<Pencil size={16} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameFolder(folderId);
                    }}
                    size="medium"
                    fullWidth
                  >
                    Rename
                  </Button>,
                  <EmojiPickerButton
                    key="emoji"
                    icon={currentIcon}
                    hasCustomEmoji={hasCustomEmoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      const buttonElement =
                        e.currentTarget as HTMLButtonElement;
                      handleFolderEmojiClick(folderId, buttonElement);
                    }}
                    onDismiss={(e) => {
                      e.stopPropagation();
                      updateFolder(folderId, { emoji: undefined });
                    }}
                  />,
                ],
              },
              { separator: true },
              {
                icon: <Trash2 size={16} />,
                label: 'Delete',
                onClick: () => handleDeleteFolder(folderId),
                danger: true,
              },
            ]}
            onOpenChange={(isOpen) =>
              setOpenContextMenuId(isOpen ? folderId : null)
            }
          >
            <TertiaryButton icon={<MoreVertical size={16} />} size="xs" />
          </ContextMenu>,
        ]);
      }
    });

    return cache;
  }, [
    storeFolders,
    colors.text.secondary,
    handleCreateNoteInFolder,
    handleRenameFolder,
    handleFolderEmojiClick,
    handleDeleteFolder,
    updateFolder,
  ]);

  const getFolderActions = useCallback(
    (folderId: string): ReactNode[] => {
      return folderActionsCache.get(folderId) || [];
    },
    [folderActionsCache]
  );

  // Tag actions with context menu
  const handleRenameTag = useCallback((tag: string) => {
    setEditingTag(tag);
  }, []);

  const handleTagRenameComplete = useCallback(
    (oldTag: string, newTag: string) => {
      if (newTag.trim() !== '' && newTag.trim() !== oldTag) {
        // Use shared helper to handle rename with color preservation
        const { renameTag, getTagMetadata, updateTagMetadata } =
          useTagsStore.getState();
        handleTagRenameWithColorPreservation(
          oldTag,
          newTag.trim(),
          renameTag,
          (tagName: string) => getTagMetadata(tagName) ?? null,
          updateTagMetadata
        );
      }
      setEditingTag(null);
    },
    []
  );

  const handleTagRenameCancel = useCallback(() => {
    setEditingTag(null);
  }, []);

  const handleDeleteTag = useCallback(
    (tag: string) => {
      // Soft delete the tag using the store's deleteTag function
      const { deleteTag } = useTagsStore.getState();
      deleteTag(tag);

      // If the deleted tag was selected, clear the selection and go back to editor
      if (
        selection.type === 'tag' &&
        selection.itemId?.toLowerCase() === tag.toLowerCase()
      ) {
        setSelection({ type: null, itemId: null, context: null });
        onBackToEditor?.();
      }
    },
    [selection, onBackToEditor]
  );

  // Cache tag actions to prevent re-creating JSX elements on every render
  const tagActionsCache = useMemo(() => {
    const cache = new Map<string, ReactNode[]>();

    // Add actions for each tag (using allTags from useAllTags hook)
    allTags.forEach((tag) => {
      cache.set(tag, [
        <ContextMenu
          key="more"
          items={[
            {
              icon: <Pencil size={16} />,
              label: 'Rename',
              onClick: () => handleRenameTag(tag),
            },
            { separator: true },
            {
              icon: <Trash2 size={16} />,
              label: 'Delete',
              onClick: () => handleDeleteTag(tag),
              danger: true,
            },
          ]}
          onOpenChange={(isOpen) => setOpenContextMenuId(isOpen ? tag : null)}
        >
          <TertiaryButton icon={<MoreVertical size={16} />} size="xs" />
        </ContextMenu>,
      ]);
    });

    return cache;
  }, [allTags, handleRenameTag, handleDeleteTag, setOpenContextMenuId]);

  const getTagActions = useCallback(
    (tag: string): ReactNode[] => {
      return tagActionsCache.get(tag) || [];
    },
    [tagActionsCache]
  );

  // Task actions (placeholder for now - can be expanded later)
  const getTaskActions = useCallback((_taskId: string): ReactNode[] => {
    // For now, tasks don't have context menu actions
    // Future: Add actions like "Delete task", "Move to another note", etc.
    return [];
  }, []);

  // Keyboard shortcut for creating new note (Cmd+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+N (Mac) or Ctrl+N (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateNote();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateNote]);

  // Keyboard shortcut for toggling sidebar (Cmd+\)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+\ (Mac) or Ctrl+\ (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        onToggleSidebar?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onToggleSidebar]);

  // Keyboard shortcut for opening today's note (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+D (both Mac and Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        handleDateSelect(today); // Use handleDateSelect to update both local state and call parent
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDateSelect]);

  // Keyboard shortcuts for switching sidebar tabs (Cmd+1, Cmd+2, Cmd+3, Cmd+4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setContentType('notes');
          setSidebarTab('notes');
        } else if (e.key === '2') {
          e.preventDefault();
          setContentType('tasks');
          setSidebarTab('tasks');
        } else if (e.key === '3') {
          e.preventDefault();
          setContentType('task');
          setSidebarTab('task');
        } else if (e.key === '4') {
          e.preventDefault();
          setContentType('tags');
          setSidebarTab('tags');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setSidebarTab]);

  // Global logic: Sync tag selection with currentView (single source of truth)
  useEffect(() => {
    if (currentView?.type === 'tagFilter') {
      // In tag view: select the tag being viewed
      setSelection((prev) => ({
        ...prev,
        type: 'tag',
        itemId: currentView.tag,
      }));
    } else if (selection.type === 'tag') {
      // In editor view: clear tag selection (but keep note/folder selection)
      setSelection((prev) => ({
        ...prev,
        type: null,
        itemId: null,
        context: null,
      }));
    }
  }, [currentView, selection.type]);

  // Cleanup drag leave timeout on unmount
  useEffect(() => {
    return () => {
      if (dragLeaveTimeoutRef.current) {
        clearTimeout(dragLeaveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="sidebar"
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${sidebarWidth}px`,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `.5px solid ${colors.border.default}`,
        position: 'relative',
        marginLeft: isCollapsed ? `-${sidebarWidth}px` : '0',
        transition: 'margin-left 0.3s ease-out',
        overflow: 'visible', // Allow sticky positioning for section/group headers
        backgroundColor: colors.background.secondary,
      }}
    >
      {/* Full sidebar content - always rendered, slides out with container */}
      <div
        style={{
          flex: 1,
          overflow: 'visible', // Allow sticky positioning for section/group headers
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <SidebarContainer
          contentType={contentType}
          onContentTypeChange={(type) => {
            const tab = type as 'notes' | 'tasks' | 'tags' | 'task';
            setContentType(tab);
            setSidebarTab(tab); // Persist to store
          }}
          onCreateNote={handleCreateNote}
          onSearch={() => {}}
          createButtonShortcut="⌘ N"
          onCreateTask={() => {
            // TODO: Implement create task functionality
          }}
          onOpenCalendar={() => {
            // TODO: Implement calendar functionality
          }}
          onCreateTag={() => {
            // Generate unique tag name
            let tagName = 'Untitled Tag';
            let counter = 1;

            // Find a unique name (case-insensitive)
            while (
              allTags.some((t) => t.toLowerCase() === tagName.toLowerCase())
            ) {
              counter++;
              tagName = `Untitled Tag ${counter}`;
            }

            // Create the tag metadata immediately
            const { upsertTagMetadata } = useTagsStore.getState();
            upsertTagMetadata(
              tagName,
              '', // empty description
              true, // description visible
              false, // not favorite
              undefined // NO color - let it use hash-based default so it updates as user types
            );

            // Navigate to the tag filtered view
            if (onTagClick) {
              onTagClick(tagName, 'all');

              // Auto-focus and select the title after navigation
              requestAnimationFrame(() => {
                const titleElement = document.querySelector(
                  '[contenteditable="true"]'
                ) as HTMLElement;
                if (
                  titleElement &&
                  titleElement.textContent?.includes('Untitled Tag')
                ) {
                  titleElement.focus();
                  // Select all text for easy replacement
                  const range = document.createRange();
                  range.selectNodeContents(titleElement);
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  selection?.addRange(range);
                }
              });
            }
          }}
          currentWeekStart={currentWeekStart}
          onWeekChange={setCurrentWeekStart}
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          width="100%"
          height="100%"
          showWindowControls={true}
          onToggleSidebar={onToggleSidebar}
          isCollapsed={isCollapsed}
        >
          {/* Conditional tab rendering - simple and clean */}
          {contentType === 'notes' && (
            <NotesView
              clutteredNotes={clutteredNotes}
              onClutteredNoteClick={(id, e) =>
                handleNoteMultiSelect(id, e, CLUTTERED_FOLDER_ID)
              }
              isClutteredCollapsed={isClutteredCollapsed}
              onClutteredToggle={() =>
                setClutteredCollapsed(!isClutteredCollapsed)
              }
              onClutteredFolderClick={() => {
                handleFolderMultiSelect('cluttered', undefined, 'cluttered');
                onFolderClick?.(CLUTTERED_FOLDER_ID);
              }}
              favouriteNotes={favouriteNotes}
              favouriteFolders={favouriteFolders}
              onFavouriteClick={(id, e) =>
                handleNoteMultiSelect(id, e, 'favourites')
              }
              onFavouriteFolderClick={(id, e) =>
                handleFolderMultiSelect(id, e, 'favourites')
              }
              onFavouriteFolderToggle={handleFolderToggle}
              isFavouritesCollapsed={isFavouritesCollapsed}
              onFavouritesToggle={() =>
                setFavouritesCollapsed(!isFavouritesCollapsed)
              }
              onFavouritesHeaderClick={handleFavouritesHeaderClick}
              folders={sidebarFolders}
              onFolderClick={(id, context, e) =>
                handleFolderMultiSelect(id, e, context)
              }
              onFolderToggle={handleFolderToggle}
              onFolderNoteClick={(noteId, context, e) =>
                handleNoteMultiSelect(noteId, e, context)
              }
              onFolderAdd={handleCreateFolder}
              isFoldersCollapsed={isFoldersCollapsed}
              onFoldersToggle={() => setFoldersCollapsed(!isFoldersCollapsed)}
              onFoldersHeaderClick={handleFoldersHeaderClick}
              foldersHeaderActions={[
                <TertiaryButton
                  key="add"
                  icon={<Plus size={sizing.icon.sm} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateFolder();
                  }}
                  size="xs"
                />,
              ]}
              selection={selection}
              currentNoteId={
                currentView?.type === 'editor' ? currentNoteId : null
              }
              onClearSelection={handleClearSelection}
              openContextMenuId={openContextMenuId}
              getNoteActions={getNoteActions}
              getFolderActions={getFolderActions}
              onNoteDragStart={(id, context) =>
                handleDragStart('note', id, context)
              }
              onFolderDragStart={(id, context) =>
                handleDragStart('folder', id, context)
              }
              onDragEnd={handleDragEnd}
              onFolderDragOver={(id) => handleDragOver('folder', id)}
              onClutteredDragOver={() => handleDragOver('cluttered', null)}
              onDragLeave={handleDragLeave}
              onFolderDrop={(id) => handleDrop('folder', id)}
              onClutteredDrop={() => handleDrop('cluttered', null)}
              draggedItemId={draggedItem?.ids || null}
              dropTargetId={dropTarget?.id || null}
              dropTargetType={dropTarget?.type || null}
              onNoteDragOverForReorder={(id, pos, ctx) =>
                handleDragOverForReorder('note', id, pos, ctx)
              }
              onNoteDragLeaveForReorder={handleDragLeaveForReorder}
              onNoteDropForReorder={(id, pos, ctx) =>
                handleDropForReorder('note', id, pos, ctx)
              }
              onFolderDragOverForReorder={(id, pos, ctx) =>
                handleDragOverForReorder('folder', id, pos, ctx)
              }
              onFolderDragLeaveForReorder={handleDragLeaveForReorder}
              onFolderDropForReorder={(id, pos, ctx) =>
                handleDropForReorder('folder', id, pos, ctx)
              }
              reorderDropTarget={reorderDropTarget}
              editingNoteId={editingNoteId}
              editingFolderId={editingFolderId}
              onNoteRenameComplete={handleNoteRenameComplete}
              onNoteRenameCancel={handleNoteRenameCancel}
              onFolderRenameComplete={handleFolderRenameComplete}
              onFolderRenameCancel={handleFolderRenameCancel}
              onNoteEmojiClick={handleNoteEmojiClick}
              onFolderEmojiClick={handleFolderEmojiClick}
            />
          )}

          {/* Tasks Tab */}
          {contentType === 'tasks' && (
            <CalendarView
              dailyNotes={dailyNotes}
              onDailyNoteClick={(id, e) =>
                handleNoteMultiSelect(id, e, 'dailyNotes')
              }
              isDailyNotesCollapsed={isDailyNotesCollapsed}
              onDailyNotesToggle={() =>
                setDailyNotesCollapsed(!isDailyNotesCollapsed)
              }
              onDailyNotesFolderClick={() =>
                onFolderClick?.(DAILY_NOTES_FOLDER_ID)
              }
              onYearClick={onYearClick}
              onMonthClick={onMonthClick}
              selection={selection}
              currentNoteId={currentNoteId}
              onClearSelection={handleClearSelection}
              openContextMenuId={openContextMenuId}
              getNoteActions={getNoteActions}
              getFolderActions={getFolderActions}
              onNoteDragStart={(id, context) =>
                handleDragStart('note', id, context)
              }
              onDragEnd={handleDragEnd}
              onDragLeave={handleDragLeave}
              draggedItemId={draggedItem?.ids || null}
              dropTargetId={dropTarget?.id || null}
              dropTargetType={dropTarget?.type || null}
              onNoteDragOverForReorder={(id, pos, ctx) =>
                handleDragOverForReorder('note', id, pos, ctx)
              }
              onNoteDragLeaveForReorder={handleDragLeaveForReorder}
              onNoteDropForReorder={(id, pos, ctx) =>
                handleDropForReorder('note', id, pos, ctx)
              }
              reorderDropTarget={reorderDropTarget}
              editingNoteId={editingNoteId}
              onNoteRenameComplete={handleNoteRenameComplete}
              onNoteRenameCancel={handleNoteRenameCancel}
              onNoteEmojiClick={handleNoteEmojiClick}
            />
          )}

          {/* Tags Tab */}
          {contentType === 'tags' && (
            <TagsView
              selection={selection}
              selectedTagIds={selectedTagIds}
              onTagMultiSelect={handleTagMultiSelect}
              onClearSelection={handleClearSelection}
              openContextMenuId={openContextMenuId}
              isAllTagsCollapsed={isAllTagsCollapsed}
              onAllTagsToggle={() => setAllTagsCollapsed(!isAllTagsCollapsed)}
              onAllTagsHeaderClick={handleAllTagsHeaderClick}
              isFavouritesCollapsed={isFavouriteTagsCollapsed}
              onFavouritesToggle={() =>
                setFavouriteTagsCollapsed(!isFavouriteTagsCollapsed)
              }
              onFavouritesHeaderClick={handleFavouriteTagsHeaderClick}
              allTagsHeaderActions={[
                <TertiaryButton
                  key="add"
                  icon={<Plus size={sizing.icon.sm} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Generate unique tag name
                    let tagName = 'Untitled Tag';
                    let counter = 1;

                    // Find a unique name (case-insensitive)
                    while (
                      allTags.some(
                        (t) => t.toLowerCase() === tagName.toLowerCase()
                      )
                    ) {
                      counter++;
                      tagName = `Untitled Tag ${counter}`;
                    }

                    // Create the tag metadata immediately
                    const { upsertTagMetadata } = useTagsStore.getState();
                    upsertTagMetadata(
                      tagName,
                      '', // empty description
                      true, // description visible
                      false, // not favorite
                      undefined // NO color - let it use hash-based default so it updates as user types
                    );

                    // Navigate to the tag filtered view
                    if (onTagClick) {
                      onTagClick(tagName, 'all');

                      // Auto-focus and select the title after navigation
                      requestAnimationFrame(() => {
                        const titleElement = document.querySelector(
                          '[contenteditable="true"]'
                        ) as HTMLElement;
                        if (
                          titleElement &&
                          titleElement.textContent?.includes('Untitled Tag')
                        ) {
                          titleElement.focus();
                          // Select all text for easy replacement
                          const range = document.createRange();
                          range.selectNodeContents(titleElement);
                          const selection = window.getSelection();
                          selection?.removeAllRanges();
                          selection?.addRange(range);
                        }
                      });
                    }
                  }}
                  size="xs"
                />,
              ]}
              getTagActions={getTagActions}
              editingTag={editingTag}
              onTagRenameComplete={handleTagRenameComplete}
              onTagRenameCancel={handleTagRenameCancel}
            />
          )}

          {/* Task Tab - Organized by date */}
          {contentType === 'task' && (
            <TaskView
              onTaskClick={(noteId, taskId) => {
                // Navigate to the note containing the task and scroll to the task block
                if (onNoteClickWithBlock) {
                  onNoteClickWithBlock(noteId, taskId);
                } else {
                  // Fallback if the handler is not provided
                  setCurrentNoteId(noteId);
                  onNoteClickFromSidebar?.();
                }
              }}
              selection={selection}
              openContextMenuId={openContextMenuId}
              onClearSelection={handleClearSelection}
              getTaskActions={getTaskActions}
              selectedTaskIds={selectedTaskIds}
              onTaskMultiSelect={handleTaskMultiSelect}
              onTodayHeaderClick={handleTodayHeaderClick}
              onUpcomingHeaderClick={handleUpcomingHeaderClick}
              onUnplannedHeaderClick={handleUnplannedHeaderClick}
              onCompletedHeaderClick={handleCompletedHeaderClick}
            />
          )}
        </SidebarContainer>
      </div>

      {/* Bottom: Action buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: DESIGN.footer.iconButtonGap,
          padding: DESIGN.footer.padding,
          flexShrink: 0,
        }}
      >
        {useMemo(() => {
          const buttons = [
            {
              id: 'theme',
              icon:
                mode === 'dark' ? (
                  <Sun size={DESIGN.sizing.iconSize} />
                ) : (
                  <Moon size={DESIGN.sizing.iconSize} />
                ),
              onClick: onToggleTheme,
              title:
                mode === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode',
            },
            {
              id: 'keyboard',
              icon: <Keyboard size={DESIGN.sizing.iconSize} />,
              onClick: onShowKeyboardShortcuts,
              ref: keyboardButtonRef,
            },
          ];

          return (
            <>
              {buttons.map((button) => (
                <div
                  key={button.id}
                  ref={button.id === 'keyboard' ? keyboardButtonRef : undefined}
                  style={{
                    display: 'flex',
                  }}
                >
                  <TertiaryButton
                    icon={button.icon}
                    onClick={button.onClick}
                    size="medium"
                  />
                </div>
              ))}
              {/* Spacer to push buttons to the right - always present */}
              <div
                style={{
                  flex: isCollapsed ? 0 : 1,
                  transition: 'flex 0.25s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  minWidth: 0,
                }}
              />
              {/* Trash button at far right (only in expanded state) */}
              {!isCollapsed && (
                <div
                  style={{
                    display: 'flex',
                  }}
                >
                  <TertiaryButton
                    icon={<Trash2 size={DESIGN.sizing.iconSize} />}
                    onClick={() => {
                      onFolderClick?.('deleted-items');
                    }}
                    size="medium"
                  />
                </div>
              )}
            </>
          );
        }, [
          mode,
          onToggleTheme,
          onShowKeyboardShortcuts,
          keyboardButtonRef,
          isCollapsed,
        ])}
      </div>

      {/* Resize Handle - always shown for drag-to-expand functionality */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '4px',
          height: '100%',
          cursor: 'ew-resize',
          backgroundColor: isResizing ? colors.border.default : 'transparent',
          zIndex: 10,
          transition: 'background-color 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = colors.border.default;
          }
        }}
        onMouseLeave={(e) => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      />

      {/* Emoji Tray */}
      <EmojiTray
        isOpen={isEmojiTrayOpen}
        onClose={() => {
          setIsEmojiTrayOpen(false);
          setEditingEmojiNoteId(null);
          setEditingEmojiFolderId(null);
        }}
        onSelect={handleEmojiSelect}
        position={emojiTrayPosition}
      />
    </div>
  );
};
