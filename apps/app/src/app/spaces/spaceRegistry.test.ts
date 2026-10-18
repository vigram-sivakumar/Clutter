import { describe, expect, it } from 'vitest';

import {
  listSpaces,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  withSpaceAvatar,
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

  describe('avatars', () => {
    const base = { paths: ['/a', '/b'], activePath: '/a' };

    it('sets an emoji avatar and an image avatar, keyed by the Space path', () => {
      const withEmoji = withSpaceAvatar(base, '/a', { type: 'emoji', emoji: '🌿' });
      const both = withSpaceAvatar(withEmoji, '/b/', { type: 'image', src: '/Users/me/logo.png' });
      expect(both.avatars).toEqual({
        '/a': { type: 'emoji', emoji: '🌿' },
        '/b': { type: 'image', src: '/Users/me/logo.png' },
      });
    });

    it('removing an avatar drops its entry, and the whole field once none is left', () => {
      const both = withSpaceAvatar(withSpaceAvatar(base, '/a', { type: 'emoji', emoji: '🌿' }), '/b', {
        type: 'emoji',
        emoji: '🔥',
      });
      const one = withSpaceAvatar(both, '/a', undefined);
      expect(one.avatars).toEqual({ '/b': { type: 'emoji', emoji: '🔥' } });
      expect(withSpaceAvatar(one, '/b', undefined)).toEqual(base);
      expect('avatars' in withSpaceAvatar(one, '/b', undefined)).toBe(false);
    });

    it('ignores a path that is not registered', () => {
      expect(withSpaceAvatar(base, '/zzz', { type: 'emoji', emoji: '🌿' })).toBe(base);
    });

    it('keeps avatars when another Space is registered or activated', () => {
      const registry = withSpaceAvatar(base, '/a', { type: 'emoji', emoji: '🌿' });
      expect(withActiveSpace(registry, '/c').avatars).toEqual({ '/a': { type: 'emoji', emoji: '🌿' } });
    });

    it('lists each Space with its own avatar, and none for a Space without one', () => {
      const registry = withSpaceAvatar(base, '/b', { type: 'image', src: '/p/x.png' });
      expect(listSpaces(registry)).toEqual([
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b', avatar: { type: 'image', src: '/p/x.png' } },
      ]);
    });

    it('restores emoji and image avatars after a restart (save, then load)', () => {
      const storage = memoryStorage();
      const registry = withSpaceAvatar(withSpaceAvatar(base, '/a', { type: 'emoji', emoji: '🌿' }), '/b', {
        type: 'image',
        src: '/Volumes/Drive/logo.png',
      });
      expect(saveSpaceRegistry(storage, registry)).toBe(true);
      expect(loadSpaceRegistry(storage)).toEqual(registry);
    });

    it('reads a registry saved before avatars existed, unchanged', () => {
      const old = memoryStorage('{"paths":["/a","/b"],"activePath":"/b"}');
      const loaded = loadSpaceRegistry(old);
      expect(loaded).toEqual({ paths: ['/a', '/b'], activePath: '/b' });
      expect('avatars' in loaded).toBe(false);
    });

    it('drops malformed avatar entries and entries for unregistered paths, keeping the rest', () => {
      const raw = JSON.stringify({
        ...base,
        avatars: {
          '/a': { type: 'emoji', emoji: '🌿' },
          '/b': { type: 'emoji', emoji: '' },
          '/zzz': { type: 'emoji', emoji: '🔥' },
          '/a/': { type: 'sparkle' },
        },
      });
      expect(loadSpaceRegistry(memoryStorage(raw)).avatars).toEqual({ '/a': { type: 'emoji', emoji: '🌿' } });
    });

    it.each([['an array', '[]'], ['a string', '"x"'], ['null', 'null']])('ignores avatars that are %s', (_n, avatars) => {
      const raw = `{"paths":["/a"],"activePath":"/a","avatars":${avatars}}`;
      expect(loadSpaceRegistry(memoryStorage(raw))).toEqual({ paths: ['/a'], activePath: '/a' });
    });
  });
});
