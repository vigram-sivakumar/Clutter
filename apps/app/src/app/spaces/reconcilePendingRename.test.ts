import { describe, expect, it, vi } from 'vitest';

import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import { reconcilePendingRename, type SpaceIdReading } from './reconcilePendingRename';
import type { SpaceRegistry } from './spaceRegistry';

const OLD = '/s/Old';
const NEW = '/s/New';
const ID = 'space-1';

const registry: SpaceRegistry = {
  paths: [OLD, '/s/Other'],
  activePath: OLD,
  pendingRename: { from: OLD, to: NEW, spaceId: ID },
};

interface World {
  status: Record<string, SpaceFolderStatus>;
  ids: Record<string, SpaceIdReading>;
}

function run(world: World, subject: SpaceRegistry = registry) {
  const readSpaceId = vi.fn(async (path: string) => world.ids[path] ?? null);
  const outcome = reconcilePendingRename(subject, { probe: async (path) => world.status[path] ?? 'missing', readSpaceId });
  return { outcome, readSpaceId };
}

const cleared = { paths: [OLD, '/s/Other'], activePath: OLD };
const moved = { paths: [NEW, '/s/Other'], activePath: NEW };

describe('reconcilePendingRename', () => {
  it('does nothing without a record', async () => {
    const plain = { paths: [OLD], activePath: OLD };
    const { outcome, readSpaceId } = run({ status: {}, ids: {} }, plain);

    expect(await outcome).toEqual({ registry: plain, changed: false, blockedActivePath: null });
    expect(readSpaceId).not.toHaveBeenCalled();
  });

  it('old path is the Space and the destination is definitively missing: keeps the old path, clears the record', async () => {
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'missing' }, ids: { [OLD]: ID } }).outcome;

    expect(result.registry).toEqual(cleared);
    expect(result).toMatchObject({ changed: true, blockedActivePath: null });
  });

  it('old path is the Space and the destination holds a different Space: keeps the old path, clears the record, says so', async () => {
    const result = await run({
      status: { [OLD]: 'available', [NEW]: 'available' },
      ids: { [OLD]: ID, [NEW]: 'someone-else' },
    }).outcome;

    expect(result.registry).toEqual(cleared);
    expect(result.notice).toMatch(/different space already exists/);
  });

  it('old path is the Space and the destination is an empty folder a crash left: keeps the old path, clears the record, no alarm', async () => {
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'available' }, ids: { [OLD]: ID, [NEW]: null } }).outcome;

    expect(result.registry).toEqual(cleared);
    expect(result.notice).toBeUndefined();
  });

  it('both paths exist and both carry the recorded id: ambiguous — neither is opened or changed, and the record is kept', async () => {
    const migrateState = vi.fn(async () => true);
    const result = await reconcilePendingRename(registry, {
      probe: async () => 'available',
      readSpaceId: async () => ID,
      migrateState,
    });

    // A matching id does not make them the same folder (a copy carries the same id), so the old path is held back too.
    expect(result).toMatchObject({ registry, changed: false, blockedActivePath: OLD });
    expect(result.registry.pendingRename).toBeDefined();
    expect(result.notice).toMatch(/Neither was opened or changed/);
    expect(migrateState).not.toHaveBeenCalled();
  });

  it('the ambiguous case does not hold back an active Space that is not the one being renamed', async () => {
    const elsewhere = { ...registry, activePath: '/s/Other' };
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'available' }, ids: { [OLD]: ID, [NEW]: ID } }, elsewhere).outcome;

    expect(result).toMatchObject({ changed: false, blockedActivePath: null });
    expect(result.registry.pendingRename).toBeDefined();
  });

  it('old path missing, destination verified by id: re-points the registry and clears the record', async () => {
    const result = await run({ status: { [OLD]: 'missing', [NEW]: 'available' }, ids: { [NEW]: ID } }).outcome;

    expect(result.registry).toEqual(moved);
    expect(result).toMatchObject({ changed: true, blockedActivePath: null });
  });

  it('a recreated old path belonging to a DIFFERENT Space is not trusted: the destination, verified by id, is used', async () => {
    const result = await run({
      status: { [OLD]: 'available', [NEW]: 'available' },
      ids: { [OLD]: 'a-different-space', [NEW]: ID },
    }).outcome;

    expect(result.registry).toEqual(moved);
    expect(result.notice).toMatch(/different space/);
  });

  it('a recreated old path with no Space profile is not trusted either', async () => {
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'available' }, ids: { [OLD]: null, [NEW]: ID } }).outcome;

    expect(result.registry).toEqual(moved);
  });

  it('a recreated old path belonging to a different Space, with nothing at the destination: the old path is NOT opened, the record is kept', async () => {
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'missing' }, ids: { [OLD]: 'a-different-space' } }).outcome;

    expect(result).toMatchObject({ registry, changed: false, blockedActivePath: OLD });
  });

  it('old path missing and the destination holds something else: does not re-point, keeps the record, blocks opening', async () => {
    const result = await run({ status: { [OLD]: 'missing', [NEW]: 'available' }, ids: { [NEW]: 'someone-else' } }).outcome;

    expect(result).toMatchObject({ registry, changed: false, blockedActivePath: OLD });
  });

  it('both paths definitively missing: the registration and the record are kept for the existing Missing Space flow', async () => {
    const result = await run({ status: { [OLD]: 'missing', [NEW]: 'missing' }, ids: {} }).outcome;

    expect(result).toMatchObject({ registry, changed: false, blockedActivePath: OLD });
    expect(result.registry.paths).toContain(OLD);
    expect(result.notice).toMatch(/couldn’t find/);
  });

  it.each([
    ['the old path', { [OLD]: 'unavailable', [NEW]: 'missing' }],
    ['the destination', { [OLD]: 'available', [NEW]: 'unavailable' }],
  ] as const)('%s unavailable is not "missing": nothing is decided, the record is kept, and nothing is declared lost', async (_which, status) => {
    const result = await run({ status: { ...status }, ids: { [OLD]: ID } }).outcome;

    expect(result.registry).toBe(registry);
    expect(result.changed).toBe(false);
    expect(result.registry.pendingRename).toBeDefined();
    expect(result.blockedActivePath).toBeNull();
    expect(result.notice).toMatch(/well enough/);
  });

  it('an unavailable destination does not excuse an old path that was read and is not the recorded Space', async () => {
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'unavailable' }, ids: { [OLD]: 'a-different-space' } }).outcome;

    expect(result).toMatchObject({ changed: false, blockedActivePath: OLD });
    expect(result.registry.pendingRename).toBeDefined();
  });

  it('a path whose id cannot be read is not "no profile": nothing is decided and the record is kept', async () => {
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'available' }, ids: { [OLD]: ID, [NEW]: 'unreadable' } }).outcome;

    expect(result).toMatchObject({ registry, changed: false, blockedActivePath: null });
  });

  it('without a recorded id nothing can be verified: the record is kept and the old path is not opened on faith', async () => {
    const unverifiable = { ...registry, pendingRename: { from: OLD, to: NEW, spaceId: null } };
    const result = await run({ status: { [OLD]: 'available', [NEW]: 'missing' }, ids: { [OLD]: ID } }, unverifiable).outcome;

    expect(result).toMatchObject({ changed: false, blockedActivePath: OLD });
  });

  it('a record about an entry that is no longer registered is just cleared', async () => {
    const stale = { paths: ['/s/Other'], activePath: '/s/Other', pendingRename: { from: OLD, to: NEW, spaceId: ID } };
    const result = await run({ status: {}, ids: {} }, stale).outcome;

    expect(result.registry).toEqual({ paths: ['/s/Other'], activePath: '/s/Other' });
  });

  it('never reads an id from a path that is not available', async () => {
    const { outcome, readSpaceId } = run({ status: { [OLD]: 'missing', [NEW]: 'available' }, ids: { [NEW]: ID } });
    await outcome;

    expect(readSpaceId.mock.calls.map(([path]) => path)).toEqual([NEW]);
  });

  describe('carrying the saved state over before the registry moves', () => {
    const world: World = { status: { [OLD]: 'missing', [NEW]: 'available' }, ids: { [NEW]: ID } };

    it('migrates first, from the old root to the new, and only then re-points', async () => {
      const order: string[] = [];
      const result = await reconcilePendingRename(registry, {
        probe: async (path) => world.status[path] ?? 'missing',
        readSpaceId: async (path) => {
          order.push(`read ${path}`);
          return world.ids[path] ?? null;
        },
        migrateState: async (from, to) => {
          order.push(`migrate ${from} -> ${to}`);
          return true;
        },
      });

      expect(order).toEqual([`read ${NEW}`, `migrate ${OLD} -> ${NEW}`]);
      expect(result.registry).toEqual(moved);
      expect(result.changed).toBe(true);
    });

    it('retries the migration when the rename finished earlier and the registry did not', async () => {
      const migrateState = vi.fn(async () => true);
      await reconcilePendingRename(registry, {
        probe: async (path) => world.status[path] ?? 'missing',
        readSpaceId: async (path) => world.ids[path] ?? null,
        migrateState,
      });

      expect(migrateState).toHaveBeenCalledOnce();
    });

    it('a migration that fails keeps the record and the old registry, does not re-point, and holds the Space back from opening', async () => {
      const result = await reconcilePendingRename(registry, {
        probe: async (path) => world.status[path] ?? 'missing',
        readSpaceId: async (path) => world.ids[path] ?? null,
        migrateState: async () => false,
      });

      expect(result).toMatchObject({ registry, changed: false, blockedActivePath: OLD });
      expect(result.registry.pendingRename).toBeDefined();
      expect(result.notice).toMatch(/try again next time/);
    });

    it('also migrates when a recreated old path is a different Space and the destination is the one', async () => {
      const migrateState = vi.fn(async () => true);
      const result = await reconcilePendingRename(registry, {
        probe: async () => 'available',
        readSpaceId: async (path) => (path === NEW ? ID : 'a-different-space'),
        migrateState,
      });

      expect(migrateState).toHaveBeenCalledOnce();
      expect(result.registry).toEqual(moved);
    });

    it('does not migrate when the registry is not being moved', async () => {
      const migrateState = vi.fn(async () => true);
      await reconcilePendingRename(registry, {
        probe: async (path) => (path === OLD ? 'available' : 'missing'),
        readSpaceId: async () => ID,
        migrateState,
      });

      expect(migrateState).not.toHaveBeenCalled();
    });
  });
});
