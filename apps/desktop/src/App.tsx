import { Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  ThemeProvider,
  NotesContainer,
  ConfirmationDialog,
  FormDialog,
} from '@clutter/ui';
import { type Folder } from '@clutter/domain';
import {
  useNotesStore,
  useFoldersStore,
  useTagsStore,
  setStorageHandlers,
  setCreateInitialBlockHandler,
  setSaveFolderHandler,
  setDeleteFolderHandler,
  setSaveTagHandler,
  setDeleteTagHandler,
  setHydrating,
  setInitialized as setHydrationInitialized,
  initializeMidnightUpdater,
  cleanupMidnightUpdater,
} from '@clutter/state';
import { selectStorageFolder, getStorageFolder } from './lib/storage';
import {
  initDatabase,
  loadAllNotesFromDatabase,
  loadAllFoldersFromDatabase,
  loadAllTagsFromDatabase,
  saveNoteMeta,
  saveFolderToDatabase,
  saveTagToDatabase,
  deleteTagFromDatabase,
  deleteNotePermanently,
  deleteFolderPermanently,
  migrateOrphanedNotes,
  verifyDatabaseIntegrity,
  createInitialBlockForNote,
} from './lib/database';
// import { useAutoSave } from './hooks/useAutoSave'; // ✅ Disabled - content via block journal

