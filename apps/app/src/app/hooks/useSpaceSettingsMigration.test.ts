// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import { SpaceProfileStore } from '@core/application/space/SpaceProfileStore';
import { flushWorkspaceStateWrites } from '@core/vault/initialize/workspaceStateFile';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { LEGACY_AUTO_DELETE_ARCHIVED_KEY, LEGACY_COVER_POSITION_KEY } from '@shared/helpers/legacyAppSettings';
import { migrateLegacyAppSettings } from './useSpaceSettingsMigration';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;

/** The part of an Application the migration uses, over a real Space profile store. */
async function openSpace(contents?: unknown) {
  const fileSystem = new InMemoryVaultFileSystem(contents === undefined ? {} : { [FILE]: JSON.stringify(contents) });
  const store = await SpaceProfileStore.load(fileSystem, ROOT);
  const application = {
    spaceProfileStore: store,
    get spaceProfile() {
      return store.profile;
    },
  } as unknown as Application;

  return { application, store, fileSystem };
}
const reopen = (fileSystem: InMemoryVaultFileSystem) => SpaceProfileStore.load(fileSystem, ROOT);

beforeEach(() => localStorage.clear());

describe('migrating the old app-wide cover position into a Space', () => {
  it('seeds a Space that never chose from the old value, so a user who had Top still has Top', async () => {
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    const { application, fileSystem } = await openSpace();

    migrateLegacyAppSettings(application);
    await flushWorkspaceStateWrites();

    expect(application.spaceProfile?.defaultCoverPosition).toBe('above');
    expect((await reopen(fileSystem)).profile?.defaultCoverPosition).toBe('above');
  });

  it('seeds every existing Space on its own first open, one at a time', async () => {
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    const one = await openSpace();
    const two = await openSpace({ space: { version: 1, id: 'two' } });

    migrateLegacyAppSettings(one.application);
    // The old key is still there for the Space that has not been opened yet.
    expect(localStorage.getItem(LEGACY_COVER_POSITION_KEY)).toBe('above');
    migrateLegacyAppSettings(two.application);

    expect(one.application.spaceProfile?.defaultCoverPosition).toBe('above');
    expect(two.application.spaceProfile?.defaultCoverPosition).toBe('above');
  });

  it("never overwrites a value the Space already has — not Top, and not a chosen Right", async () => {
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    const chosenRight = await openSpace({ space: { version: 1, id: 's', defaultCoverPosition: 'side' } });
    const chosenTop = await openSpace({ space: { version: 1, id: 's', defaultCoverPosition: 'above' } });

    migrateLegacyAppSettings(chosenRight.application);
    migrateLegacyAppSettings(chosenTop.application);

    expect(chosenRight.application.spaceProfile?.defaultCoverPosition).toBe('side');
    expect(chosenTop.application.spaceProfile?.defaultCoverPosition).toBe('above');
  });

  it('does nothing when there was no old value (the old default, Right, was never stored): the Space is left unset', async () => {
    const { application, fileSystem } = await openSpace();

    migrateLegacyAppSettings(application);

    expect(application.spaceProfile).toBeNull();
    await expect(fileSystem.readFile(FILE)).rejects.toThrow();
  });

  it('ignores an old value that is not Top', async () => {
    for (const junk of ['side', '', 'Top', 'null']) {
      localStorage.setItem(LEGACY_COVER_POSITION_KEY, junk);
      const { application } = await openSpace();

      migrateLegacyAppSettings(application);

      expect(application.spaceProfile).toBeNull();
    }
  });

  it('is idempotent: running it again after the Space chose changes nothing', async () => {
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    const { application, store } = await openSpace();
    migrateLegacyAppSettings(application);
    await store.setDefaultCoverPosition('side'); // the user then chooses Right in this Space

    migrateLegacyAppSettings(application);

    expect(application.spaceProfile?.defaultCoverPosition).toBe('side');
  });

  it('keeps the old key: it cannot be removed while another Space might still need seeding from it', async () => {
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    const { application } = await openSpace();

    migrateLegacyAppSettings(application);

    expect(localStorage.getItem(LEGACY_COVER_POSITION_KEY)).toBe('above');
  });
});

describe('migrating the old app-wide "Automatically delete archived items"', () => {
  it('never turns it on in a Space, whatever the old value was', async () => {
    localStorage.setItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY, 'true');
    const fresh = await openSpace();
    const existing = await openSpace({ space: { version: 1, id: 's' } });

    migrateLegacyAppSettings(fresh.application);
    migrateLegacyAppSettings(existing.application);

    expect(fresh.application.spaceProfile?.autoDeleteArchived).toBeUndefined();
    expect(existing.application.spaceProfile?.autoDeleteArchived).toBeUndefined();
    expect((await reopen(fresh.fileSystem)).profile?.autoDeleteArchived).toBeUndefined();
  });

  it('discards the old value, deliberately not migrated, so it cannot be read back as a setting', async () => {
    localStorage.setItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY, 'true');
    const { application } = await openSpace();

    migrateLegacyAppSettings(application);

    expect(localStorage.getItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY)).toBeNull();
  });

  it('leaves a Space that had it on untouched: it stays on', async () => {
    localStorage.setItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY, 'false');
    const { application } = await openSpace({ space: { version: 1, id: 's', autoDeleteArchived: true } });

    migrateLegacyAppSettings(application);

    expect(application.spaceProfile?.autoDeleteArchived).toBe(true);
  });
});

describe('migration failure handling', () => {
  it('does not throw when the old storage is unreadable', async () => {
    const { application } = await openSpace();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => migrateLegacyAppSettings(application)).not.toThrow();

    getItem.mockRestore();
    removeItem.mockRestore();
  });
});
