import { describe, expect, it, vi } from 'vitest';

import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import { renameInactiveSpaceFolder, type InactiveRenameDeps } from './renameInactiveSpace';
import { SpaceLifecycleGuard } from './spaceLifecycleGuard';

const ACTIVE = '/s/Alpha';
const FROM = '/s/Beta';
const TO = '/s/Gamma';
const ID = 'space-b';

interface Overrides {
  registered?: boolean;
  status?: SpaceFolderStatus;
  taken?: (path: string) => boolean;
  readSpaceId?: (path: string, reads: number) => string | null | 'unreadable';
  renameFolder?: InactiveRenameDeps['renameFolder'];
  migrate?: boolean;
  renameEntry?: boolean;
}

function setup(overrides: Overrides = {}) {
  const log: string[] = [];
  const guard = new SpaceLifecycleGuard();
  const guardSeen: (string | null)[] = [];
  const note = (entry: string) => {
    log.push(entry);
    guardSeen.push(guard.active);
  };
  const reads = new Map<string, number>();
  const deps: InactiveRenameDeps = {
    guard,
    activePath: () => ACTIVE,
    isRegistered: () => overrides.registered ?? true,
    probe: vi.fn(async () => {
      note('probe');
      return overrides.status ?? 'available';
    }),
    readSpaceId: vi.fn(async (path: string) => {
      const count = (reads.get(path) ?? 0) + 1;
      reads.set(path, count);
      note(`read ${path}`);
      return overrides.readSpaceId ? overrides.readSpaceId(path, count) : ID;
    }),
    destinationExists: vi.fn(async (path: string) => {
      note(`exists ${path}`);
      return overrides.taken?.(path) ?? false;
    }),
    renameFolder: vi.fn(
      overrides.renameFolder ??
        (async () => {
          note('rename');
          return { path: TO };
        })
    ),
    migrateState: vi.fn(async () => {
      note('migrate');
      return overrides.migrate ?? true;
    }),
    renameEntry: vi.fn(() => {
      note('entry');
      return overrides.renameEntry ?? true;
    }),
  };

  return { deps, log, guard, guardSeen };
}