function App() {
  const [storageFolder, setStorageFolder] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  // const [isEditorHydrated, setIsEditorHydrated] = useState(false); // ✅ No longer needed
  const setNotes = useNotesStore((state) => state.setNotes);
  const setFolders = useFoldersStore((state) => state.setFolders);
  const setTagMetadata = useTagsStore((state) => state.setTagMetadata);
  const findDailyNoteByDate = useNotesStore(
    (state) => state.findDailyNoteByDate
  );
  const createDailyNote = useNotesStore((state) => state.createDailyNote);
  const setCurrentNoteId = useNotesStore((state) => state.setCurrentNoteId);
  const currentNoteId = useNotesStore((state) => state.currentNoteId); // 🔥 For hard remount
  const updateDailyNoteTitles = useNotesStore(
    (state) => state.updateDailyNoteTitles
  );

  // 🚫 DISABLED: Content persistence is now handled by block journal
  // Metadata is saved immediately via saveNoteMeta()
  // useAutoSave(isInitialized, isEditorHydrated);

  // Initialize global midnight updater for current date tracking
  useEffect(() => {
    initializeMidnightUpdater();
    return () => {
      cleanupMidnightUpdater();
    };
  }, []);

  // Suppress harmless TipTap flushSync warning in React 18
  // TipTap's ReactNodeViewRenderer needs flushSync to sync ProseMirror with React
  useEffect(() => {
    const originalError = console.error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error = (...args: any[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('flushSync was called from inside a lifecycle method')
      ) {
        // Suppress TipTap's expected flushSync warning
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  // Initialize SQLite database on mount (Simple, like Apple Notes)
  useEffect(() => {
    const initializeApp = async () => {
      const folder = getStorageFolder();
      setStorageFolder(folder);

      if (!folder) {
        // ❌ DON'T set isInitialized - keep auto-save disabled without DB
        return;
      }

      try {
        // 🛡️ HYDRATION START: Prevent saves during database boot
        setHydrating(true);

        // Initialize database (creates tables if not exist)
        await initDatabase();

        // Mark database as initialized (allows saves after hydration completes)
        setHydrationInitialized(true);

        // Set up storage handlers for notes, folders and tags (BEFORE loading data)
        setStorageHandlers({
          save: saveNoteMeta, // ✅ APPLE NOTES: Save metadata only (content via block journal)
          load: loadAllNotesFromDatabase,
          delete: deleteNotePermanently,
        });
        setCreateInitialBlockHandler(createInitialBlockForNote); // ✅ APPLE NOTES: Initial block creation
        setSaveFolderHandler(saveFolderToDatabase);
        setDeleteFolderHandler(deleteFolderPermanently);
        setSaveTagHandler(saveTagToDatabase);
        setDeleteTagHandler(deleteTagFromDatabase);

        // Load data in correct order to satisfy FK constraints:
        // 1. Tags (referenced by note_tags, folder_tags)
        // 2. Folders (referenced by notes.folder_id)
        // 3. Notes (depends on folders)
        const [loadedTags, loadedFolders, loadedNotes] = await Promise.all([
          loadAllTagsFromDatabase(),
          loadAllFoldersFromDatabase(),
          loadAllNotesFromDatabase(),
        ]);

        // 🔧 MIGRATION: Move orphaned notes to Cluttered
        // Notes referencing non-existent folders are moved to root (Cluttered)
        const movedCount = await migrateOrphanedNotes(
          loadedNotes,
          loadedFolders
        );

        if (import.meta.env.DEV && movedCount > 0) {
          console.log(
            `🔧 Migration: Moved ${movedCount} orphaned notes to Cluttered`
          );
        }

        // 🗓️ MIGRATION: Create or update "Daily notes" folder
        const DAILY_NOTES_FOLDER_ID = '__daily_notes__';
        const existingDailyNotesFolder = loadedFolders.find(
          (f) => f.id === DAILY_NOTES_FOLDER_ID
        );

        if (!existingDailyNotesFolder) {
          const now = new Date().toISOString();
          const dailyNotesFolder: Folder = {
            id: DAILY_NOTES_FOLDER_ID,
            name: 'Daily notes',
            parentId: null, // Root level folder
            description: 'Your daily notes and journal entries',
            descriptionVisible: true,
            color: null,
            emoji: '📅', // Calendar emoji
            tags: [],
            tagsVisible: true,
            isFavorite: false,
            isExpanded: true,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };

          try {
            await saveFolderToDatabase(dailyNotesFolder);
            loadedFolders.push(dailyNotesFolder);
          } catch (err) {
            console.error('❌ Failed to create "Daily notes" folder:', err);
          }
        } else {
          // Fix the folder name and emoji if they're wrong
          const needsUpdate =
            existingDailyNotesFolder.name !== 'Daily notes' ||
            existingDailyNotesFolder.emoji !== '📅' ||
            existingDailyNotesFolder.deletedAt !== null; // Also check if folder is marked as deleted

          if (needsUpdate) {
            existingDailyNotesFolder.name = 'Daily notes';
            existingDailyNotesFolder.emoji = '📅';
            existingDailyNotesFolder.description =
              'Your daily notes and journal entries';
            existingDailyNotesFolder.deletedAt = null; // Ensure folder is not marked as deleted
            existingDailyNotesFolder.updatedAt = new Date().toISOString();

            try {
              await saveFolderToDatabase(existingDailyNotesFolder);

              // Update the folder in the loadedFolders array
              const folderIndex = loadedFolders.findIndex(
                (f) => f.id === DAILY_NOTES_FOLDER_ID
              );
              if (folderIndex !== -1) {
                loadedFolders[folderIndex] = existingDailyNotesFolder;
              }
            } catch (err) {
              console.error('❌ Failed to update "Daily notes" folder:', err);
            }
          }
        }

        // 🔧 MIGRATION: Move all daily notes to "Daily notes" folder
        const dailyNotes = loadedNotes.filter(
          (note) => note.dailyNoteDate && !note.deletedAt
        );

        let migratedDailyNotesCount = 0;

        for (const note of dailyNotes) {
          // If note doesn't have the correct folderId, update it
          if (note.folderId !== DAILY_NOTES_FOLDER_ID) {
            note.folderId = DAILY_NOTES_FOLDER_ID;
            note.updatedAt = new Date().toISOString();

            try {
              await saveNoteToDatabase(note);
              migratedDailyNotesCount++;
            } catch (err) {
              console.error(`❌ Failed to migrate daily note ${note.id}:`, err);
            }
          }
        }

        if (migratedDailyNotesCount > 0) {
          console.log(
            `✅ Migrated ${migratedDailyNotesCount} daily note(s) to Daily Notes folder`
          );
        }

        // 🔍 DEBUG: Check for duplicate Daily Notes folders
        const dailyNotesFolders = loadedFolders.filter(
          (f) => f.name.toLowerCase().includes('daily') && !f.deletedAt
        );
        if (dailyNotesFolders.length > 1) {
          console.warn(
            `⚠️ Found ${dailyNotesFolders.length} Daily Notes folders:`,
            dailyNotesFolders
          );
        }

        // Hydrate stores (still in hydrating mode, so no saves will trigger)
        if (loadedTags.length > 0) {
          setTagMetadata(loadedTags);
        }

        if (loadedFolders.length > 0) {
          setFolders(loadedFolders);
        }

        if (loadedNotes.length > 0) {
          setNotes(loadedNotes);
        }

        // ✅ ONLY set true after successful database initialization
        setIsInitialized(true);

        // 🛡️ HYDRATION COMPLETE: Allow saves now
        setHydrating(false);

        // 🗓️ UPDATE DAILY NOTE TITLES (Today/Yesterday/Tomorrow)
        // This ensures all daily note titles have current relative prefixes
        updateDailyNoteTitles();

        // 📅 OPEN TODAY'S DAILY NOTE BY DEFAULT (like Obsidian)
        const today = new Date();
        let dailyNote = findDailyNoteByDate(today);

        if (!dailyNote) {
          dailyNote = await createDailyNote(today, false); // ✅ AWAIT block creation
        }

        if (dailyNote) {
          setCurrentNoteId(dailyNote.id);
        }

        // 🔍 VERIFY DATABASE INTEGRITY (dev mode only)
        if (process.env.NODE_ENV === 'development') {
          verifyDatabaseIntegrity().then(({ isValid, issues }) => {
            if (!isValid) {
              console.warn('⚠️ Database integrity issues detected:', issues);
            }
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error('❌ Error initializing app:', err);
        // ❌ DON'T set isInitialized on error - keep app in loading state
        // Also keep hydrating=true to prevent any saves
      }
    };

    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setNotes,
    setFolders,
    setTagMetadata,
    findDailyNoteByDate,
    createDailyNote,
    setCurrentNoteId,
  ]);

  // Update daily note titles every hour (catches date changes like midnight)
  useEffect(() => {
    if (!isInitialized) return;

    // Run every hour (3600000 ms)
    const interval = setInterval(() => {
      updateDailyNoteTitles();
    }, 3600000);

    return () => clearInterval(interval);
  }, [isInitialized, updateDailyNoteTitles]);

  const handleSelectFolder = async () => {
    try {
      const folder = await selectStorageFolder();
      if (folder) {
        setStorageFolder(folder);
        // Reload the app to reinitialize with new folder
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  return (
    <ThemeProvider>
      <ConfirmationDialog />
      <FormDialog />
      {!isInitialized ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            height: '100vh',
            color: '#fff',
            gap: '24px',
          }}
        >
          {storageFolder ? null : (
            <>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                ⚠️ No storage folder selected
              </div>
              <div
                style={{ fontSize: '14px', color: '#888', marginBottom: '8px' }}
              >
                Click the button below to choose where to store your notes
              </div>
              <button
                onClick={handleSelectFolder}
                style={{
                  padding: '16px 32px',
                  background: '#0066ff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(0, 102, 255, 0.4)',
                }}
              >
                📁 Select Storage Folder
              </button>
            </>
          )}
        </div>
      ) : (
        <Routes>
          {/* Main notes view as default */}
          <Route
            path="/"
            element={
              <NotesContainer
                isInitialized={isInitialized}
              >
                <></>
              </NotesContainer>
            }
          />
        </Routes>
      )}
    </ThemeProvider>
  );
}

export default App;
