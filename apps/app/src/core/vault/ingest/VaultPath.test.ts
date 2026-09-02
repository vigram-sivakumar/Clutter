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

describe('VaultPath.extension', () => {
  it('returns the lowercased extension including the dot', () => {
    expect(VaultPath.extension('/vault/Assets/Cover.PNG')).toBe('.png');
  });

  it('returns an empty string for a filename with no extension', () => {
    expect(VaultPath.extension('/vault/Notes/README')).toBe('');
  });

  it('treats a leading dot with nothing before it as no extension', () => {
    expect(VaultPath.extension('/vault/.gitignore')).toBe('');
  });

  it('uses only the final segment when a filename has multiple dots', () => {
    expect(VaultPath.extension('/vault/.folder.md')).toBe('.md');
  });
});

describe('VaultPath.stemName', () => {
  it('strips a supported resource extension, e.g. .png', () => {
    expect(VaultPath.stemName('/vault/Assets/hero.png')).toBe('hero');
  });

  it('strips a .pdf extension the same way', () => {
    expect(VaultPath.stemName('/vault/Documents/spec.pdf')).toBe('spec');
  });

  it('is case-insensitive about the extension it strips, mirroring extension()', () => {
    expect(VaultPath.stemName('/vault/Assets/Cover.PNG')).toBe('Cover');
  });

  it('leaves a filename with no extension unchanged', () => {
    expect(VaultPath.stemName('/vault/Notes/README')).toBe('README');
  });

  it('treats a leading dot with nothing before it as no extension, mirroring extension()', () => {
    expect(VaultPath.stemName('/vault/.gitignore')).toBe('.gitignore');
  });

  it('strips only the final extension when a filename has multiple dots', () => {
    expect(VaultPath.stemName('/vault/archive.tar.gz')).toBe('archive.tar');
  });

  it('is not Markdown-specific — unlike pageName(), it strips whatever extension() reports, not just .md', () => {
    expect(VaultPath.stemName('/vault/Notes/Idea.md')).toBe('Idea');
    expect(VaultPath.stemName('/vault/Assets/hero.png')).toBe('hero');
  });
});
