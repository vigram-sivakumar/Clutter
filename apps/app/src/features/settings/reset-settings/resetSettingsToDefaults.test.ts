// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import { SpaceProfileStore } from '@core/application/space/SpaceProfileStore';
import { PreferredTemplatesStore } from '@core/application/templates/PreferredTemplatesStore';
import { flushWorkspaceStateWrites } from '@core/vault/initialize/workspaceStateFile';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { migrateLegacyAppSettings } from '@app/hooks/useSpaceSettingsMigration';
import { LEGACY_COVER_POSITION_KEY } from '@shared/helpers/legacyAppSettings';
import { readDateFormatChoice, writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { readStartupBehavior, writeStartupBehavior } from '../startup-setting/startupPreference';
import { resetSettingsToDefaults } from './resetSettingsToDefaults';

const FILE = '.clutter/workspace.json';
const AVATAR = { type: 'emoji', emoji: '🌊' };

/** One Space's file: settings chosen, preferred templates set, and view/layout state alongside. */
const spaceFile = (id: string) =>
  JSON.stringify({
    space: {
      version: 1,
      id,
      avatar: AVATAR,
      defaultNoteFolderId: 'folder-x',
      defaultCoverPosition: 'above',
      autoDeleteArchived: true,
      autoDeleteUnusedTags: true,
      allowMovingAssetsToFolders: true,
    },
    preferredTemplates: ['t-a'],
    preferredNoteTemplates: ['t-b'],
    defaultDailyNoteTemplate: 't-a',
    collectionViewConfig: { 'view:notes': { layout: 'card' } },
    workspaceSession: { version: 1 },
  });

const NOTE = '# A note\n\nUser content that a settings reset must never touch';

function makeSpace(root: string, id: string) {
  return new InMemoryVaultFileSystem({ [`${root}/${FILE}`]: spaceFile(id), [`${root}/Note.md`]: NOTE });
}

const read = async (fileSystem: InMemoryVaultFileSystem, root: string) => JSON.parse(await fileSystem.readFile(`${root}/${FILE}`));

/** The open Space's Application, reduced to what a settings reset uses; its stores are the real ones. */
async function openSpace(root: string, fileSystem: InMemoryVaultFileSystem) {
  const spaceProfileStore = await SpaceProfileStore.load(fileSystem, root);
  const preferredTemplatesStore = await PreferredTemplatesStore.load(fileSystem, root);
  const application = {
    spaceProfileStore,
    preferredTemplatesStore,
    get spaceProfile() {
      return spaceProfileStore.profile;
    },
    resetSpaceSettings: async () => {
      await spaceProfileStore.resetSettings();
      await preferredTemplatesStore.reset();
    },
  } as unknown as Application;
  return { application, spaceProfileStore, preferredTemplatesStore };
}

beforeEach(() => {
  localStorage.clear();
  // The theme reset applies the system theme; jsdom has no matchMedia, which every real webview does.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => localStorage.clear());

describe('resetSettingsToDefaults — every Space', () => {
  it('resets the open Space, every other registered Space and the app-wide preferences', async () => {
    const open = makeSpace('/open', 'open');
    const second = makeSpace('/second', 'second');
    const third = makeSpace('/third', 'third');
    const { application, spaceProfileStore, preferredTemplatesStore } = await openSpace('/open', open);
    writeStartupBehavior('last-opened-note');
    writeDateFormatChoice('ymd');

    const outcome = await resetSettingsToDefaults({
      application,
      activePath: '/open',
      inactiveSpacePaths: ['/second', '/third'],
      fileSystemFor: (path) => ({ '/second': second, '/third': third })[path]!,
    });
    await flushWorkspaceStateWrites();

    expect(outcome).toEqual({ failedSpaces: [] });
    // The open Space, through its stores.
    expect(spaceProfileStore.profile).toEqual({ id: 'open', avatar: AVATAR });
    expect(preferredTemplatesStore.getIds('notes')).toEqual([]);
    // Every other Space, in its file.
    for (const [root, fileSystem, id] of [['/open', open, 'open'], ['/second', second, 'second'], ['/third', third, 'third']] as const) {
      const file = await read(fileSystem, root);
      expect(file.space, root).toEqual({ version: 1, id, avatar: AVATAR });
      expect(file, root).not.toHaveProperty('preferredTemplates');
      expect(file, root).not.toHaveProperty('preferredNoteTemplates');
      expect(file, root).not.toHaveProperty('defaultDailyNoteTemplate');
    }
    // The app-wide preferences.
    expect(readStartupBehavior()).toBe('todays-note');
    expect(readDateFormatChoice()).toBe('relative');
  });

  it('never touches view or layout state, in any Space', async () => {
    const open = makeSpace('/open', 'open');
    const other = makeSpace('/other', 'other');
    const { application } = await openSpace('/open', open);

    await resetSettingsToDefaults({ application, activePath: '/open', inactiveSpacePaths: ['/other'], fileSystemFor: () => other });
    await flushWorkspaceStateWrites();

    for (const [root, fileSystem] of [['/open', open], ['/other', other]] as const) {
      const file = await read(fileSystem, root);
      expect(file.collectionViewConfig, root).toEqual({ 'view:notes': { layout: 'card' } });
      expect(file.workspaceSession, root).toEqual({ version: 1 });
    }
  });

  it("never touches a Space's content, and creates no file", async () => {
    const open = makeSpace('/open', 'open');
    const other = makeSpace('/other', 'other');
    const { application } = await openSpace('/open', open);

    await resetSettingsToDefaults({ application, activePath: '/open', inactiveSpacePaths: ['/other'], fileSystemFor: () => other });
    await flushWorkspaceStateWrites();

    expect(await open.readFile('/open/Note.md')).toBe(NOTE);
    expect(await other.readFile('/other/Note.md')).toBe(NOTE);
    expect(await other.exists('/other/.clutter/anything-else')).toBe(false);
  });

  it('writes nothing in a Space that has nothing to reset, or whose folder is missing', async () => {
    const open = makeSpace('/open', 'open');
    const clean = new InMemoryVaultFileSystem({ '/clean/.clutter/workspace.json': JSON.stringify({ space: { version: 1, id: 'clean' } }) });
    const missing = new InMemoryVaultFileSystem();
    const writes = [vi.spyOn(clean, 'writeFile'), vi.spyOn(missing, 'writeFile')];
    const { application } = await openSpace('/open', open);

    const outcome = await resetSettingsToDefaults({
      application,
      activePath: '/open',
      inactiveSpacePaths: ['/clean', '/missing'],
      fileSystemFor: (path) => (path === '/clean' ? clean : missing),
    });

    expect(outcome.failedSpaces).toEqual([]);
    expect(writes[0]).not.toHaveBeenCalled();
    expect(writes[1]).not.toHaveBeenCalled();
    expect(await missing.exists('/missing/.clutter')).toBe(false);
  });

  it('persists: reopening any Space afterwards finds its settings at their defaults', async () => {
    const open = makeSpace('/open', 'open');
    const other = makeSpace('/other', 'other');
    const { application } = await openSpace('/open', open);
    await resetSettingsToDefaults({ application, activePath: '/open', inactiveSpacePaths: ['/other'], fileSystemFor: () => other });
    await flushWorkspaceStateWrites();

    for (const [root, fileSystem] of [['/open', open], ['/other', other]] as const) {
      const reopened = await SpaceProfileStore.load(fileSystem, root);
      expect(reopened.profile, root).toEqual({ id: root.slice(1), avatar: AVATAR });
      expect((await PreferredTemplatesStore.load(fileSystem, root)).getIds('notes'), root).toEqual([]);
    }
  });

  it('is not undone by the legacy cover-position migration the next time a Space opens', async () => {
    const open = makeSpace('/open', 'open');
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    const { application, spaceProfileStore } = await openSpace('/open', open);

    await resetSettingsToDefaults({ application, activePath: '/open', inactiveSpacePaths: [], fileSystemFor: () => open });
    await flushWorkspaceStateWrites();
    // The Space opens again: the migration runs on every open.
    migrateLegacyAppSettings(application);
    await flushWorkspaceStateWrites();

    expect(spaceProfileStore.profile?.defaultCoverPosition).toBeUndefined();
  });
});

describe('resetSettingsToDefaults — when something cannot be reset', () => {
  it('still resets everything else, and names the Spaces it could not reach', async () => {
    const open = makeSpace('/open', 'open');
    const broken = makeSpace('/broken', 'broken');
    const fine = makeSpace('/fine', 'fine');
    vi.spyOn(broken, 'readFile').mockRejectedValue(new Error('permission denied'));
    const { application } = await openSpace('/open', open);
    writeStartupBehavior('last-opened-note');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const outcome = await resetSettingsToDefaults({
      application,
      activePath: '/open',
      inactiveSpacePaths: ['/broken', '/fine'],
      fileSystemFor: (path) => (path === '/broken' ? broken : fine),
    });
    await flushWorkspaceStateWrites();

    expect(outcome).toEqual({ failedSpaces: ['/broken'] });
    expect((await read(fine, '/fine')).space).toEqual({ version: 1, id: 'fine', avatar: AVATAR });
    expect(readStartupBehavior()).toBe('todays-note');
  });

  it('names the open Space when it could not be reset, and still resets the rest', async () => {
    const other = makeSpace('/other', 'other');
    const application = {
      resetSpaceSettings: vi.fn().mockRejectedValue(new Error('disk full')),
    } as unknown as Application;
    writeDateFormatChoice('ymd');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const outcome = await resetSettingsToDefaults({
      application,
      activePath: '/open',
      inactiveSpacePaths: ['/other'],
      fileSystemFor: () => other,
    });
    await flushWorkspaceStateWrites();

    expect(outcome).toEqual({ failedSpaces: ['/open'] });
    expect((await read(other, '/other')).space).toEqual({ version: 1, id: 'other', avatar: AVATAR });
    expect(readDateFormatChoice()).toBe('relative');
  });
});
