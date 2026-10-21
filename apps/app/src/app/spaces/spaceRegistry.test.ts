import { describe, expect, it } from 'vitest';

import {
  listSpaces,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  withPendingRename,
  withRenamedActiveSpace,
  withRenamedInactiveSpace,
  withoutPendingRename,
  withReplacedSpace,
  withoutActiveSpace,
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

  describe('withoutActiveSpace', () => {
    const base = { paths: ['/a', '/gone', '/b'], activePath: '/a' };

    it('forgets the active entry and makes the successor active, keeping everything else in order', () => {
      expect(withoutActiveSpace({ ...base, activePath: '/b' }, '/gone')).toEqual({
        paths: ['/a', '/gone'],
        activePath: '/gone',
      });
    });

    it('with no successor keeps every remaining entry, unavailable ones included, and no active Space', () => {
      expect(withoutActiveSpace(base, null)).toEqual({ paths: ['/gone', '/b'], activePath: null });
    });

    it('changes nothing for an unregistered successor, a successor that is itself, or no active Space', () => {
      expect(withoutActiveSpace(base, '/zzz')).toBe(base);
      expect(withoutActiveSpace(base, '/a')).toBe(base);
      const none = { paths: ['/a'], activePath: null };
      expect(withoutActiveSpace(none, null)).toBe(none);
    });
  });

  describe('a registry with entries and no active Space', () => {
    it('round-trips through storage without losing the unavailable entries', () => {
      const storage = memoryStorage();
      const registry = { paths: ['/gone', '/b/'], activePath: null };

      expect(saveSpaceRegistry(storage, registry)).toBe(true);

      expect(loadSpaceRegistry(storage)).toEqual({ paths: ['/gone', '/b'], activePath: null });
    });

    it('is still just "nothing configured" when it has no entries either', () => {
      const storage = memoryStorage(JSON.stringify({ paths: [], activePath: null }));
      expect(loadSpaceRegistry(storage)).toEqual({ paths: [], activePath: null });
    });

    it('still rejects an active path that is not registered, or a malformed one', () => {
      expect(loadSpaceRegistry(memoryStorage(JSON.stringify({ paths: ['/a'], activePath: '/b' })))).toEqual({
        paths: [],
        activePath: null,
      });
      expect(loadSpaceRegistry(memoryStorage(JSON.stringify({ paths: ['/a'], activePath: 5 })))).toEqual({
        paths: [],
        activePath: null,
      });
    });
  });

  describe('pendingRename', () => {
    const pending = { from: '/s/Old', to: '/s/New', spaceId: 'space-1' };
    const base = { paths: ['/s/Old', '/s/Other'], activePath: '/s/Old' };
    const withPending = { ...base, pendingRename: pending };

    it('round-trips through storage with the rest of the registry', () => {
      const storage = memoryStorage();

      saveSpaceRegistry(storage, withPending);

      expect(loadSpaceRegistry(storage)).toEqual(withPending);
    });

    it('a registry saved before the field existed still loads, with none', () => {
      const storage = memoryStorage(JSON.stringify(base));
      expect(loadSpaceRegistry(storage)).toEqual(base);
    });

    it('a malformed record is dropped, never guessed at, and the registry itself still loads', () => {
      for (const bad of [{ from: '/a' }, { from: '', to: '/b', spaceId: null }, { from: '/a', to: '/b', spaceId: 3 }, 'x', 5]) {
        const storage = memoryStorage(JSON.stringify({ ...base, pendingRename: bad }));
        expect(loadSpaceRegistry(storage)).toEqual(base);
      }
    });

    it('a record may have no id, and is normalised like the paths', () => {
      const storage = memoryStorage(
        JSON.stringify({ ...base, pendingRename: { from: '/s/Old/', to: '/s/New/', spaceId: null } })
      );
      expect(loadSpaceRegistry(storage).pendingRename).toEqual({ from: '/s/Old', to: '/s/New', spaceId: null });
    });

    it('survives with no active Space, next to the entries it concerns', () => {
      const storage = memoryStorage();
      const registry = { paths: ['/s/Old'], activePath: null, pendingRename: pending };
      saveSpaceRegistry(storage, registry);
      expect(loadSpaceRegistry(storage)).toEqual(registry);
    });

    it('withPendingRename records it and changes nothing else; withoutPendingRename removes only it', () => {
      expect(withPendingRename(base, pending)).toEqual(withPending);
      expect(withoutPendingRename(withPending)).toEqual(base);
      expect(withoutPendingRename(base)).toBe(base);
    });

    it('every helper keeps the record unless it intentionally settles it', () => {
      // Kept: switching to another Space, registering one, and forgetting an entry the record is not about.
      expect(withActiveSpace(withPending, '/s/Other').pendingRename).toEqual(pending);
      expect(withActiveSpace(withPending, '/s/Third').pendingRename).toEqual(pending);
      expect(withoutSpace({ ...withPending, activePath: '/s/Other' }, '/s/Old').pendingRename).toBeUndefined();
      expect(withoutSpace({ ...withPending, paths: ['/s/Old', '/s/Other', '/s/Z'] }, '/s/Z').pendingRename).toEqual(pending);
      expect(withReplacedSpace(withPending, '/s/Other', '/s/Elsewhere').pendingRename).toEqual(pending);
      expect(withoutActiveSpace({ ...withPending, activePath: '/s/Other' }, null).pendingRename).toEqual(pending);
      // Settled: the entry it is about was replaced or forgotten by an explicit choice.
      expect(withReplacedSpace(withPending, '/s/Old', '/s/Elsewhere').pendingRename).toBeUndefined();
      expect(withoutActiveSpace(withPending, '/s/Other').pendingRename).toBeUndefined();
    });

    it('withRenamedActiveSpace moves the active entry and clears the record in one mutation', () => {
      const next = withRenamedActiveSpace(withPending, '/s/New');

      expect(next).toEqual({ paths: ['/s/New', '/s/Other'], activePath: '/s/New' });
      expect(next).not.toHaveProperty('pendingRename');
    });

    it('withRenamedActiveSpace does not duplicate an entry already registered at the new path', () => {
      const registry = { paths: ['/s/Old', '/s/New'], activePath: '/s/Old', pendingRename: pending };
      expect(withRenamedActiveSpace(registry, '/s/New').paths).toEqual(['/s/New']);
    });
  });

  describe('withRenamedInactiveSpace', () => {
    const base = { paths: ['/s/A', '/s/B', '/s/C'], activePath: '/s/A' };

    it('moves only that entry, in place, and leaves the active Space alone', () => {
      expect(withRenamedInactiveSpace(base, '/s/B', '/s/Bee')).toEqual({ paths: ['/s/A', '/s/Bee', '/s/C'], activePath: '/s/A' });
    });

    it('normalises paths, and never duplicates an entry already registered at the new path', () => {
      expect(withRenamedInactiveSpace(base, '/s/B/', '/s/C/').paths).toEqual(['/s/A', '/s/C']);
    });

    it('does nothing for the active Space, an unregistered path, or the same path', () => {
      expect(withRenamedInactiveSpace(base, '/s/A', '/s/Z')).toBe(base);
      expect(withRenamedInactiveSpace(base, '/s/Nope', '/s/Z')).toBe(base);
      expect(withRenamedInactiveSpace(base, '/s/B', '/s/B')).toBe(base);
    });

    it('keeps a pending rename of the active Space, and settles one that was about the entry that moved', () => {
      const pending = { from: '/s/A', to: '/s/A2', spaceId: 'id-1' };
      expect(withRenamedInactiveSpace({ ...base, pendingRename: pending }, '/s/B', '/s/Bee').pendingRename).toEqual(pending);
      const aboutB = { ...base, pendingRename: { from: '/s/B', to: '/s/B2', spaceId: 'id-2' } };
      expect(withRenamedInactiveSpace(aboutB, '/s/B', '/s/Bee').pendingRename).toBeUndefined();
    });

    it('works with no active Space', () => {
      expect(withRenamedInactiveSpace({ paths: ['/s/B'], activePath: null }, '/s/B', '/s/Bee').paths).toEqual(['/s/Bee']);
    });
  });
});
