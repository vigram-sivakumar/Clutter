import { describe, expect, it } from 'vitest';
import { VaultPath } from './VaultPath';

describe('VaultPath.normalizeForMatch', () => {
  it('collapses repeated separators, reads backslashes as separators and drops a trailing one', () => {
    expect(VaultPath.normalizeForMatch('/vault//Projects///Note.md')).toBe('/vault/Projects/Note.md');
    expect(VaultPath.normalizeForMatch('/vault\\Projects\\Note.md')).toBe('/vault/Projects/Note.md');
    expect(VaultPath.normalizeForMatch('/vault/Projects/')).toBe('/vault/Projects');
  });

  it('compares composed and decomposed Unicode as the same name, and keeps case', () => {
    expect(VaultPath.normalizeForMatch('/vault/Cafe\u0301.md')).toBe(VaultPath.normalizeForMatch('/vault/Caf\u00e9.md'));
    expect(VaultPath.normalizeForMatch('/vault/Note.md')).not.toBe(VaultPath.normalizeForMatch('/vault/note.md'));
  });

  it('leaves a clean path, and the root itself, alone', () => {
    expect(VaultPath.normalizeForMatch('/vault/A/B.md')).toBe('/vault/A/B.md');
    expect(VaultPath.normalizeForMatch('/')).toBe('/');
  });
});
