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

const ROOT = '/space';

async function createApplication(fileSystem = new InMemoryVaultFileSystem()) {
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
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
