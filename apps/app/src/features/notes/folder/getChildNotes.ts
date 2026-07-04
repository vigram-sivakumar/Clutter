import { Note } from '../models/Note';

export function getChildNotes(notes: Note[], folderId: string | null) {
  return notes.filter((note) => note.parentId === folderId);
}
