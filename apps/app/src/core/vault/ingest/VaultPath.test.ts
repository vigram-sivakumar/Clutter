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

describe('VaultPath.pageName', () => {
  it('strips a trailing .md from the filename', () => {
    expect(VaultPath.pageName('/vault/Notes/Idea.md')).toBe('Idea');
  });

  it('leaves a filename with no .md extension unchanged', () => {
    expect(VaultPath.pageName('/vault/Notes/Idea')).toBe('Idea');
  });

  it('only strips a trailing .md, not one embedded mid-filename', () => {
    expect(VaultPath.pageName('/vault/Notes/my.md.backup')).toBe('my.md.backup');
  });
});

describe('VaultPath.isHidden', () => {
  it('returns true for a dot-prefixed folder name', () => {
    expect(VaultPath.isHidden('.git')).toBe(true);
  });

  it('returns true for a dot-prefixed file name', () => {
    expect(VaultPath.isHidden('.archive.md')).toBe(true);
  });

  it('returns true for the reserved .clutter folder name', () => {
    expect(VaultPath.isHidden('.clutter')).toBe(true);
  });

  it('returns false for an ordinary name', () => {
    expect(VaultPath.isHidden('Notes')).toBe(false);
  });

  it('returns false for a name that merely contains a dot', () => {
    expect(VaultPath.isHidden('Idea.md')).toBe(false);
  });
});
