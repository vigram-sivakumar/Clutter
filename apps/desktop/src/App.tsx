import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ThemeProvider, NotesContainer } from '@clutter/ui';
import { useNotesStore } from '@clutter/state';
import { BlockEngineDemo } from '@clutter/editor';
import { EditorWrapper } from './components/EditorWrapper';

function App() {
  const hasHydrated = useNotesStore((state) => state.hasHydrated);
  const notes = useNotesStore((state) => state.notes);
  const findDailyNoteByDate = useNotesStore(
    (state) => state.findDailyNoteByDate
  );
  const createDailyNote = useNotesStore((state) => state.createDailyNote);
  const setCurrentNoteId = useNotesStore((state) => state.setCurrentNoteId);

  // Open or create today's daily note AFTER rehydration completes
  useEffect(() => {
    // 🚨 HARD STOP: Do nothing until persist rehydration completes
    if (!hasHydrated) {
      // console.log('[App] Waiting for rehydration...');
      return;
    }

    const today = new Date();
    const existingDailyNote = findDailyNoteByDate(today);

    // console.log('[App] ✅ Hydrated! Notes in store:', notes.length);
    // console.log(
    //   '[App] Looking for daily note, found:',
    //   existingDailyNote?.id || 'none'
    // );

    if (existingDailyNote) {
      // console.log(
      //   '[App] Opening existing note with content length:',
      //   existingDailyNote.content?.length || 0
      // );
      setCurrentNoteId(existingDailyNote.id);
    } else {
      // console.log('[App] Creating new daily note');
      createDailyNote(today).then((note) => {
        setCurrentNoteId(note.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]); // ✅ Re-run when hydration completes

  return (
    <ThemeProvider>
      <Routes>
        <Route
          path="/"
          element={
            <NotesContainer
              isInitialized={true}
              renderEditor={(props) => <EditorWrapper {...props} />}
            />
          }
        />
        <Route
          path="/block-engine-test"
          element={
            <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
              <BlockEngineDemo />
            </div>
          }
        />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
