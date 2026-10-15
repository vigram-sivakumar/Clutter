import { describe, expect, it } from 'vitest';

import {
  listSpaces,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  type SpaceRegistryStorage,
} from './spaceRegistry';

function memoryStorage(initial?: string): SpaceRegistryStorage & { value: string | null } {
  const store = {
    value: initial ?? null,
    getItem: () => store.value,
    setItem: (_key: string, value: string) => {
      store.value = value;
    },
  };
  return store;
}

describe('spaceRegistry', () => {
  it('defaults to the default Space when nothing is stored', () => {
    expect(loadSpaceRegistry(memoryStorage(), '/v/Default')).toEqual({
      paths: ['/v/Default'],
      activePath: '/v/Default',
    });
  });

  it('registers a new folder and makes it active', () => {
    const next = withActiveSpace({ paths: ['/a'], activePath: '/a' }, '/b');
    expect(next).toEqual({ paths: ['/a', '/b'], activePath: '/b' });
  });

  it('does not duplicate an already registered folder, even with a trailing slash', () => {
    const next = withActiveSpace({ paths: ['/a', '/b'], activePath: '/b' }, '/a/');
    expect(next).toEqual({ paths: ['/a', '/b'], activePath: '/a' });
  });

  it('normalizes trailing slashes but keeps the filesystem root', () => {
    expect(normalizeSpacePath('/x/y//')).toBe('/x/y');
    expect(normalizeSpacePath('/')).toBe('/');
  });

  it('names a Space after its folder', () => {
    expect(listSpaces({ paths: ['/home/me/Notes', '/home/me/Work'], activePath: '/home/me/Notes' })).toEqual([
      { path: '/home/me/Notes', name: 'Notes' },
      { path: '/home/me/Work', name: 'Work' },
    ]);
  });

  it('round-trips through storage, so the active Space is restored', () => {
    const storage = memoryStorage();
    saveSpaceRegistry(storage, { paths: ['/a', '/b'], activePath: '/b' });
    expect(loadSpaceRegistry(storage, '/default')).toEqual({ paths: ['/a', '/b'], activePath: '/b' });
  });

  it.each([
    ['malformed JSON', '{nope'],
    ['wrong shape', '{"paths":"x","activePath":1}'],
    ['active not registered', '{"paths":["/a"],"activePath":"/z"}'],
    ['empty list', '{"paths":[],"activePath":"/a"}'],
  ])('falls back to the default for %s', (_name, raw) => {
    expect(loadSpaceRegistry(memoryStorage(raw), '/d')).toEqual({ paths: ['/d'], activePath: '/d' });
  });

  it('survives a storage that throws', () => {
    const broken: SpaceRegistryStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadSpaceRegistry(broken, '/d').activePath).toBe('/d');
    expect(() => saveSpaceRegistry(broken, { paths: ['/d'], activePath: '/d' })).not.toThrow();
  });
});
