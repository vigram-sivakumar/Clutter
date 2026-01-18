import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ThemeProvider, NotesContainer } from '@clutter/ui';
import { useNotesStore } from '@clutter/state';

function App() {
  const createNote = useNotesStore((state) => state.createNote);
  const setCurrentNoteId = useNotesStore((state) => state.setCurrentNoteId);
  const notes = useNotesStore((state) => state.notes);

  // Seed with one empty note on mount (dev convenience)
  useEffect(() => {
    if (notes.length === 0) {
      createNote({ title: 'Welcome to Clutter' }).then((note) => {
        setCurrentNoteId(note.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider>
      <Routes>
        <Route
          path="/"
          element={
            <NotesContainer isInitialized={true}>
              <></>
            </NotesContainer>
          }
        />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