describe('renameInactiveSpaceFolder', () => {
  it('renames the folder, confirms the Space there, carries its state over, then moves the registry entry — all under the guard', async () => {
    const { deps, log, guard, guardSeen } = setup();

    const outcome = await renameInactiveSpaceFolder(deps, FROM, 'Gamma');

    expect(outcome).toEqual({ status: 'renamed', path: TO, warnings: [] });
    expect(log).toEqual([`exists ${TO}`, 'probe', `read ${FROM}`, 'rename', `read ${TO}`, 'migrate', 'entry']);
    expect(guardSeen.every((held) => held === 'renaming')).toBe(true);
    expect(guard.active).toBeNull();
    expect(deps.migrateState).toHaveBeenCalledWith(FROM, TO);
    expect(deps.renameEntry).toHaveBeenCalledWith(FROM, TO);
  });

  it.each<[string, string, Overrides, string, string]>([
    ['an unregistered path', FROM, { registered: false }, 'Gamma', 'no-space'],
    ['the open Space', ACTIVE, {}, 'Gamma', 'not-inactive'],
    ['an invalid name', FROM, {}, 'a/b', 'invalid-name'],
    ['an unchanged name', FROM, {}, 'Beta', 'unchanged'],
    ['a name that is already taken', FROM, { taken: () => true }, 'Gamma', 'name-taken'],
    ['a folder that cannot be reached', FROM, { status: 'unavailable' }, 'Gamma', 'unavailable'],
    ['a folder that is missing', FROM, { status: 'missing' }, 'Gamma', 'unavailable'],
    ['an id that cannot be read', FROM, { readSpaceId: () => 'unreadable' }, 'Gamma', 'unavailable'],
  ])('refuses %s without touching the folder or the registry', async (_label, path, overrides, name, reason) => {
    const { deps, guard } = setup(overrides);

    expect(await renameInactiveSpaceFolder(deps, path, name)).toEqual({ status: 'refused', reason });

    expect(deps.renameFolder).not.toHaveBeenCalled();
    expect(deps.migrateState).not.toHaveBeenCalled();
    expect(deps.renameEntry).not.toHaveBeenCalled();
    expect(guard.active).toBeNull();
  });

  it('a case-only change is left to the Rust rename rather than refused as "taken"', async () => {
    const { deps } = setup({ taken: () => true });

    const outcome = await renameInactiveSpaceFolder(deps, FROM, 'beta'.toUpperCase());

    expect(outcome.status).toBe('renamed');
    expect(deps.renameFolder).toHaveBeenCalledWith(FROM, 'BETA');
  });

  it('a failed folder rename leaves the registry pointing at the original path, and never retries or renames back', async () => {
    const { deps, guard } = setup({ renameFolder: async () => ({ error: 'A folder with that name already exists. Choose another name' }) });

    const outcome = await renameInactiveSpaceFolder(deps, FROM, 'Gamma');

    expect(outcome).toEqual({ status: 'failed', message: 'A folder with that name already exists. Choose another name' });
    expect(deps.renameFolder).toHaveBeenCalledTimes(1);
    expect(deps.renameEntry).not.toHaveBeenCalled();
    expect(deps.migrateState).not.toHaveBeenCalled();
    expect(guard.active).toBeNull();
  });

  it('a Space that cannot be seen at its new path is reported, the registry is not moved, and nothing is renamed back', async () => {
    const { deps } = setup({ readSpaceId: (path) => (path === TO ? null : ID) });

    const outcome = await renameInactiveSpaceFolder(deps, FROM, 'Gamma');

    expect(outcome.status).toBe('unconfirmed');
    expect(deps.renameEntry).not.toHaveBeenCalled();
    expect(deps.renameFolder).toHaveBeenCalledTimes(1);
  });

  it('a Space with no profile (no id) is renamed too: there is no id to compare', async () => {
    const { deps } = setup({ readSpaceId: () => null });

    expect((await renameInactiveSpaceFolder(deps, FROM, 'Gamma')).status).toBe('renamed');
  });

  it('reports state that could not be carried over, and a registry write that was not saved, and still moves the entry', async () => {
    const { deps } = setup({ migrate: false, renameEntry: false });

    expect(await renameInactiveSpaceFolder(deps, FROM, 'Gamma')).toEqual({
      status: 'renamed',
      path: TO,
      warnings: ['state-not-migrated', 'registry-not-saved'],
    });
    expect(deps.renameEntry).toHaveBeenCalled();
  });

  it('an unexpected failure is reported, the guard released, and the registry untouched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, guard } = setup({
      renameFolder: async () => {
        throw new Error('boom');
      },
    });

    expect((await renameInactiveSpaceFolder(deps, FROM, 'Gamma')).status).toBe('failed');
    expect(deps.renameEntry).not.toHaveBeenCalled();
    expect(guard.active).toBeNull();
  });

  it.each(['renaming', 'removing'] as const)('is refused while %s holds the guard, and leaves it held', async (kind) => {
    const { deps, guard } = setup();
    const other = guard.begin(kind)!;

    expect(await renameInactiveSpaceFolder(deps, FROM, 'Gamma')).toEqual({ status: 'refused', reason: 'busy' });

    expect(deps.renameFolder).not.toHaveBeenCalled();
    expect(guard.active).toBe(kind);
    other();
  });

  it('two renames cannot overlap: the second is refused while the first runs', async () => {
    const { deps } = setup();
    const first = renameInactiveSpaceFolder(deps, FROM, 'Gamma');
    const second = await renameInactiveSpaceFolder(deps, FROM, 'Delta');
    await first;

    expect(second).toEqual({ status: 'refused', reason: 'busy' });
    expect(deps.renameFolder).toHaveBeenCalledTimes(1);
  });
});
