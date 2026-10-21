import { describe, expect, it, vi } from 'vitest';

import type { QuiesceResult } from '@core/application/Application';
import { describeRenameRefusal, renameActiveSpaceFolder, type RenameDeps, type RenameRefusal } from './renameActiveSpace';
import { SpaceLifecycleGuard } from './spaceLifecycleGuard';

const FROM = '/s/Notes';
const TO = '/s/Journal';
const ID = 'space-1';

interface Overrides {
  quiesce?: () => Promise<QuiesceResult>;
  renameFolder?: RenameDeps['renameFolder'];
  readSpaceId?: (path: string) => Promise<string | null | 'unreadable'>;
  beginRename?: boolean;
  completeRename?: boolean;
  migrate?: boolean;
  spaceId?: string | null;
  hasPending?: boolean;
  noApplication?: boolean;
  taken?: (path: string) => boolean;
}

/** Every collaborator, recording the order of what happened so a test can read the sequence back. */
function setup(overrides: Overrides = {}) {
  const log: string[] = [];
  const guard = new SpaceLifecycleGuard();
  const guardSeen: (string | null)[] = [];
  const note = (entry: string) => {
    log.push(entry);
    guardSeen.push(guard.active);
  };

  const application = {
    spaceId: 'spaceId' in overrides ? (overrides.spaceId ?? null) : ID,
    quiesceForRename: vi.fn(async () => {
      note('quiesce');
      return overrides.quiesce ? overrides.quiesce() : ({ ok: true } as QuiesceResult);
    }),
    close: vi.fn(async () => void note('close')),
  };
  const deps: RenameDeps = {
    guard,
    activePath: () => FROM,
    application: () => (overrides.noApplication ? null : application),
    detachApplication: vi.fn(() => void note('detach')),
    registry: {
      beginRename: vi.fn(() => {
        note('begin');
        return overrides.beginRename ?? true;
      }),
      completeRename: vi.fn(() => {
        note('complete');
        return overrides.completeRename ?? true;
      }),
      abandonRename: vi.fn(() => {
        note('abandon');
        return true;
      }),
      hasPendingRename: () => overrides.hasPending ?? false,
    },
    renameFolder: vi.fn(
      overrides.renameFolder ??
        (async () => {
          note('rename');
          return { path: TO };
        })
    ),
    readSpaceId: vi.fn(async (path: string) => {
      note(`read ${path}`);
      return overrides.readSpaceId ? overrides.readSpaceId(path) : ID;
    }),
    destinationExists: vi.fn(async (path: string) => {
      note(`exists ${path}`);
      return overrides.taken?.(path) ?? false;
    }),
    migrateState: vi.fn(async () => {
      note('migrate');
      return overrides.migrate ?? true;
    }),
    reopenActive: vi.fn(() => void note('reopen')),
    recoverFromLost: vi.fn((path: string) => void note(`recover ${path}`)),
  };

  return { deps, application, log, guard, guardSeen };
}

