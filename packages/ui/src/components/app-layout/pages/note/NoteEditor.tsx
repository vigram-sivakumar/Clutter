import {
  ReactNode,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { Star, StarFilled, Copy, Trash2, RotateCcw } from '../../../../icons';
import { NoteTopBar } from './NoteTopBar';
import { AppShell } from '../../layout/AppLayout';
import { PageTitleSection } from '../../shared/content-header';
import { PageContent } from '../../shared/page-content';
import { TitleInputHandle } from '../../shared/content-header/title';
import { TipTapWrapper, TipTapWrapperHandle } from './TipTapWrapper';
import { useEditorContext } from './useEditorContext';
import { EmojiTray } from '../../shared/emoji';
import { MarkdownShortcuts } from '../../../ui-modals';
import {
  TagFilteredNotesView,
  AllTagsListView,
  FavouriteTagsListView,
} from '../tag';
import { FolderListView, AllFoldersListView } from '../folder';
import { FavouritesListView } from '../favourites';
import { DeletedItemsListView } from '../deleted';
import {
  TodayTasksListView,
  OverdueTasksListView,
  UpcomingTasksListView,
  UnplannedTasksListView,
  CompletedTasksListView,
} from '../tasks';
import { DailyNotesYearView, DailyNotesMonthView } from '../daily-notes';
import { useBreadcrumbs, useBreadcrumbFolderIds } from './useBreadcrumbs';
import { CLUTTERED_FOLDER_ID, DAILY_NOTES_FOLDER_ID } from '@clutter/domain';
import { useNotesStore, useFoldersStore, useTagsStore } from '@clutter/state';
import { useConfirmation } from '@clutter/shared';
import { Note } from '@clutter/domain';
import { useTheme } from '../../../../hooks/useTheme';
import { useUIPreferences } from '../../../../hooks/useUIPreferences';
import { sizing } from '../../../../tokens/sizing';
import { getTagColor } from '../../../../utils/tagColors';
import { FilledButton, SecondaryButton } from '../../../ui-buttons';
import { FloatingActionBar } from '../../../ui-primitives';
// Main view type
type MainView =
  | { type: 'editor'; source?: 'deletedItems' | 'default' }
  | { type: 'tagFilter'; tag: string; source: 'all' | 'favorites' }
  | {
      type: 'folderView';
      folderId: string;
      source?: 'deletedItems' | 'default';
    }
  | { type: 'allFoldersView' } // View showing all folders
  | { type: 'favouritesView' } // View showing all favourite notes and folders
  | { type: 'allTagsView' } // View showing all tags
  | { type: 'favouriteTagsView' } // View showing all favourite tags
  | { type: 'todayTasksView' } // View showing today's tasks
  | { type: 'overdueTasksView' } // View showing overdue tasks
  | { type: 'upcomingTasksView' } // View showing upcoming tasks
  | { type: 'unplannedTasksView' } // View showing unplanned tasks
  | { type: 'completedTasksView' } // View showing completed tasks
  | { type: 'deletedItemsView' } // View showing deleted items (trash)
  | { type: 'dailyNotesYearView'; year: string } // View showing daily notes for a year
  | { type: 'dailyNotesMonthView'; year: string; month: string }; // View showing daily notes for a month

// Helper to check if TipTap JSON content is empty
const _isContentEmpty = (content: string): boolean => {
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
};

// Debounce helper with cancel function
const useDebounce = <T extends (..._args: any[]) => void>(
  fn: T,
  delay: number
) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return [debouncedFn, cancel] as const;
};

interface NotesContainerProps {
  children?: ReactNode;
  isInitialized?: boolean;
}

