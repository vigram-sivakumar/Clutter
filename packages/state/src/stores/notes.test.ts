/**
 * Tests for notes store
 * Testing: Core note operations (create, update, delete)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useNotesStore } from './notes';

describe('useNotesStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useNotesStore.setState({ notes: [], currentNoteId: null });
  });

  describe('createNote', () => {
    it('should create a note with default values', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote();

      // Verify note structure
      expect(note).toBeDefined();
      expect(note.id).toMatch(/^note-\d+-[a-z0-9]+$/);
      expect(note.title).toBe('');
      expect(note.description).toBe('');
      expect(note.content).toBe('');
      expect(note.tags).toEqual([]);
      expect(note.isFavorite).toBe(false);
      expect(note.folderId).toBeNull();
      expect(note.dailyNoteDate).toBeNull();
      expect(note.deletedAt).toBeNull();
      expect(note.descriptionVisible).toBe(true);
      expect(note.tagsVisible).toBe(true);
    });

    it('should create a note with custom initial values', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({
        title: 'Test Note',
        description: 'Test description',
        tags: ['test', 'vitest'],
        isFavorite: true,
      });

      expect(note.title).toBe('Test Note');
      expect(note.description).toBe('Test description');
      expect(note.tags).toEqual(['test', 'vitest']);
      expect(note.isFavorite).toBe(true);
    });

    it('should add note to store', async () => {
      const store = useNotesStore.getState();
      await store.createNote({ title: 'Note 1' });

      const notes = useNotesStore.getState().notes;
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Note 1');
    });

    it('should set note as current by default', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'Current Note' });

      const currentNoteId = useNotesStore.getState().currentNoteId;
      expect(currentNoteId).toBe(note.id);
    });

    it('should not set note as current when setAsCurrent is false', async () => {
      const store = useNotesStore.getState();
      await store.createNote({ title: 'Not Current' }, false);

      const currentNoteId = useNotesStore.getState().currentNoteId;
      expect(currentNoteId).toBeNull();
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const before = new Date().toISOString();
      const store = useNotesStore.getState();
      const note = await store.createNote();
      const after = new Date().toISOString();

      expect(note.createdAt).toBeDefined();
      expect(note.updatedAt).toBeDefined();
      expect(note.createdAt).toBe(note.updatedAt);

      // Timestamps should be between before and after
      expect(note.createdAt >= before).toBe(true);
      expect(note.createdAt <= after).toBe(true);
    });
  });

  describe('updateNote', () => {
    it('should update note title and description', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'Original' });

      store.updateNote(note.id, {
        title: 'Updated Title',
        description: 'Updated Description',
      });

      const updatedNote = store.getNoteById(note.id);
      expect(updatedNote?.title).toBe('Updated Title');
      expect(updatedNote?.description).toBe('Updated Description');
    });

    it('should update updatedAt timestamp', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote();
      const originalUpdatedAt = note.updatedAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      store.updateNote(note.id, { title: 'New Title' });

      const updatedNote = store.getNoteById(note.id);
      expect(updatedNote?.updatedAt).not.toBe(originalUpdatedAt);
      expect(updatedNote!.updatedAt > originalUpdatedAt).toBe(true);
    });

    it('should update tags', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote();

      store.updateNote(note.id, { tags: ['tag1', 'tag2'] });

      const updatedNote = store.getNoteById(note.id);
      expect(updatedNote?.tags).toEqual(['tag1', 'tag2']);
    });

    it('should toggle favorite status', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ isFavorite: false });

      store.updateNote(note.id, { isFavorite: true });

      const updatedNote = store.getNoteById(note.id);
      expect(updatedNote?.isFavorite).toBe(true);
    });

    it('should not affect other notes', async () => {
      const store = useNotesStore.getState();
      const note1 = await store.createNote({ title: 'Note 1' }, false);
      const note2 = await store.createNote({ title: 'Note 2' }, false);

      store.updateNote(note1.id, { title: 'Updated Note 1' });

      const updatedNote1 = store.getNoteById(note1.id);
      const unchangedNote2 = store.getNoteById(note2.id);

      expect(updatedNote1?.title).toBe('Updated Note 1');
      expect(unchangedNote2?.title).toBe('Note 2');
    });
  });

  describe('deleteNote (soft delete)', () => {
    it('should soft delete a note', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'To Delete' });

      store.deleteNote(note.id);

      const deletedNote = store.getNoteById(note.id);
      expect(deletedNote?.deletedAt).not.toBeNull();
      expect(deletedNote?.deletedAt).toBeDefined();
    });

    it('should remove deleted note from active notes', async () => {
      const store = useNotesStore.getState();
      await store.createNote({ title: 'Note 1' }, false);
      const note2 = await store.createNote({ title: 'Note 2' }, false);

      store.deleteNote(note2.id);

      const activeNotes = store.getActiveNotes();
      expect(activeNotes).toHaveLength(1);
      expect(activeNotes[0].title).toBe('Note 1');
    });

    it('should add deleted note to deleted notes list', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'To Delete' });

      store.deleteNote(note.id);

      const deletedNotes = store.getDeletedNotes();
      expect(deletedNotes).toHaveLength(1);
      expect(deletedNotes[0].id).toBe(note.id);
    });

    it('should keep currentNoteId when soft deleting current note', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'Current Note' });

      expect(useNotesStore.getState().currentNoteId).toBe(note.id);

      // Soft delete - user stays on the note, UI updates to show "deleted" context
      store.deleteNote(note.id);

      // currentNoteId should still be set (user stays on the note)
      expect(useNotesStore.getState().currentNoteId).toBe(note.id);
    });
  });

  describe('permanentlyDeleteNote', () => {
    it('should permanently delete a note', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'To Delete' });

      store.permanentlyDeleteNote(note.id);

      const deletedNote = store.getNoteById(note.id);
      expect(deletedNote).toBeNull();
    });

    it('should clear currentNoteId if permanently deleting current note', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'Current Note' });

      expect(useNotesStore.getState().currentNoteId).toBe(note.id);

      // Permanent delete - note is gone, can't stay on it
      store.permanentlyDeleteNote(note.id);

      expect(useNotesStore.getState().currentNoteId).toBeNull();
    });

    it('should remove note from store completely', async () => {
      const store = useNotesStore.getState();
      await store.createNote({ title: 'Note 1' }, false);
      const note2 = await store.createNote({ title: 'Note 2' }, false);

      store.permanentlyDeleteNote(note2.id);

      const allNotes = useNotesStore.getState().notes;
      expect(allNotes).toHaveLength(1);
      expect(allNotes[0].title).toBe('Note 1');
    });
  });

  describe('getNoteById', () => {
    it('should return note by id', async () => {
      const store = useNotesStore.getState();
      const note = await store.createNote({ title: 'Find Me' }, false);

      const found = store.getNoteById(note.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(note.id);
      expect(found?.title).toBe('Find Me');
    });

    it('should return null for non-existent id', () => {
      const store = useNotesStore.getState();
      const found = store.getNoteById('non-existent-id');
      expect(found).toBeNull();
    });
  });
});
