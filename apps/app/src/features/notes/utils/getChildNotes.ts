import { Note } from '../models/Note';

export function getChildNotes(notes: Note[], parentId: string | null) {
  return notes.filter((note) => note.parentId === parentId);
}
