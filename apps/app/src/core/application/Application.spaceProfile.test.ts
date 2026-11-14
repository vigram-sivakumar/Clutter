import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application } from './Application';
import { SpaceProfileStore } from './space/SpaceProfileStore';
import { Vault } from '../vault/models/Vault';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import type { VaultResource } from '../vault/models/VaultResource';
import { flushWorkspaceStateWrites } from '../vault/initialize/workspaceStateFile';

const ROOT = '/space';

async function createApplication(fileSystem = new InMemoryVaultFileSystem(), resources: VaultResource[] = []) {
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), resources);
  const store = await SpaceProfileStore.load(fileSystem, ROOT);
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    { toLoadableUrl: (path) => path },
    // The nine stores between the resolver and the Space profile keep their defaults.
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    store
  );
  Reflect.set(application, 'rootPath', ROOT);
  return { application, fileSystem };
}

describe('Application.applySpaceProfile', () => {
  it('with no change, only gives the Space an identity (once)', async () => {
    const { application } = await createApplication();
    expect(application.spaceProfile).toBeNull();

    const first = await application.applySpaceProfile();
    const second = await application.applySpaceProfile({});

    expect(first.id).toBe(second.id);
    expect(application.spaceProfile).toEqual(first);
  });

  it('sets an emoji avatar, written into the Space’s own .clutter/workspace.json', async () => {
    const { application, fileSystem } = await createApplication();

    const profile = await application.applySpaceProfile({ avatar: { type: 'emoji', emoji: '🌿' } });

    expect(profile.avatar).toEqual({ type: 'emoji', emoji: '🌿' });
    const file = JSON.parse(await fileSystem.readFile(`${ROOT}/.clutter/workspace.json`));
    expect(file.space).toEqual({ version: 1, id: profile.id, avatar: { type: 'emoji', emoji: '🌿' } });
  });

  it('copies an image into the Space and stores a Space-relative reference, not the original path', async () => {
    const { application } = await createApplication();
    const importCover = vi.spyOn(application, 'importCoverAsset').mockResolvedValue('Assets/logo.png');

    const profile = await application.applySpaceProfile({
      avatar: { type: 'image', sourcePath: '/Users/me/Pictures/logo.png' },
    });

    expect(importCover).toHaveBeenCalledWith('/Users/me/Pictures/logo.png');
    expect(profile.avatar).toEqual({ type: 'image', src: 'Assets/logo.png' });
  });

  it('removes the avatar on null and leaves it alone on undefined', async () => {
    const { application } = await createApplication();
    await application.applySpaceProfile({ avatar: { type: 'emoji', emoji: '🌿' } });

    expect((await application.applySpaceProfile({})).avatar).toEqual({ type: 'emoji', emoji: '🌿' });
    expect((await application.applySpaceProfile({ avatar: null })).avatar).toBeUndefined();
  });

  it('does not copy anything when an image cannot be imported, and keeps the previous avatar', async () => {
    const { application } = await createApplication();
    await application.applySpaceProfile({ avatar: { type: 'emoji', emoji: '🌿' } });
    vi.spyOn(application, 'importCoverAsset').mockRejectedValue(new Error('copy failed'));

    await expect(
      application.applySpaceProfile({ avatar: { type: 'image', sourcePath: '/x.png' } })
    ).rejects.toThrow('copy failed');

    expect(application.spaceProfile?.avatar).toEqual({ type: 'emoji', emoji: '🌿' });
  });
});

describe('archiving the Space avatar asset', () => {
  async function setup() {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    await fileSystem.createDirectory(`${ROOT}/Other`);
    const resources: VaultResource[] = [
      { id: 'avatar', kind: 'image', name: 'Floral Pattern Photo.jpg', path: `${ROOT}/Assets/Floral Pattern Photo.jpg`, parentId: null },
      { id: 'other', kind: 'image', name: 'Floral Pattern Photo.jpg', path: `${ROOT}/Other/Floral Pattern Photo.jpg`, parentId: null },
    ];
    resources.forEach((resource) => fileSystem.seedFile(resource.path, 'image bytes'));
    const result = await createApplication(fileSystem, resources);
    result.application.attachVault(result.application.vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
    await result.application.spaceProfileStore.setAvatar({ type: 'image', src: 'Assets/Floral Pattern Photo.jpg' });
    return result;
  }

  it('clears the matching assignment durably, keeps the image in Archive, and does not reassign it on restore', async () => {
    const { application, fileSystem } = await setup();
    const id = application.spaceProfile!.id;
    await application.resourceOperations.archiveResource('avatar');
    await flushWorkspaceStateWrites();
    expect(application.spaceProfile?.avatar).toBeUndefined();
    expect(application.spaceProfile?.id).toBe(id);
    const archived = application.vault.getResource('avatar')!;
    expect(application.vault.isResourceEffectivelyArchived(archived)).toBe(true);
    expect(await fileSystem.readFile(archived.path)).toBe('image bytes');
    expect((await SpaceProfileStore.load(fileSystem, ROOT)).profile?.avatar).toBeUndefined();
    await application.resourceOperations.restoreResource('avatar');
    expect(application.spaceProfile?.avatar).toBeUndefined();
  });

  it('does not clear an avatar when a same-named asset in another folder is archived', async () => {
    const { application } = await setup();
    await application.resourceOperations.archiveResource('other');
    expect(application.spaceProfile?.avatar).toEqual({ type: 'image', src: 'Assets/Floral Pattern Photo.jpg' });
  });

  it('keeps the assignment when the archive move fails', async () => {
    const { application, fileSystem } = await setup();
    vi.spyOn(fileSystem, 'moveFile').mockRejectedValueOnce(new Error('move failed'));
    await expect(application.resourceOperations.archiveResource('avatar')).rejects.toThrow('move failed');
    expect(application.spaceProfile?.avatar).toEqual({ type: 'image', src: 'Assets/Floral Pattern Photo.jpg' });
    expect((await SpaceProfileStore.load(fileSystem, ROOT)).profile?.avatar).toEqual(application.spaceProfile?.avatar);
  });

  it('leaves emoji avatars alone', async () => {
    const { application } = await setup();
    await application.applySpaceProfile({ avatar: { type: 'emoji', emoji: '🌿' } });
    await application.resourceOperations.archiveResource('avatar');
    expect(application.spaceProfile?.avatar).toEqual({ type: 'emoji', emoji: '🌿' });
  });
});
