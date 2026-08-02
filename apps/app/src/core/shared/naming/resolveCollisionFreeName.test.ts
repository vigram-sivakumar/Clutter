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
});
