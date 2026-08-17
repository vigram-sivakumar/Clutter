import { describe, expect, it } from 'vitest';
import { resolveCollisionFreeName } from './resolveCollisionFreeName';

describe('resolveCollisionFreeName', () => {
  it('returns the base name when nothing is taken', () => {
    expect(resolveCollisionFreeName('Untitled', () => false)).toBe('Untitled');
  });

  it('appends " 2" when the base name alone is taken', () => {
    const taken = new Set(['Untitled']);

    expect(resolveCollisionFreeName('Untitled', (name) => taken.has(name))).toBe(
      'Untitled 2'
    );
  });

  it('keeps incrementing until a free name is found', () => {
    const taken = new Set(['Untitled', 'Untitled 2', 'Untitled 3']);

    expect(resolveCollisionFreeName('Untitled', (name) => taken.has(name))).toBe(
      'Untitled 4'
    );
  });

  describe('with { firstSuffix: 1 }', () => {
    it('returns the base name when nothing is taken', () => {
      expect(
        resolveCollisionFreeName('Note', () => false, { firstSuffix: 1 })
      ).toBe('Note');
    });

    it('appends " 1" when the base name alone is taken', () => {
      const taken = new Set(['Note']);

      expect(
        resolveCollisionFreeName('Note', (name) => taken.has(name), {
          firstSuffix: 1,
        })
      ).toBe('Note 1');
    });

    it('appends " 2" when the base name and " 1" are taken', () => {
      const taken = new Set(['Note', 'Note 1']);

      expect(
        resolveCollisionFreeName('Note', (name) => taken.has(name), {
          firstSuffix: 1,
        })
      ).toBe('Note 2');
    });

    it('fills gaps by returning the first available suffix', () => {
      const taken = new Set(['Note', 'Note 2']);

      expect(
        resolveCollisionFreeName('Note', (name) => taken.has(name), {
          firstSuffix: 1,
        })
      ).toBe('Note 1');
    });
  });
});
