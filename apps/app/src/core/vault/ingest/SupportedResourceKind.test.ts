import { describe, expect, it } from 'vitest';
import { classifySupportedResourceFile } from './SupportedResourceKind';

describe('classifySupportedResourceFile', () => {
  it('classifies .pdf as pdf', () => {
    expect(classifySupportedResourceFile('Report.pdf')).toBe('pdf');
  });

  it('classifies common image extensions as image', () => {
    for (const name of ['photo.png', 'photo.jpg', 'photo.jpeg', 'photo.gif', 'photo.webp', 'photo.svg']) {
      expect(classifySupportedResourceFile(name)).toBe('image');
    }
  });

  it('is case-insensitive on extension', () => {
    expect(classifySupportedResourceFile('Scan.PDF')).toBe('pdf');
    expect(classifySupportedResourceFile('Photo.PNG')).toBe('image');
  });

  it('returns null for markdown files', () => {
    expect(classifySupportedResourceFile('Note.md')).toBeNull();
    expect(classifySupportedResourceFile('.folder.md')).toBeNull();
  });

  it('returns null for unsupported file types', () => {
    expect(classifySupportedResourceFile('notes.txt')).toBeNull();
    expect(classifySupportedResourceFile('archive.zip')).toBeNull();
    expect(classifySupportedResourceFile('no-extension')).toBeNull();
  });
});