export const NoteEditor = ({
  children,
  isInitialized = true,
}: NotesContainerProps) => {
  // Removed: session refs no longer needed without async block loading

  // 🔍 DIAGNOSTIC: Track component lifecycle (MOUNT/UNMOUNT)
  useEffect(() => {
    console.log('🟢 NoteEditor MOUNT');
    return () => {
      console.error('🔴 NoteEditor UNMOUNT');
    };
  }, []);

  // Notes store
  const {
    notes,
    currentNoteId,
    setCurrentNoteId,
    createNote,
    updateNoteContent,
    updateNoteMeta,
    duplicateNote,
    deleteNote,
    restoreNote,
    permanentlyDeleteNote,
    findDailyNoteByDate,
    createDailyNote,
  } = useNotesStore();

  // Folders store
  const {
    folders,
    createFolder,
    updateFolder,
    deleteFolder,
    restoreFolder,
    permanentlyDeleteFolder,
  } = useFoldersStore();

  // Tags store - includes tagMetadata for deleted tag detection
  const {
    tagMetadata,
    getTagMetadata,
    updateTagMetadata,
    upsertTagMetadata,
    renameTag,
    deleteTag,
    restoreTag,
  } = useTagsStore();

  // Get current note or create one
  const currentNote = useMemo(() => {
    const note =
      notes.find((n) => n.id === currentNoteId && !n.deletedAt) || null;
    return note;
  }, [notes, currentNoteId]);

  // Track note switches for UI transitions
  useEffect(() => {
    console.log('🧭 NOTE SESSION START', {
      noteId: currentNoteId,
      timestamp: Date.now(),
    });
  }, [currentNoteId]);

  // 🔍 DIAGNOSTIC: Note ID Invariant Check (MOVED HERE - after currentNote is defined)
  console.log('🧭 NOTE ID INVARIANT CHECK', {
    routeNoteId: currentNoteId,
    stateNoteId: currentNote?.id,
    stateTitle: currentNote?.title,
    timestamp: Date.now(),
  });

  // 🚨 ASSERTION: Detect split-brain state
  if (currentNote && currentNoteId && currentNote.id !== currentNoteId) {
    console.error('🚨 NOTE ID MISMATCH - SPLIT BRAIN STATE DETECTED', {
      routeNoteId: currentNoteId,
      stateNoteId: currentNote.id,
      stateTitle: currentNote.title,
      stackTrace: new Error().stack,
    });
  }

  // Local state for UI (derived from currentNote)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(
    currentNote?.emoji || null
  );
  const [title, setTitle] = useState<string>(currentNote?.title || '');
  const [description, setDescription] = useState<string>(
    currentNote?.description || ''
  );
  const [showDescriptionInput, setShowDescriptionInput] = useState(false);
  const [tags, setTags] = useState<string[]>(currentNote?.tags || []);
  const [showTagInput, setShowTagInput] = useState(false);
  const [isFavorite, setIsFavorite] = useState(
    currentNote?.isFavorite || false
  );
  const [descriptionVisible, setDescriptionVisible] = useState(
    currentNote?.descriptionVisible ?? true
  );
  const [tagsVisible, setTagsVisible] = useState(
    currentNote?.tagsVisible ?? true
  );

  // 🔥 CRITICAL: Sync local state when currentNote changes (prevents stale title/emoji/metadata)
  // This fixes the bug where switching notes kept old title/emoji because useState only initializes once
  useEffect(() => {
    if (!currentNote) {
      // Clear all local state when no note is selected
      setSelectedEmoji(null);
      setTitle('');
      setDescription('');
      setTags([]);
      setIsFavorite(false);
      setDescriptionVisible(true);
      setTagsVisible(true);
      return;
    }

    // Update local state from currentNote
    setSelectedEmoji(currentNote.emoji || null);
    setTitle(currentNote.title || '');
    setDescription(currentNote.description || '');
    setTags(currentNote.tags || []);
    setIsFavorite(currentNote.isFavorite || false);
    setDescriptionVisible(currentNote.descriptionVisible ?? true);
    setTagsVisible(currentNote.tagsVisible ?? true);
  }, [currentNote]);
  const [showMarkdownShortcuts, setShowMarkdownShortcuts] = useState(false);

  const [isEmojiTrayOpen, setIsEmojiTrayOpen] = useState(false);
  const [emojiTrayPosition, setEmojiTrayPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 100, left: 100 });

  // Content width toggle state
  const [isFullWidth, setIsFullWidth] = useState(false);

  // Main view state
  const [mainView, setMainView] = useState<MainView>({ type: 'editor' });

  // Target block ID for scrolling (e.g., when clicking on a task from sidebar)
  const [targetBlockId, setTargetBlockId] = useState<string | null>(null);

  // Centralized breadcrumb generation
  const breadcrumbs = useBreadcrumbs(mainView, currentNote, currentNoteId);
  const folderPathIds = useBreadcrumbFolderIds(mainView, currentNote);

  // 🔍 DIAGNOSTIC: Track breadcrumb note identity
  console.log('🧭 Breadcrumbs calculated', {
    noteId: currentNote?.id,
    title: currentNote?.title,
    breadcrumbsCount: breadcrumbs?.length,
  });

  // Restore last viewed note or open today's daily note on first load (only in editor mode)
  useEffect(() => {
    // Wait for database to be initialized before opening notes
    if (!isInitialized) return;

    // Only auto-open notes when in editor view, not when viewing folders/tags
    if (mainView.type !== 'editor') return;

    // Skip if we already have a note selected
    if (currentNoteId) return;

    // Prevent duplicate creation
    if (hasCreatedInitialNoteRef.current) return;
    hasCreatedInitialNoteRef.current = true;

    // 1. Try to restore last viewed note from localStorage
    const lastNoteId = localStorage.getItem('clutter-last-note-id');
    if (lastNoteId) {
      const lastNote = notes.find((n) => n.id === lastNoteId && !n.deletedAt);
      if (lastNote) {
        setCurrentNoteId(lastNoteId);
        return; // Successfully restored last note
      }
    }

    // 2. Fallback: Find or create today's daily note
    const today = new Date();
    const existingDailyNote = findDailyNoteByDate(today);

    if (existingDailyNote) {
      // Open existing today's note
      setCurrentNoteId(existingDailyNote.id);
    } else {
      // Create today's daily note
      const newDailyNote = createDailyNote(today);
      setCurrentNoteId(newDailyNote.id);
    }
  }, [
    isInitialized,
    currentNoteId,
    notes,
    findDailyNoteByDate,
    createDailyNote,
    setCurrentNoteId,
    mainView.type,
  ]);

  // Global navigation history - tracks ALL views (notes, tags, and any future views)
  // Store complete navigation state including view type and current note
  type HistoryEntry = {
    mainView: MainView;
    currentNoteId: string | null;
  };

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const isNavigatingRef = useRef(false);

  // Track ALL view changes in history (global navigation)
  useEffect(() => {
    // Skip if we're navigating via back/forward buttons
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    // Create history entry with complete state
    const newEntry: HistoryEntry = {
      mainView: mainView,
      currentNoteId: currentNoteId,
    };

    // If we're not at the end of history, truncate forward history
    const newHistory =
      historyIndexRef.current >= 0
        ? historyRef.current.slice(0, historyIndexRef.current + 1)
        : historyRef.current;

    // Don't add if it's the same as current (deep comparison)
    const lastEntry = newHistory[newHistory.length - 1];
    if (
      lastEntry &&
      JSON.stringify(lastEntry.mainView) ===
        JSON.stringify(newEntry.mainView) &&
      lastEntry.currentNoteId === newEntry.currentNoteId
    ) {
      return;
    }

    // Add new entry
    historyRef.current = [...newHistory, newEntry];
    historyIndexRef.current = historyRef.current.length - 1;
  }, [currentNoteId, mainView]);

  // Global navigation handlers - restore complete state
  const handleGoBack = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const newIndex = historyIndexRef.current - 1;
      const entry = historyRef.current[newIndex];
      isNavigatingRef.current = true;
      historyIndexRef.current = newIndex;

      // Restore complete navigation state
      setMainView(entry.mainView);
      if (entry.currentNoteId) {
        setCurrentNoteId(entry.currentNoteId);
      }
    }
  }, [setCurrentNoteId]);

  const handleGoForward = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const newIndex = historyIndexRef.current + 1;
      const entry = historyRef.current[newIndex];
      isNavigatingRef.current = true;
      historyIndexRef.current = newIndex;

      // Restore complete navigation state
      setMainView(entry.mainView);
      if (entry.currentNoteId) {
        setCurrentNoteId(entry.currentNoteId);
      }
    }
  }, [setCurrentNoteId]);

  const canGoBack = historyIndexRef.current > 0;
  const canGoForward = historyIndexRef.current < historyRef.current.length - 1;

  // Track if we've created the initial note (to prevent duplicates in StrictMode)
  const hasCreatedInitialNoteRef = useRef(false);

  // Track which notes we've already auto-focused to prevent focus stealing
  const autoFocusedNotesRef = useRef<Set<string>>(new Set());

  // Focus title when a new note is created (empty title) - only once per note
  useEffect(() => {
    if (
      currentNote &&
      !currentNote.title &&
      mainView.type === 'editor' &&
      !autoFocusedNotesRef.current.has(currentNote.id)
    ) {
      // Mark this note as auto-focused
      autoFocusedNotesRef.current.add(currentNote.id);

      // Small delay to ensure the DOM has rendered
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 0);
    }
  }, [currentNote?.id, mainView.type]); // Only depend on note ID, not entire currentNote object

  // Persistent UI preferences (sidebar collapse state, etc.)
  const { preferences, toggleSidebarCollapsed } = useUIPreferences();
  const isSidebarCollapsed = preferences.sidebarCollapsed;

  const { colors, toggleMode } = useTheme();
  const editorContext = useEditorContext();
  const noteBackgroundColor = colors.background.default; // Change this one line to update everywhere
  const keyboardButtonRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<TipTapWrapperHandle>(null);
  const titleInputRef = useRef<TitleInputHandle>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const addEmojiButtonRef = useRef<HTMLButtonElement>(null);
  const previousNoteIdRef = useRef<string | null>(null); // Track note switches for transition

  // Editor content state
  const [editorContent, setEditorContent] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    if (!currentNoteId) {
      // No note selected → empty editor
      setEditorContent(undefined);
      return;
    }

    // Load content from current note
    setEditorContent(currentNote?.content);
  }, [currentNoteId]); // Only reload when note switches, NOT on content changes

  // Detect note switching for micro transition
  const isSwitchingNote =
    currentNoteId !== previousNoteIdRef.current &&
    previousNoteIdRef.current !== null;

  // Auto-save with debounce (defined early so it can be used in effects)
  const [debouncedSave] = useDebounce((updates: Partial<Note>) => {
    if (currentNoteId) {
      // Update note metadata only (content is updated synchronously)
      updateNoteMeta(currentNoteId, updates);
    }
  }, 500);

  // 🔄 Sync tags when they change externally (e.g., from tag rename)
  useEffect(() => {
    if (currentNote && currentNote.id === currentNoteId) {
      // Only update if tags actually changed (avoid unnecessary re-renders)
      const tagsChanged =
        JSON.stringify(currentNote.tags) !== JSON.stringify(tags);
      if (tagsChanged) {
        setTags(currentNote.tags);
      }
    }
  }, [currentNote, currentNoteId, tags]); // Watch for currentNote changes

  // Update view context when current note is deleted
  useEffect(() => {
    if (
      currentNote?.deletedAt &&
      mainView.type === 'editor' &&
      mainView.source !== 'deletedItems'
    ) {
      // Note was just deleted -> update context to show it's now in "Recently deleted"
      setMainView({ type: 'editor', source: 'deletedItems' });
    }
  }, [currentNote?.deletedAt, mainView.type, mainView.source]);

  // Update view context when current folder is deleted
  useEffect(() => {
    if (
      mainView.type === 'folderView' &&
      mainView.folderId !== CLUTTERED_FOLDER_ID &&
      mainView.source !== 'deletedItems'
    ) {
      const folder = folders.find((f) => f.id === mainView.folderId);
      if (folder?.deletedAt) {
        // Folder was just deleted -> update context to show it's now in "Recently deleted"
        setMainView({
          type: 'folderView',
          folderId: mainView.folderId,
          source: 'deletedItems',
        });
      }
    }
  }, [mainView.type, mainView.folderId, mainView.source, folders]);

  // Scroll to target block when note is loaded
  useEffect(() => {
    if (
      targetBlockId &&
      currentNoteId &&
      currentNote &&
      mainView.type === 'editor'
    ) {
      // Small delay to ensure the editor content is fully rendered
      const timer = setTimeout(() => {
        editorRef.current?.scrollToBlock(targetBlockId, true);
        // Clear targetBlockId after scrolling
        setTargetBlockId(null);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [targetBlockId, currentNoteId, currentNote, mainView.type]);

  const handleToggleFavorite = useCallback(() => {
    setIsFavorite((prev) => {
      const newValue = !prev;
      debouncedSave({ isFavorite: newValue });
      return newValue;
    });
  }, [debouncedSave]);

  // Removed: handleAddTag and hashtag-created event listener
  // Tags are now block-level and automatically extracted from editor content

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      const trimmedTag = tagToRemove.trim();
      setTags((prevTags) => {
        // Remove case-insensitively
        const newTags = prevTags.filter(
          (tag) => tag.toLowerCase() !== trimmedTag.toLowerCase()
        );
        debouncedSave({ tags: newTags });
        return newTags;
      });
    },
    [debouncedSave]
  );

  const handleEditTag = useCallback(
    (oldTag: string, newTag: string) => {
      const trimmedOldTag = oldTag.trim();
      const trimmedNewTag = newTag.trim();

      if (!trimmedNewTag) return;

      // If tag name didn't change (case-insensitive), do nothing
      if (trimmedNewTag.toLowerCase() === trimmedOldTag.toLowerCase()) return;

      // Before renaming, ensure the tag has a color saved to metadata
      // This preserves the visual appearance through the rename
      const metadata = getTagMetadata(trimmedOldTag);
      if (!metadata?.color) {
        // Save the current hash-based color so it's preserved after rename
        const currentVisualColor = getTagColor(trimmedOldTag);
        if (metadata) {
          updateTagMetadata(trimmedOldTag, { color: currentVisualColor });
        } else {
          upsertTagMetadata(trimmedOldTag, '', true, false, currentVisualColor);
        }
      }

      // Use global rename to update all notes with this tag
      renameTag(trimmedOldTag, trimmedNewTag);

      // Update local state for immediate UI update
      setTags((prevTags) => {
        // Find old tag case-insensitively
        const oldIndex = prevTags.findIndex(
          (t) => t.toLowerCase() === trimmedOldTag.toLowerCase()
        );
        let newTags: string[];

        if (oldIndex === -1) {
          // Old tag not found, just add new one if it doesn't exist
          const exists = prevTags.some(
            (t) => t.toLowerCase() === trimmedNewTag.toLowerCase()
          );
          if (!exists) {
            newTags = [...prevTags, trimmedNewTag]; // Store with original case
          } else {
            return prevTags;
          }
        } else {
          // Remove old tag
          const withoutOld = prevTags.filter((_, i) => i !== oldIndex);

          // Check if new tag already exists elsewhere (case-insensitive)
          const exists = withoutOld.some(
            (t) => t.toLowerCase() === trimmedNewTag.toLowerCase()
          );
          if (exists) {
            newTags = withoutOld;
          } else {
            // Insert new tag at the same position as old tag with original case
            newTags = [
              ...withoutOld.slice(0, oldIndex),
              trimmedNewTag,
              ...withoutOld.slice(oldIndex),
            ];
          }
        }

        debouncedSave({ tags: newTags });
        return newTags;
      });
    },
    [
      debouncedSave,
      renameTag,
      getTagMetadata,
      getTagColor,
      updateTagMetadata,
      upsertTagMetadata,
    ]
  );

  const handleColorChange = useCallback(
    (tag: string, color: string) => {
      // Update tag metadata with the new color (upsert to handle tags without existing metadata)
      const existing = getTagMetadata(tag);
      if (existing) {
        updateTagMetadata(tag, { color });
      } else {
        // Create metadata with the color for tags that don't have metadata yet
        upsertTagMetadata(tag, '', true, false, color);
      }
    },
    [getTagMetadata, updateTagMetadata, upsertTagMetadata]
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      debouncedSave({ description: value });
    },
    [debouncedSave]
  );

  const handleDescriptionBlur = useCallback(() => {
    setDescription((prev) => {
      if (!prev.trim()) {
        setShowDescriptionInput(false);
        return '';
      }
      return prev;
    });
  }, []);

  const handleShowDescriptionInput = useCallback(() => {
    setShowTagInput(false);
    setShowDescriptionInput(true);
  }, []);

  const handleMoodClick = useCallback(() => {
    // Placeholder for mood selector
    // TODO: Implement mood selector UI
  }, []);

  const handleShowTagInput = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowDescriptionInput((prevShowInput) => {
      if (prevShowInput) {
        setDescription((prevDesc) => {
          if (!prevDesc.trim()) {
            return '';
          }
          return prevDesc;
        });
        return false;
      }
      return prevShowInput;
    });
    setShowTagInput(true);
  }, []);

  const handleAddTag = useCallback(
    (tag: string) => {
      const trimmedTag = tag.trim();
      if (trimmedTag) {
        setTags((prevTags) => {
          // Check for duplicates case-insensitively
          const exists = prevTags.some(
            (t) => t.toLowerCase() === trimmedTag.toLowerCase()
          );
          if (!exists) {
            const newTags = [...prevTags, trimmedTag];
            // Update immediately so sidebar updates
            if (currentNoteId) {
              updateNoteMeta(currentNoteId, { tags: newTags });
            }
            return newTags;
          }
          return prevTags;
        });
      }
      setShowTagInput(false);
    },
    [currentNoteId, updateNoteMeta]
  );

  const handleCancelTagInput = useCallback(() => {
    setShowTagInput(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    toggleSidebarCollapsed();
  }, [toggleSidebarCollapsed]);

  const handleToggleDescriptionVisibility = useCallback(() => {
    setDescriptionVisible((prev) => {
      const newValue = !prev;
      debouncedSave({ descriptionVisible: newValue });
      return newValue;
    });
  }, [debouncedSave]);

  const handleToggleTagsVisibility = useCallback(() => {
    setTagsVisible((prev) => {
      const newValue = !prev;
      debouncedSave({ tagsVisible: newValue });
      return newValue;
    });
  }, [debouncedSave]);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      setSelectedEmoji(emoji);
      debouncedSave({ emoji });
      setIsEmojiTrayOpen(false);
    },
    [debouncedSave]
  );

  const openEmojiTray = useCallback(
    (buttonRef: React.RefObject<HTMLButtonElement | HTMLElement>) => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setEmojiTrayPosition({ top: rect.bottom + 8, left: rect.left });
      }
      setIsEmojiTrayOpen(true);
    },
    []
  );

  const handleRemoveEmoji = useCallback(() => {
    setSelectedEmoji(null);
    debouncedSave({ emoji: null });
    setIsEmojiTrayOpen(false);
  }, [debouncedSave]);

  const handleDuplicate = useCallback(() => {
    if (currentNoteId) {
      duplicateNote(currentNoteId);
    }
  }, [currentNoteId, duplicateNote]);

  const handleDelete = useCallback(() => {
    if (currentNoteId) {
      // Soft delete the note (move to trash)
      deleteNote(currentNoteId);

      // Keep the user on the same note, but update the context to "Recently deleted"
      // This will automatically update the breadcrumb to "Recently deleted > Note title"
      setMainView({ type: 'editor', source: 'deletedItems' });
    }
  }, [currentNoteId, deleteNote]);

  // Clear all deleted items handler
  const { openConfirmation, openMultiActionConfirmation } = useConfirmation();

  // Check if there are any deleted items
  const hasDeletedItems = useMemo(() => {
    const deletedNotes = notes.filter((n) => n.deletedAt);
    const deletedFolders = folders.filter((f) => f.deletedAt);
    const deletedTags = useTagsStore.getState().getDeletedTags();
    return (
      deletedNotes.length > 0 ||
      deletedFolders.length > 0 ||
      deletedTags.length > 0
    );
  }, [notes, folders]);

  const handleClearClutter = useCallback(async () => {
    // Get deleted items from all stores
    const deletedNotes = notes.filter((n) => n.deletedAt);
    const deletedFolders = folders.filter((f) => f.deletedAt);
    const deletedTags = useTagsStore.getState().getDeletedTags();

    const totalItems =
      deletedNotes.length + deletedFolders.length + deletedTags.length;

    if (totalItems === 0) {
      return;
    }

    // Open the confirmation dialog
    openConfirmation(
      'Clear Clutter',
      'All items in Recently Deleted will be permanently removed.',
      true, // isDangerous
      async () => {
        // Define deletion tasks for each type
        const deletionTasks = [
          {
            name: 'notes',
            items: deletedNotes,
            deleteFunc: permanentlyDeleteNote,
            getId: (item: any) => item.id,
          },
          {
            name: 'folders',
            items: deletedFolders,
            deleteFunc: permanentlyDeleteFolder,
            getId: (item: any) => item.id,
          },
          {
            name: 'tags',
            items: deletedTags,
            deleteFunc: useTagsStore.getState().permanentlyDeleteTag,
            getId: (item: any) => item.name,
          },
        ];

        // Execute deletions for all types
        for (const task of deletionTasks) {
          if (task.items.length > 0) {
            for (const item of task.items) {
              const itemId = task.getId(item);
              await task.deleteFunc(itemId);
            }
          }
        }
      }
    );
  }, [
    notes,
    folders,
    openConfirmation,
    permanentlyDeleteNote,
    permanentlyDeleteFolder,
  ]);

  // Handlers for deleted item actions (floating action bar)
  const handleRestoreDeletedItem = useCallback(() => {
    if (mainView.type === 'editor' && currentNoteId && currentNote?.deletedAt) {
      // Restore note
      restoreNote(currentNoteId);
      // Navigate back to the note (now restored)
      setMainView({ type: 'editor' });
    } else if (mainView.type === 'folderView' && mainView.folderId) {
      const currentFolder = folders.find((f) => f.id === mainView.folderId);
      if (currentFolder?.deletedAt) {
        // Restore folder
        restoreFolder(mainView.folderId);
        // Navigate back to the folder (now restored)
        setMainView({ type: 'folderView', folderId: mainView.folderId });
      }
    } else if (mainView.type === 'tagFilter') {
      const tagMeta = tagMetadata[mainView.tag];
      if (tagMeta?.deletedAt) {
        // Restore tag
        restoreTag(mainView.tag);
        // Stay on tag view (now restored)
      }
    }
  }, [
    mainView,
    currentNoteId,
    currentNote,
    folders,
    tagMetadata,
    restoreNote,
    restoreFolder,
    restoreTag,
  ]);

  const handlePermanentlyDeleteItem = useCallback(() => {
    if (mainView.type === 'editor' && currentNoteId && currentNote?.deletedAt) {
      // Permanently delete note
      openConfirmation(
        'Permanent Delete',
        'Permanently delete this note? This cannot be undone.',
        true,
        () => {
          permanentlyDeleteNote(currentNoteId);
          // Navigate to Recently Deleted view
          setMainView({ type: 'deletedItemsView' });
        },
        'Delete'
      );
    } else if (mainView.type === 'folderView' && mainView.folderId) {
      const currentFolder = folders.find((f) => f.id === mainView.folderId);
      if (currentFolder?.deletedAt) {
        // Permanently delete folder
        openConfirmation(
          'Permanent Delete',
          'Permanently delete this folder? This cannot be undone.',
          true,
          () => {
            permanentlyDeleteFolder(mainView.folderId);
            // Navigate to Recently Deleted view
            setMainView({ type: 'deletedItemsView' });
          },
          'Delete'
        );
      }
    } else if (mainView.type === 'tagFilter') {
      const tagMeta = tagMetadata[mainView.tag];
      if (tagMeta?.deletedAt) {
        // Permanently delete tag
        openConfirmation(
          'Permanent Delete',
          'Permanently delete this tag? This cannot be undone.',
          true,
          () => {
            const permanentlyDeleteTag =
              useTagsStore.getState().permanentlyDeleteTag;
            permanentlyDeleteTag(mainView.tag);
            // Navigate to Recently Deleted view
            setMainView({ type: 'deletedItemsView' });
          },
          'Delete'
        );
      }
    }
  }, [
    mainView,
    currentNoteId,
    currentNote,
    folders,
    tagMetadata,
    openConfirmation,
    permanentlyDeleteNote,
    permanentlyDeleteFolder,
  ]);

  // Tag view handlers
  const handleShowTagFilter = useCallback(
    (tag: string, source: 'all' | 'favorites' = 'all') => {
      // Save metadata (NOT content - content is owned by editor autosave)
      if (currentNoteId) {
        // Read fresh tags from store to avoid overwriting tag renames
        const freshNotes = useNotesStore.getState().notes;
        const currentNote = freshNotes.find((n) => n.id === currentNoteId);
        const freshTags = currentNote?.tags || tags;

        // ✅ Save metadata only - never write content from navigation
        updateNoteMeta(currentNoteId, {
          title,
          description,
          tags: freshTags,
          emoji: selectedEmoji,
          isFavorite,
          descriptionVisible,
          tagsVisible,
        });
      }
      setMainView({ type: 'tagFilter', tag, source });
    },
    [
      currentNoteId,
      updateNoteMeta,
      title,
      description,
      tags,
      selectedEmoji,
      isFavorite,
      descriptionVisible,
      tagsVisible,
    ]
  );

  const handleBackToEditor = useCallback(() => {
    setMainView({ type: 'editor' });
  }, []);

  // Tag favorite state and handler
  const [tagFavorite, setTagFavorite] = useState(false);

  const handleToggleTagFavorite = useCallback(() => {
    if (mainView.type === 'tagFilter') {
      const newFavoriteState = !tagFavorite;
      setTagFavorite(newFavoriteState);

      // Ensure tag metadata exists with the new favorite status
      const metadata = getTagMetadata(mainView.tag);
      if (!metadata) {
        // Create metadata with the favorite state and initial hash-based color
        upsertTagMetadata(
          mainView.tag,
          '',
          true,
          newFavoriteState,
          getTagColor(mainView.tag)
        );
      } else {
        // Update existing metadata
        updateTagMetadata(mainView.tag, { isFavorite: newFavoriteState });
      }
    }
  }, [
    mainView,
    tagFavorite,
    getTagMetadata,
    updateTagMetadata,
    upsertTagMetadata,
  ]);

  // Delete tag handler - soft deletes the tag
  const handleDeleteTag = useCallback(() => {
    if (mainView.type === 'tagFilter') {
      const tagToDelete = mainView.tag;

      // Soft delete the tag using the store's deleteTag function
      deleteTag(tagToDelete);

      // Navigate back to editor
      handleBackToEditor();
    }
  }, [mainView, deleteTag, handleBackToEditor]);

  // Update tag favorite state when tag changes
  useEffect(() => {
    if (mainView.type === 'tagFilter') {
      const metadata = getTagMetadata(mainView.tag);
      setTagFavorite(metadata?.isFavorite || false);
    }
  }, [mainView, getTagMetadata]);

  // Listen for tag filter requests from block-level tags
  useEffect(() => {
    const handleTagFilterRequested = (event: Event) => {
      const customEvent = event as CustomEvent<{ tag: string }>;
      if (customEvent.detail?.tag) {
        handleShowTagFilter(customEvent.detail.tag);
      }
    };

    window.addEventListener('tag-filter-requested', handleTagFilterRequested);
    return () => {
      window.removeEventListener(
        'tag-filter-requested',
        handleTagFilterRequested
      );
    };
  }, [handleShowTagFilter]);

  const handleNoteClickFromTagView = useCallback(
    (noteId: string) => {
      setCurrentNoteId(noteId);

      // Check if the note is deleted to set proper source
      const note = notes.find((n) => n.id === noteId);
      if (note?.deletedAt) {
        // Note is deleted -> open in "Recently deleted" context
        setMainView({ type: 'editor', source: 'deletedItems' });
      } else {
        // Note is active -> open in normal context
        setMainView({ type: 'editor' });
      }
    },
    [setCurrentNoteId, notes]
  );

  // Handler for navigating to a note with a specific block (e.g., from task click)
  const handleNoteClickWithBlock = useCallback(
    (noteId: string, blockId: string) => {
      setCurrentNoteId(noteId);
      setTargetBlockId(blockId);

      // Check if the note is deleted to set proper source
      const note = notes.find((n) => n.id === noteId);
      if (note?.deletedAt) {
        // Note is deleted -> open in "Recently deleted" context
        setMainView({ type: 'editor', source: 'deletedItems' });
      } else {
        // Note is active -> open in normal context
        setMainView({ type: 'editor' });
      }
    },
    [setCurrentNoteId, notes]
  );

  // Handler for navigating from @ mention links (note/folder links in editor)
  const handleNavigate = useCallback(
    (linkType: 'note' | 'folder', targetId: string) => {
      // Save current note metadata before navigating
      if (currentNoteId) {
        updateNoteMeta(currentNoteId, {
          title,
          description,
          tags,
          emoji: selectedEmoji,
          isFavorite,
          descriptionVisible,
          tagsVisible,
        });
      }

      if (linkType === 'note') {
        // Navigate to the linked note
        const note = notes.find((n) => n.id === targetId);
        if (note?.deletedAt) {
          // Note is deleted -> open in "Recently deleted" context
          setMainView({ type: 'editor', source: 'deletedItems' });
        } else {
          // Note is active -> open in normal context
          setMainView({ type: 'editor' });
        }
        setCurrentNoteId(targetId);
      } else if (linkType === 'folder') {
        // Navigate to the folder view
        setMainView({ type: 'folderView', folderId: targetId });
      }
    },
    [
      currentNoteId,
      notes,
      title,
      description,
      tags,
      selectedEmoji,
      isFavorite,
      descriptionVisible,
      tagsVisible,
      updateNoteMeta,
      setCurrentNoteId,
      setMainView,
    ]
  );

  // Check if current note is a daily note
  const isDailyNote = useMemo(() => {
    return (
      currentNote?.dailyNoteDate !== null &&
      currentNote?.dailyNoteDate !== undefined
    );
  }, [currentNote]);

  // Handler for calendar date selection (for daily notes)
  const handleDateSelect = useCallback(
    async (date: Date) => {
      // Try to find existing daily note for this date
      const existingNote = findDailyNoteByDate(date);

      if (existingNote) {
        // Open existing daily note
        setCurrentNoteId(existingNote.id);
        setMainView({ type: 'editor' });
      } else {
        // Create new daily note
        await createDailyNote(date); // ✅ AWAIT block creation
        // Note: setCurrentNoteId is called internally after block exists
        setMainView({ type: 'editor' });
      }
    },
    [findDailyNoteByDate, createDailyNote, setMainView]
  );

  const handleCreateNoteWithTag = useCallback(
    async (tag: string) => {
      await createNote({ tags: [tag] }); // ✅ AWAIT block creation
      // Note: setCurrentNoteId is called internally after block exists
      setMainView({ type: 'editor' }); // Switch to full-page editor
    },
    [createNote, setMainView]
  );

  const handleCreateFolderWithTag = useCallback(
    (tag: string) => {
      const folderId = createFolder('', null, null, [tag]); // Empty name shows "Untitled Folder" placeholder
      if (folderId) {
        // Navigate to the newly created folder (history is auto-managed by useEffect)
        setMainView({ type: 'folderView', folderId });
      }
    },
    [createFolder, setMainView]
  );

  const handleFolderClick = useCallback(
    (folderId: string) => {
      // Save metadata (NOT content - content is owned by editor autosave)
      if (currentNoteId) {
        // ✅ Save metadata only - never write content from navigation
        updateNoteMeta(currentNoteId, {
          title,
          description,
          tags,
          emoji: selectedEmoji,
          isFavorite,
          descriptionVisible,
          tagsVisible,
        });
      }

      // Handle special "All Folders" view
      if (folderId === 'all-folders') {
        setMainView({ type: 'allFoldersView' });
        return;
      }

      // Handle special "Favourites" view
      if (folderId === 'all-favourites' || folderId === 'favourites') {
        setMainView({ type: 'favouritesView' });
        return;
      }

      // Handle special "All Tags" view
      if (folderId === 'all-tags') {
        setMainView({ type: 'allTagsView' });
        return;
      }

      // Handle special "Favourite Tags" view
      if (folderId === 'favourite-tags') {
        setMainView({ type: 'favouriteTagsView' });
        return;
      }

      // Handle special task view types
      if (folderId === 'today-tasks') {
        setMainView({ type: 'todayTasksView' });
        return;
      }

      if (folderId === 'overdue-tasks') {
        setMainView({ type: 'overdueTasksView' });
        return;
      }

      if (folderId === 'upcoming-tasks') {
        setMainView({ type: 'upcomingTasksView' });
        return;
      }

      if (folderId === 'unplanned-tasks') {
        setMainView({ type: 'unplannedTasksView' });
        return;
      }

      if (folderId === 'completed-tasks') {
        setMainView({ type: 'completedTasksView' });
        return;
      }

      // Handle special "Deleted Items" view
      if (folderId === 'deleted-items') {
        setMainView({ type: 'deletedItemsView' });
        return;
      }

      // Regular folder view - check if folder is deleted
      const folder = folders.find((f) => f.id === folderId);
      if (folder?.deletedAt) {
        // Deleted folder -> open in "Recently deleted" context
        setMainView({ type: 'folderView', folderId, source: 'deletedItems' });
      } else {
        // Active folder -> open in normal context
        setMainView({ type: 'folderView', folderId });
      }
    },
    [
      currentNoteId,
      updateNoteMeta,
      title,
      description,
      tags,
      selectedEmoji,
      isFavorite,
      descriptionVisible,
      tagsVisible,
      setMainView,
      folders,
    ]
  );

  const handleCreateNoteInFolder = useCallback(
    (folderId: string) => {
      // Handle special "cluttered" folder (no folder assigned)
      const actualFolderId = folderId === CLUTTERED_FOLDER_ID ? null : folderId;
      const newNote = createNote({ folderId: actualFolderId });
      setCurrentNoteId(newNote.id);
      setMainView({ type: 'editor' });
    },
    [createNote, setCurrentNoteId]
  );

  // Note context menu items - different for deleted vs active notes
  const noteContextMenuItems = useMemo<
    Array<
      | {
          icon: ReactNode;
          label: string;
          onClick: () => void;
          danger?: boolean;
          shortcut?: string;
        }
      | {
          separator: true;
        }
    >
  >(() => {
    // Check if viewing a deleted note
    const isDeletedNote =
      currentNote?.deletedAt || mainView.source === 'deletedItems';

    if (isDeletedNote) {
      // Context menu for deleted notes
      return [
        {
          icon: <RotateCcw size={sizing.icon.sm} />,
          label: 'Restore',
          onClick: () => {
            if (currentNoteId) {
              restoreNote(currentNoteId);
              // Navigate back to the restored note
              setMainView({ type: 'editor' });
            }
          },
        },
        { separator: true as const },
        {
          icon: <Trash2 size={sizing.icon.sm} />,
          label: 'Permanently Delete',
          onClick: () => {
            if (currentNoteId) {
              openConfirmation(
                'Permanent Delete',
                'Permanently delete this note? This cannot be undone.',
                true, // isDangerous
                () => {
                  permanentlyDeleteNote(currentNoteId);
                  // Navigate to Recently Deleted view
                  setMainView({ type: 'deletedItemsView' });
                },
                'Delete'
              );
            }
          },
          danger: true,
        },
      ];
    }

    // Context menu for active notes
    return [
      {
        icon: isFavorite ? (
          <StarFilled size={sizing.icon.sm} color={colors.accent.gold} />
        ) : (
          <Star size={sizing.icon.sm} />
        ),
        label: isFavorite ? 'Remove from favorites' : 'Add to favorites',
        onClick: handleToggleFavorite,
      },
      {
        icon: <Copy size={sizing.icon.sm} />,
        label: 'Duplicate',
        onClick: handleDuplicate,
      },
      { separator: true as const },
      {
        icon: <Trash2 size={sizing.icon.sm} />,
        label: 'Delete',
        onClick: handleDelete,
        danger: true,
      },
    ];
  }, [
    currentNote?.deletedAt,
    mainView.source,
    currentNoteId,
    isFavorite,
    handleToggleFavorite,
    handleDuplicate,
    handleDelete,
    colors.accent.gold,
    restoreNote,
    openConfirmation,
    permanentlyDeleteNote,
    setMainView,
  ]);

  // Tag context menu items (for tag filtered view)
  const tagContextMenuItems = useMemo<
    Array<
      | {
          icon: ReactNode;
          label: string;
          onClick: () => void;
          danger?: boolean;
        }
      | {
          separator: true;
        }
    >
  >(() => {
    if (mainView.type !== 'tagFilter') return [];

    return [
      {
        icon: tagFavorite ? (
          <StarFilled size={sizing.icon.sm} color={colors.accent.gold} />
        ) : (
          <Star size={sizing.icon.sm} />
        ),
        label: tagFavorite ? 'Remove from favorites' : 'Add to favorites',
        onClick: handleToggleTagFavorite,
      },
      { separator: true as const },
      {
        icon: <Trash2 size={sizing.icon.sm} />,
        label: 'Delete tag',
        onClick: handleDeleteTag,
        danger: true,
      },
    ];
  }, [
    mainView,
    tagFavorite,
    colors.accent.gold,
    handleToggleTagFavorite,
    handleDeleteTag,
  ]);

  // Get current folder for folder views
  const currentFolder = useMemo(() => {
    if (
      mainView.type === 'folderView' &&
      mainView.folderId &&
      mainView.folderId !== CLUTTERED_FOLDER_ID
    ) {
      return folders.find((f) => f.id === mainView.folderId);
    }
    return null;
  }, [mainView, folders]);

  // Folder context menu items (for folder view)
  const folderContextMenuItems = useMemo<
    Array<
      | {
          icon: ReactNode;
          label: string;
          onClick: () => void;
          danger?: boolean;
        }
      | {
          separator: true;
        }
    >
  >(() => {
    if (!currentFolder) return [];

    return [
      {
        icon: currentFolder.isFavorite ? (
          <StarFilled size={sizing.icon.sm} color={colors.accent.gold} />
        ) : (
          <Star size={sizing.icon.sm} />
        ),
        label: currentFolder.isFavorite
          ? 'Remove from favorites'
          : 'Add to favorites',
        onClick: () =>
          updateFolder(currentFolder.id, {
            isFavorite: !currentFolder.isFavorite,
          }),
      },
      { separator: true as const },
      {
        icon: <Trash2 size={sizing.icon.sm} />,
        label: 'Delete folder',
        onClick: () => {
          if (!currentFolder) return;

          // Count notes in this folder (including subfolders)
          const countNotesInFolder = (id: string): number => {
            const directNotes = notes.filter(
              (n) => n.folderId === id && !n.deletedAt
            ).length;
            const childFolders = folders.filter(
              (f) => f.parentId === id && !f.deletedAt
            );
            const childNotes = childFolders.reduce(
              (sum, child) => sum + countNotesInFolder(child.id),
              0
            );
            return directNotes + childNotes;
          };

          const noteCount = countNotesInFolder(currentFolder.id);
          const folderName = currentFolder.name || 'this folder';

          // Navigate to parent after deletion
          const navigateAfterDelete = () => {
            if (currentFolder.parentId) {
              setMainView({
                type: 'folderView',
                folderId: currentFolder.parentId,
              });
            } else {
              setMainView({ type: 'allFoldersView' });
            }
          };

          if (noteCount === 0) {
            // Empty folder - delete immediately without confirmation
            deleteFolder(currentFolder.id);
            navigateAfterDelete();
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
                  onClick: () => {
                    deleteFolder(currentFolder.id, { keepNotes: true });
                    navigateAfterDelete();
                  },
                },
                {
                  label: 'Delete All',
                  variant: 'danger',
                  onClick: () => {
                    deleteFolder(currentFolder.id, { keepNotes: false });
                    navigateAfterDelete();
                  },
                },
              ]
            );
          }
        },
        danger: true,
      },
    ];
  }, [
    currentFolder,
    colors.accent.gold,
    updateFolder,
    deleteFolder,
    setMainView,
  ]);

  return (
    <>
      <AppShell
        sidebarProps={{
          onToggleTheme: toggleMode,
          onShowKeyboardShortcuts: () => setShowMarkdownShortcuts(true),
          keyboardButtonRef: keyboardButtonRef,
          isCollapsed: isSidebarCollapsed,
          onTagClick: handleShowTagFilter,
          onFolderClick: handleFolderClick,
          onYearClick: (year) =>
            setMainView({ type: 'dailyNotesYearView', year }),
          onMonthClick: (year, month) =>
            setMainView({ type: 'dailyNotesMonthView', year, month }),
          onBackToEditor: handleBackToEditor,
          onNoteClickFromSidebar: handleBackToEditor,
          onNoteClickWithBlock: handleNoteClickWithBlock,
          onDateSelect: handleDateSelect,
          onToggleSidebar: handleToggleSidebar,
          currentView: mainView, // Pass current view for automatic state sync
        }}
        isFullWidth={isFullWidth}
        backgroundColor={noteBackgroundColor}
        header={
          <NoteTopBar
            folderPath={breadcrumbs.path}
            noteTitle={breadcrumbs.currentPageTitle}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
            onNavigateToRoot={() => {
              // Navigate to root - only used when no folders in path
              if (currentNoteId) {
                setMainView({ type: 'editor' });
              }
            }}
            onNavigateToFolder={(folderIndex) => {
              /**
               * Centralized breadcrumb navigation logic
               * Breadcrumb structure: [root sections...] > [folder hierarchy...] > [current page]
               *
               * Index mapping:
               * - Index 0 = "Folders" or "All tags" or "Favourites" (root section)
               * - Index 1+ = Actual folders in hierarchy OR final section name
               */

              const pathItem = breadcrumbs.path[folderIndex];
              if (!pathItem) return;

              // Handle root sections (index 0)
              if (folderIndex === 0) {
                if (pathItem === 'Folders') {
                  // Click "Folders" -> show all folders view
                  setMainView({ type: 'allFoldersView' });
                } else if (pathItem === 'All tags') {
                  // Click "All tags" -> show all tags view
                  setMainView({ type: 'allTagsView' });
                } else if (pathItem === 'Favourites') {
                  // Click "Favourites" -> determine which view to show
                  if (
                    mainView.type === 'tagFilter' &&
                    mainView.source === 'favorites'
                  ) {
                    // We're in a tag filter from favourites -> go back to favourite tags view
                    setMainView({ type: 'favouriteTagsView' });
                  } else {
                    // We're in favourites notes/folders view -> go back to favourites view
                    setMainView({ type: 'favouritesView' });
                  }
                } else if (pathItem === 'Recently deleted') {
                  // Click "Recently deleted" -> show deleted items view
                  setMainView({ type: 'deletedItemsView' });
                } else if (pathItem === 'Daily notes') {
                  // Click "Daily notes" -> show daily notes folder view
                  handleFolderClick(DAILY_NOTES_FOLDER_ID);
                }
                return;
              }

              // Handle daily notes hierarchy navigation (year/month)
              if (breadcrumbs.path[0] === 'Daily notes') {
                if (folderIndex === 1) {
                  // Click on year -> show year view
                  const year = breadcrumbs.path[1];
                  setMainView({ type: 'dailyNotesYearView', year });
                } else if (folderIndex === 2) {
                  // Click on month -> show month view
                  const year = breadcrumbs.path[1];
                  const month = breadcrumbs.path[2];
                  setMainView({ type: 'dailyNotesMonthView', year, month });
                }
                return;
              }

              // Handle folder navigation (index 1+)
              // Index 1 onwards corresponds to actual folder hierarchy
              // folderPathIds[0] = first folder, folderPathIds[1] = second folder, etc.
              const actualFolderIndex = folderIndex - 1; // Subtract 1 for "Folders" prefix

              if (pathItem === 'Cluttered') {
                // Navigate to Cluttered folder view
                handleFolderClick(CLUTTERED_FOLDER_ID);
              } else if (folderPathIds[actualFolderIndex]) {
                // Navigate to specific folder by ID
                handleFolderClick(folderPathIds[actualFolderIndex]);
              }
            }}
            onBack={canGoBack ? handleGoBack : undefined}
            onForward={canGoForward ? handleGoForward : undefined}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            isFavorite={
              mainView.type === 'editor'
                ? isFavorite
                : mainView.type === 'tagFilter'
                  ? tagFavorite
                  : mainView.type === 'folderView' && currentFolder
                    ? currentFolder.isFavorite
                    : undefined
            }
            onToggleFavorite={
              mainView.type === 'editor'
                ? handleToggleFavorite
                : mainView.type === 'tagFilter'
                  ? handleToggleTagFavorite
                  : mainView.type === 'folderView' && currentFolder
                    ? () =>
                        updateFolder(currentFolder.id, {
                          isFavorite: !currentFolder.isFavorite,
                        })
                    : undefined
            }
            isFullWidth={isFullWidth}
            onToggleWidth={() => setIsFullWidth((prev) => !prev)}
            contextMenuItems={
              mainView.type === 'editor'
                ? noteContextMenuItems
                : mainView.type === 'tagFilter'
                  ? tagContextMenuItems
                  : mainView.type === 'folderView' && currentFolder
                    ? folderContextMenuItems
                    : undefined
            }
            customActions={
              mainView.type === 'deletedItemsView' ? (
                <FilledButton
                  onClick={handleClearClutter}
                  size="small"
                  disabled={!hasDeletedItems}
                  danger
                >
                  Clear clutter
                </FilledButton>
              ) : undefined
            }
          />
        }
      >
        {mainView.type === 'tagFilter' ? (
          <TagFilteredNotesView
            tag={mainView.tag}
            onNoteClick={handleNoteClickFromTagView}
            onCreateNote={() => handleCreateNoteWithTag(mainView.tag)}
            onCreateFolder={() => handleCreateFolderWithTag(mainView.tag)}
            onFolderClick={handleFolderClick}
            onTagClick={handleShowTagFilter}
          />
        ) : mainView.type === 'allFoldersView' ? (
          <AllFoldersListView
            onFolderClick={handleFolderClick}
            onNoteClick={handleNoteClickFromTagView}
            onCreateNote={handleCreateNoteInFolder}
            onCreateFolder={() => {
              const folderId = createFolder('', null, null); // Empty name shows placeholder
              if (folderId) {
                // Navigate to the newly created folder (history is auto-managed by useEffect)
                setMainView({ type: 'folderView', folderId });
              }
            }}
          />
        ) : mainView.type === 'favouritesView' ? (
          <FavouritesListView
            onNoteClick={handleNoteClickFromTagView}
            onCreateNote={() => {
              const newNote = createNote({ isFavorite: true }); // Create note and mark as favourite
              setCurrentNoteId(newNote.id);
              setMainView({ type: 'editor' });
            }}
            onCreateFolder={() => {
              const folderId = createFolder('', null, null); // Empty name shows placeholder
              if (folderId) {
                // Mark folder as favorite
                updateFolder(folderId, { isFavorite: true });
                // Navigate to the newly created folder
                setMainView({ type: 'folderView', folderId });
              }
            }}
            onFolderClick={handleFolderClick}
            onTagClick={handleShowTagFilter}
          />
        ) : mainView.type === 'allTagsView' ? (
          <AllTagsListView onTagClick={handleShowTagFilter} />
        ) : mainView.type === 'favouriteTagsView' ? (
          <FavouriteTagsListView onTagClick={handleShowTagFilter} />
        ) : mainView.type === 'todayTasksView' ? (
          <TodayTasksListView onTaskClick={handleNoteClickWithBlock} />
        ) : mainView.type === 'overdueTasksView' ? (
          <OverdueTasksListView onTaskClick={handleNoteClickWithBlock} />
        ) : mainView.type === 'upcomingTasksView' ? (
          <UpcomingTasksListView onTaskClick={handleNoteClickWithBlock} />
        ) : mainView.type === 'unplannedTasksView' ? (
          <UnplannedTasksListView onTaskClick={handleNoteClickWithBlock} />
        ) : mainView.type === 'completedTasksView' ? (
          <CompletedTasksListView onTaskClick={handleNoteClickWithBlock} />
        ) : mainView.type === 'deletedItemsView' ? (
          <DeletedItemsListView
            onNoteClick={handleNoteClickFromTagView}
            onFolderClick={handleFolderClick}
            onTagClick={handleShowTagFilter}
          />
        ) : mainView.type === 'folderView' ? (
          <FolderListView
            folderId={mainView.folderId}
            onNoteClick={handleNoteClickFromTagView}
            onCreateNote={() => handleCreateNoteInFolder(mainView.folderId)}
            onCreateFolder={() => {
              const parentId =
                mainView.folderId === CLUTTERED_FOLDER_ID
                  ? null
                  : mainView.folderId;
              const folderId = createFolder('', parentId, null); // Empty name shows placeholder
              if (folderId) {
                // Navigate to the newly created folder (history is auto-managed by useEffect)
                setMainView({ type: 'folderView', folderId });
              }
            }}
            onFolderClick={handleFolderClick}
            onTagClick={handleShowTagFilter}
          />
        ) : mainView.type === 'dailyNotesYearView' ? (
          <DailyNotesYearView
            year={mainView.year}
            onMonthClick={(year, month) =>
              setMainView({ type: 'dailyNotesMonthView', year, month })
            }
            onNoteClick={handleNoteClickFromTagView}
            onTagClick={handleShowTagFilter}
          />
        ) : mainView.type === 'dailyNotesMonthView' ? (
          <DailyNotesMonthView
            year={mainView.year}
            month={mainView.month}
            onNoteClick={handleNoteClickFromTagView}
            onTagClick={handleShowTagFilter}
          />
        ) : (
          <>
            {/* Page Title Section */}
            <PageTitleSection
              ref={titleInputRef}
              variant="note"
              title={title}
              onTitleChange={(value) => {
                if (isDailyNote) return; // Prevent title changes for daily notes

                // Update title
                setTitle(value);
                debouncedSave({ title: value });
              }}
              onTitleEnter={() => editorRef.current?.focus()}
              dailyNoteDate={currentNote?.dailyNoteDate}
              readOnlyTitle={isDailyNote} // ✅ Only daily notes have read-only titles
              selectedEmoji={selectedEmoji}
              isEmojiTrayOpen={isEmojiTrayOpen}
              onEmojiClick={() => openEmojiTray(emojiButtonRef)}
              onRemoveEmoji={handleRemoveEmoji}
              emojiButtonRef={emojiButtonRef}
              hasContent={
                editorContent && editorContent !== '{"type":"doc","content":[]}'
              }
              isFavorite={isFavorite}
              contextMenuItems={noteContextMenuItems}
              description={description}
              showDescriptionInput={showDescriptionInput}
              descriptionVisible={descriptionVisible}
              onDescriptionChange={handleDescriptionChange}
              onDescriptionBlur={handleDescriptionBlur}
              onShowDescriptionInput={handleShowDescriptionInput}
              onToggleDescriptionVisibility={handleToggleDescriptionVisibility}
              tags={tags}
              showTagInput={showTagInput}
              tagsVisible={tagsVisible}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              onEditTag={handleEditTag}
              onColorChange={handleColorChange}
              onShowTagInput={handleShowTagInput}
              onCancelTagInput={handleCancelTagInput}
              onToggleTagsVisibility={handleToggleTagsVisibility}
              onTagClick={handleShowTagFilter}
              onAddEmoji={() =>
                openEmojiTray(addEmojiButtonRef as React.RefObject<HTMLElement>)
              }
              addEmojiButtonRef={
                addEmojiButtonRef as React.RefObject<HTMLDivElement>
              }
              onMoodClick={handleMoodClick}
              backgroundColor={noteBackgroundColor}
            />

            {/* Editor */}
            <PageContent>
              {/* Editor shell - persists across note switches */}
              <div
                className="editor-shell"
                style={{
                  position: 'relative',
                  minHeight: '200px',
                  transition:
                    'opacity 120ms ease, transform 120ms ease, filter 120ms ease',
                  opacity: isSwitchingNote ? 0.94 : 1,
                  transform: isSwitchingNote
                    ? 'translateY(1px)'
                    : 'translateY(0)',
                  filter: isSwitchingNote ? 'blur(0.2px)' : 'none',
                }}
              >
                <TipTapWrapper
                  key={currentNoteId} // Force full remount on note change
                  noteId={currentNoteId}
                  ref={editorRef}
                  value={editorContent}
                  autoFocus={false}
                  onReady={() => {
                    // 🔍 DIAGNOSTIC: Verify noteId consistency
                    console.log('[NOTE ID DIAGNOSTIC]', {
                      currentNoteId: currentNoteId,
                      currentNoteDbId: currentNote?.id,
                      match: currentNoteId === currentNote?.id,
                      timestamp: new Date().toISOString(),
                    });
                  }}
                  onChange={(value) => {
                    // Save content directly to state (synchronous, local-only)
                    updateNoteContent(currentNoteId, value);
                  }}
                  onTagClick={handleShowTagFilter}
                  onNavigate={handleNavigate}
                  onTagsChange={(extractedTags) => {
                    // Merge extracted tags from editor with existing metadata tags
                    setTags((prevTags) => {
                      // Create a map of extracted tags (from editor) - case insensitive
                      const extractedLowerMap = new Map(
                        extractedTags.map((tag) => [tag.toLowerCase(), tag])
                      );

                      // Find tags that were added via "+ Add tag" button (not in editor)
                      const metadataOnlyTags = prevTags.filter(
                        (tag) => !extractedLowerMap.has(tag.toLowerCase())
                      );

                      // Merge: extracted tags from editor + metadata-only tags
                      const mergedTags = [
                        ...extractedTags,
                        ...metadataOnlyTags,
                      ];

                      // Deduplicate (case-insensitive) - keep first occurrence
                      const deduped: string[] = [];
                      const seenLower = new Set<string>();
                      for (const tag of mergedTags) {
                        const lowerTag = tag.toLowerCase();
                        if (!seenLower.has(lowerTag)) {
                          seenLower.add(lowerTag);
                          deduped.push(tag);
                        }
                      }

                      // Update store immediately so sidebar updates instantly
                      if (currentNoteId) {
                        updateNoteMeta(currentNoteId, { tags: deduped });
                      }

                      return deduped;
                    });
                  }}
                  isFrozen={isSwitchingNote}
                  editorContext={editorContext}
                />
              </div>
            </PageContent>
          </>
        )}

        {/* Floating Action Bar for deleted items - inside AppShell */}
        {((mainView.type === 'editor' && currentNote?.deletedAt) ||
          (mainView.type === 'folderView' &&
            mainView.folderId &&
            folders.find((f) => f.id === mainView.folderId)?.deletedAt) ||
          (mainView.type === 'tagFilter' &&
            tagMetadata[mainView.tag]?.deletedAt)) && (
          <FloatingActionBar
            message="It will automatically be deleted in 30 days."
            actions={[
              <SecondaryButton
                key="restore"
                icon={<RotateCcw size={16} />}
                onClick={handleRestoreDeletedItem}
                size="medium"
                withBackground
              >
                Restore
              </SecondaryButton>,
              <SecondaryButton
                key="delete"
                icon={<Trash2 size={16} />}
                onClick={handlePermanentlyDeleteItem}
                danger
                size="medium"
                withBackground
              >
                Permanently Delete
              </SecondaryButton>,
            ]}
          />
        )}
      </AppShell>

      {children}
      <MarkdownShortcuts
        isOpen={showMarkdownShortcuts}
        onClose={() => setShowMarkdownShortcuts(false)}
        buttonRef={keyboardButtonRef}
      />
      {/* Emoji Tray - shared by all emoji buttons */}
      <EmojiTray
        isOpen={isEmojiTrayOpen}
        onClose={() => setIsEmojiTrayOpen(false)}
        onSelect={handleEmojiSelect}
        position={emojiTrayPosition}
      />
    </>
  );
};
