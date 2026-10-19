import { describe, expect, it } from 'vitest';

import {
  listSpaces,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  withReplacedSpace,
  withoutSpace,
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

  it('is the empty registry (no active Space) when nothing is stored and there is no default', () => {
    expect(loadSpaceRegistry(memoryStorage())).toEqual({ paths: [], activePath: null });
  });

  it('is the empty registry for malformed storage without a default, and never writes', () => {
    const storage = memoryStorage('{not json');
    expect(loadSpaceRegistry(storage)).toEqual({ paths: [], activePath: null });
    expect(storage.value).toBe('{not json');
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

  it('stays paths and an active path only: extra keys from any older build are ignored, never kept or re-saved', () => {
    const storage = memoryStorage(
      '{"paths":["/a","/b"],"activePath":"/b","avatars":{"/a":{"type":"emoji","emoji":"🌿"}},"ids":{"/a":"x"}}'
    );

    const loaded = loadSpaceRegistry(storage);

    expect(loaded).toEqual({ paths: ['/a', '/b'], activePath: '/b' });
    saveSpaceRegistry(storage, withActiveSpace(loaded, '/a'));
    expect(JSON.parse(storage.value!)).toEqual({ paths: ['/a', '/b'], activePath: '/a' });
  });

  describe('withReplacedSpace', () => {
    const base = { paths: ['/a', '/gone', '/b'], activePath: '/a' };

    it('puts the chosen folder where the old entry was and makes it active', () => {
      expect(withReplacedSpace(base, '/gone', '/new/')).toEqual({
        paths: ['/a', '/new', '/b'],
        activePath: '/new',
      });
    });

    it('keeps an already registered target as it is and drops the replaced entry', () => {
      expect(withReplacedSpace(base, '/gone', '/b')).toEqual({ paths: ['/a', '/b'], activePath: '/b' });
    });

    it('just registers and activates the target when the replaced path was never registered', () => {
      expect(withReplacedSpace(base, '/nope', '/c')).toEqual({
        paths: ['/a', '/gone', '/b', '/c'],
        activePath: '/c',
      });
    });
  });

  describe('withoutSpace', () => {
    const base = { paths: ['/a', '/gone', '/b'], activePath: '/a' };

    it('removes only that entry', () => {
      expect(withoutSpace(base, '/gone/')).toEqual({ paths: ['/a', '/b'], activePath: '/a' });
    });

    it('never removes the active Space, and ignores an unregistered path', () => {
      expect(withoutSpace(base, '/a')).toBe(base);
      expect(withoutSpace(base, '/zzz')).toBe(base);
    });
  });
});

