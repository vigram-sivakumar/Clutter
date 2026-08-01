import { describe, expect, it } from 'vitest';
import { VaultPath } from './VaultPath';

describe('VaultPath.filename', () => {
  it('returns the last path segment', () => {
    expect(VaultPath.filename('/vault/Notes/Idea.md')).toBe('Idea.md');
  });

  it('returns the whole string when there is no slash', () => {
    expect(VaultPath.filename('Idea.md')).toBe('Idea.md');
  });

  it('returns the last segment for a folder path', () => {
    expect(VaultPath.filename('/vault/Notes')).toBe('Notes');
  });
});

describe('VaultPath.parentDirectory', () => {
  it('returns everything before the last slash', () => {
    expect(VaultPath.parentDirectory('/vault/Notes/Idea.md')).toBe(
      '/vault/Notes'
    );
  });

  it('returns an empty string when there is no slash', () => {
    expect(VaultPath.parentDirectory('Idea.md')).toBe('');
  });
});

describe('VaultPath.isDescendantOf', () => {
  it('returns true for a direct child', () => {
    expect(VaultPath.isDescendantOf('/vault/Archive/Note.md', '/vault/Archive')).toBe(
      true
    );
  });

  it('returns true for a nested descendant', () => {
    expect(
      VaultPath.isDescendantOf('/vault/Archive/2026/Note.md', '/vault/Archive')
    ).toBe(true);
  });

  it('returns false for an unrelated path', () => {
    expect(VaultPath.isDescendantOf('/vault/Inbox/Note.md', '/vault/Archive')).toBe(
      false
    );
  });

  it('returns false for a path that merely shares a prefix without a slash boundary', () => {
    expect(
      VaultPath.isDescendantOf('/vault/ArchiveOld/Note.md', '/vault/Archive')
    ).toBe(false);
  });

  it('returns false for the ancestor path itself', () => {
    expect(VaultPath.isDescendantOf('/vault/Archive', '/vault/Archive')).toBe(
      false
    );
  });
});
