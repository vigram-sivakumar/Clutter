import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ThemeProvider, NotesContainer } from '@clutter/ui';
import { useNotesStore } from '@clutter/state';

function App() {
  const findDailyNoteByDate = useNotesStore(
    (state) => state.findDailyNoteByDate
  );
  const createDailyNote = useNotesStore((state) => state.createDailyNote);
  const setCurrentNoteId = useNotesStore((state) => state.setCurrentNoteId);

  // Open or create today's daily note on mount
  useEffect(() => {
    const today = new Date();
    const existingDailyNote = findDailyNoteByDate(today);

    if (existingDailyNote) {
      setCurrentNoteId(existingDailyNote.id);
    } else {
      createDailyNote(today).then((note) => {
        setCurrentNoteId(note.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<NotesContainer isInitialized={true} />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
