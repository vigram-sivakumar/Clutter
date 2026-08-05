import { describe, expect, it } from 'vitest';
import { FieldEditState } from './FieldEditState';
import { DocumentState } from './DocumentState';

describe('FieldEditState', () => {
  it('starts Clean and not dirty, with currentValue/savedValue both the seed value', () => {
    const field = new FieldEditState('Untitled');

    expect(field.state).toBe(DocumentState.Clean);
    expect(field.isDirty).toBe(false);
    expect(field.currentValue).toBe('Untitled');
    expect(field.savedValue).toBe('Untitled');
  });

  it('commit() updates currentValue and makes the field dirty', () => {
    const field = new FieldEditState('Untitled');

    field.commit('Renamed');

    expect(field.currentValue).toBe('Renamed');
    expect(field.isDirty).toBe(true);
    expect(field.savedValue).toBe('Untitled');
  });

  it('commit() with the same value is a no-op', () => {
    const field = new FieldEditState('Untitled');

    field.commit('Untitled');

    expect(field.isDirty).toBe(false);
  });

  it('beginSave() transitions to Saving without touching currentValue/savedValue', () => {
    const field = new FieldEditState('Untitled');
    field.commit('Renamed');

    field.beginSave();

    expect(field.state).toBe(DocumentState.Saving);
    expect(field.currentValue).toBe('Renamed');
    expect(field.savedValue).toBe('Untitled');
  });

  it('markSaved(value) records the persisted value and returns to Clean', () => {
    const field = new FieldEditState('Untitled');
    field.commit('Renamed');
    field.beginSave();

    field.markSaved('Renamed');

    expect(field.state).toBe(DocumentState.Clean);
    expect(field.savedValue).toBe('Renamed');
    expect(field.isDirty).toBe(false);
  });

  it('markSaved() leaves the field dirty if currentValue advanced again during the save', () => {
    const field = new FieldEditState('Untitled');
    field.commit('First');
    field.beginSave();
    field.commit('Second, during save');

    field.markSaved('First');

    expect(field.isDirty).toBe(true);
    expect(field.currentValue).toBe('Second, during save');
  });

  it('markSaveFailed() transitions to SaveError, preserving currentValue', () => {
    const field = new FieldEditState('Untitled');
    field.commit('Renamed');
    field.beginSave();

    field.markSaveFailed();

    expect(field.state).toBe(DocumentState.SaveError);
    expect(field.currentValue).toBe('Renamed');
  });

  it('markDisposed() is terminal and idempotent', () => {
    const field = new FieldEditState('Untitled');

    field.markDisposed();
    field.markDisposed();

    expect(field.state).toBe(DocumentState.Disposed);
  });

  it('every mutating method is a no-op once Disposed', () => {
    const field = new FieldEditState('Untitled');
    field.markDisposed();

    field.commit('Renamed');
    field.beginSave();
    field.markSaved('Renamed');
    field.markSaveFailed();

    expect(field.state).toBe(DocumentState.Disposed);
    expect(field.currentValue).toBe('Untitled');
  });

  it('works generically over a non-string value type', () => {
    const field = new FieldEditState({ icon: 'star' });

    field.commit({ icon: 'heart' });

    expect(field.currentValue).toEqual({ icon: 'heart' });
    expect(field.isDirty).toBe(true);
  });
});