describe('renameActiveSpaceFolder', () => {
  it('runs the whole sequence in order, holding the guard until it is done, and ends on the new path', async () => {
    const { deps, log, guard, guardSeen } = setup();

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome).toEqual({ status: 'renamed', path: TO, warnings: [] });
    expect(log).toEqual([
      `exists ${TO}`, // a taken name is refused now, while the Space is still open
      `read ${FROM}`, // the id is confirmed to be saved in the folder
      'begin', // the pending record is written before anything changes
      'quiesce',
      'close',
      'detach',
      'rename',
      `read ${TO}`, // the Space is seen at its new path
      'migrate',
      'complete', // one write: new path active, record cleared
    ]);
    expect(guardSeen.every((held) => held === 'renaming')).toBe(true);
    expect(guard.active).toBeNull();
    expect(deps.reopenActive).not.toHaveBeenCalled(); // the registry's new path is what opens it
    expect(deps.recoverFromLost).not.toHaveBeenCalled();
  });

  it.each<[string, string, Overrides, string]>([
    ['an invalid name', 'a/b', {}, 'invalid-name'],
    ['an unchanged name', 'Notes', {}, 'unchanged'],
    ['no Space open', 'Journal', { noApplication: true }, 'no-space'],
    ['an id that is not saved in the folder', 'Journal', { readSpaceId: async () => null }, 'no-identity'],
    ['an id the Application does not have', 'Journal', { spaceId: null }, 'no-identity'],
    ['a rename already recorded', 'Journal', { hasPending: true }, 'already-pending'],
    ['a registry that cannot be written', 'Journal', { beginRename: false }, 'registry-unwritable'],
  ])('refuses %s before closing or changing anything', async (_label, name, overrides, reason) => {
    const { deps, application, log, guard } = setup(overrides);

    expect(await renameActiveSpaceFolder(deps, name)).toEqual({ status: 'refused', reason });

    expect(application.quiesceForRename).not.toHaveBeenCalled();
    expect(application.close).not.toHaveBeenCalled();
    expect(deps.renameFolder).not.toHaveBeenCalled();
    expect(log).not.toContain('detach');
    expect(guard.active).toBeNull();
  });

  it('refuses while another lifecycle operation holds the guard, and does not release it', async () => {
    const { deps, application, guard } = setup();
    const other = guard.begin('removing')!;

    expect(await renameActiveSpaceFolder(deps, 'Journal')).toEqual({ status: 'refused', reason: 'busy' });

    expect(application.quiesceForRename).not.toHaveBeenCalled();
    expect(guard.active).toBe('removing');
    other();
  });

  it.each<[QuiesceResult, string]>([
    [{ ok: false, reason: 'unsaved' }, 'unsaved'],
    [{ ok: false, reason: 'cancelled' }, 'cancelled'],
    [{ ok: false, reason: 'unsupported' }, 'unsupported'],
    [{ ok: false, reason: 'busy' }, 'unsaved'],
  ])('when quiescing fails (%j) the Application is never closed, the record is cleared and the guard released', async (result, reason) => {
    const { deps, application, log, guard } = setup({ quiesce: async () => result });

    expect(await renameActiveSpaceFolder(deps, 'Journal')).toEqual({ status: 'refused', reason });

    expect(application.close).not.toHaveBeenCalled();
    expect(deps.detachApplication).not.toHaveBeenCalled();
    expect(deps.renameFolder).not.toHaveBeenCalled();
    expect(log).toContain('abandon');
    expect(guard.active).toBeNull();
  });

  it('if quiescing throws, the Application is left alone and the record cleared', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, application, guard } = setup({
      quiesce: async () => {
        throw new Error('boom');
      },
    });

    expect(await renameActiveSpaceFolder(deps, 'Journal')).toEqual({ status: 'refused', reason: 'unsaved' });

    expect(application.close).not.toHaveBeenCalled();
    expect(deps.registry.abandonRename).toHaveBeenCalled();
    expect(guard.active).toBeNull();
  });

  it('when the folder cannot be renamed, verifies the old path is still the Space, then opens a fresh Application there (after releasing the guard)', async () => {
    const { deps, application, log, guardSeen } = setup({
      renameFolder: async () => ({ error: 'A folder with that name already exists' }),
    });

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome).toEqual({ status: 'failed', message: 'A folder with that name already exists', reopened: true });
    expect(log.slice(-3)).toEqual([`read ${FROM}`, 'abandon', 'reopen']);
    expect(deps.registry.completeRename).not.toHaveBeenCalled();
    expect(deps.migrateState).not.toHaveBeenCalled();
    // The sealed Application is not used again: closed once, never quiesced twice.
    expect(application.close).toHaveBeenCalledTimes(1);
    expect(application.quiesceForRename).toHaveBeenCalledTimes(1);
    expect(guardSeen[guardSeen.length - 1]).toBeNull(); // `reopen` ran with the guard already released
  });

  it('when the folder cannot be renamed and the old path no longer holds the Space, nothing is reopened: recovery takes over and the record stays', async () => {
    const { deps } = setup({
      renameFolder: async () => ({ error: 'permission denied' }),
      // The id is there when checked up front, and not after the failed rename.
      readSpaceId: (() => {
        let reads = 0;
        return async (path: string) => (path === FROM && ++reads > 1 ? 'a-different-space' : ID);
      })(),
    });

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome).toEqual({ status: 'recovery', message: 'permission denied' });
    expect(deps.reopenActive).not.toHaveBeenCalled();
    expect(deps.registry.abandonRename).not.toHaveBeenCalled();
    expect(deps.recoverFromLost).toHaveBeenCalledWith(FROM);
  });

  it('when the old path cannot even be read after a failed rename, it is not reopened on faith', async () => {
    const { deps } = setup({
      renameFolder: async () => ({ error: 'permission denied' }),
      readSpaceId: (() => {
        let reads = 0;
        return async (path: string) => (path === FROM && ++reads > 1 ? ('unreadable' as const) : ID);
      })(),
    });

    expect((await renameActiveSpaceFolder(deps, 'Journal')).status).toBe('recovery');
    expect(deps.reopenActive).not.toHaveBeenCalled();
  });

  it('renamed, but the Space is not seen at the new path: the registry is not moved, nothing is opened, recovery takes over', async () => {
    const { deps } = setup({ readSpaceId: async (path) => (path === TO ? null : ID) });

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome.status).toBe('recovery');
    expect(deps.registry.completeRename).not.toHaveBeenCalled();
    expect(deps.migrateState).not.toHaveBeenCalled();
    expect(deps.recoverFromLost).toHaveBeenCalledWith(FROM);
    // And the folder is never renamed back.
    expect(deps.renameFolder).toHaveBeenCalledTimes(1);
  });

  it('the final registry write failing is reported as a warning; the verified new path is still opened, the folder is not renamed back', async () => {
    const { deps } = setup({ completeRename: false });

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome).toEqual({ status: 'renamed', path: TO, warnings: ['registry-not-saved'] });
    expect(deps.renameFolder).toHaveBeenCalledTimes(1);
    expect(deps.reopenActive).not.toHaveBeenCalled();
  });

  it('saved state that could not be carried over is reported, and the rename still completes', async () => {
    const { deps } = setup({ migrate: false });

    expect(await renameActiveSpaceFolder(deps, 'Journal')).toEqual({
      status: 'renamed',
      path: TO,
      warnings: ['state-not-migrated'],
    });
    expect(deps.registry.completeRename).toHaveBeenCalled();
  });

  it('an unexpected failure after sealing goes to recovery and still releases the guard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, guard } = setup({
      renameFolder: async () => {
        throw new Error('boom');
      },
    });

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome.status).toBe('recovery');
    expect(deps.recoverFromLost).toHaveBeenCalledWith(FROM);
    expect(deps.registry.abandonRename).not.toHaveBeenCalled();
    expect(guard.active).toBeNull();
  });

  it('a failure closing the sealed Application does not stop the rename: it is already unusable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, application } = setup();
    application.close.mockRejectedValueOnce(new Error('already half closed'));

    expect((await renameActiveSpaceFolder(deps, 'Journal')).status).toBe('renamed');
  });

  it('a second rename cannot start while one is running', async () => {
    const { deps } = setup();
    const first = renameActiveSpaceFolder(deps, 'Journal');
    const second = await renameActiveSpaceFolder(deps, 'Diary');
    await first;

    expect(second).toEqual({ status: 'refused', reason: 'busy' });
    expect(deps.renameFolder).toHaveBeenCalledTimes(1);
  });

  it('refuses a name that is already taken before recording, closing or changing anything', async () => {
    const { deps, application, log, guard } = setup({ taken: (path) => path === TO });

    expect(await renameActiveSpaceFolder(deps, 'Journal')).toEqual({ status: 'refused', reason: 'name-taken' });

    expect(deps.registry.beginRename).not.toHaveBeenCalled();
    expect(application.quiesceForRename).not.toHaveBeenCalled();
    expect(application.close).not.toHaveBeenCalled();
    expect(deps.renameFolder).not.toHaveBeenCalled();
    expect(log).not.toContain('detach');
    expect(guard.active).toBeNull();
  });

  it('leaves a case-only change to the Rust rename: the folder it would "collide" with is the same one', async () => {
    const { deps, log } = setup({ taken: () => true });

    const outcome = await renameActiveSpaceFolder(deps, 'notes');

    expect(log.some((entry) => entry.startsWith('exists'))).toBe(false);
    expect(outcome.status).toBe('renamed');
    expect(deps.renameFolder).toHaveBeenCalledWith(FROM, 'notes');
  });

  it('the early check is advisory only: a name that appears afterwards is still refused by the folder rename, and the original reopened', async () => {
    const { deps } = setup({ renameFolder: async () => ({ error: 'A folder with that name already exists. Choose another name' }) });

    const outcome = await renameActiveSpaceFolder(deps, 'Journal');

    expect(outcome).toMatchObject({ status: 'failed', reopened: true });
    expect(deps.reopenActive).toHaveBeenCalled();
    expect(deps.renameFolder).toHaveBeenCalledTimes(1); // never retried with a suffix
  });
});

describe('describeRenameRefusal', () => {
  const reasons: RenameRefusal[] = [
    'busy', 'invalid-name', 'name-taken', 'unchanged', 'no-space', 'no-identity', 'already-pending',
    'registry-unwritable', 'unsaved', 'unsupported', 'cancelled',
  ];

  it.each(reasons)('has plain copy for %s with no ending period', (reason) => {
    const text = describeRenameRefusal(reason);
    expect(text.length).toBeGreaterThan(0);
    expect(text.endsWith('.')).toBe(false);
  });

  it('reuses the wording the Space folder rename already shows for a bad or taken name', () => {
    expect(describeRenameRefusal('invalid-name')).toBe('Enter a name without slashes or colons');
    expect(describeRenameRefusal('name-taken')).toBe('A folder with that name already exists. Choose another name');
  });
});
