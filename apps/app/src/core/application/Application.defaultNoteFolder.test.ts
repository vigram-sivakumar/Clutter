import { describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { SpaceProfileStore } from './space/SpaceProfileStore';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import type { Folder } from '../vault/models/Folder';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;
const metadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};
const folder = (id: string, name: string, parent: Folder | null = null): Folder => ({
  id,
  name,
  path: `${parent?.path ?? ROOT}/${name}`,
  parentId: parent?.id ?? null,
  metadata,
});

const projects = folder('projects', 'Projects');
const alpha = folder('alpha', 'Alpha', projects);
const archive = folder('archive', 'Archive');

async function setup(saved?: string, fileSystem = new InMemoryVaultFileSystem()) {
  if (saved !== undefined) {
    const store = await SpaceProfileStore.load(fileSystem, ROOT);
    await store.setDefaultNoteFolder(saved);
  }
  const vault = new Vault(
    ROOT,
    [],
    [projects, alpha, archive, folder('inbox', 'Inbox'), folder('templates', 'Templates')],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    { toLoadableUrl: (path: string) => path },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    await SpaceProfileStore.load(fileSystem, ROOT)
  );
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { application, vault, fileSystem };
}

const savedInFile = async (fileSystem: InMemoryVaultFileSystem) =>
  JSON.parse(await fileSystem.readFile(FILE)).space?.defaultNoteFolderId;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Application.resolveDefaultNoteFolderId', () => {
  it('is Inbox (undefined) when nothing is saved', async () => {
    const { application } = await setup();
    expect(application.resolveDefaultNoteFolderId()).toBeUndefined();
  });

  it('is the saved folder while it is a valid destination, nested ones included', async () => {
    expect((await setup('projects')).application.resolveDefaultNoteFolderId()).toBe('projects');
    expect((await setup('alpha')).application.resolveDefaultNoteFolderId()).toBe('alpha');
  });

  it.each(['inbox', 'templates', 'archive', 'missing'])(
    'falls back to Inbox for %s, and puts the saved value back to Inbox',
    async (saved) => {
      const { application, fileSystem } = await setup(saved);

      expect(application.resolveDefaultNoteFolderId()).toBeUndefined();
      await flush();

      expect(application.spaceProfile?.defaultNoteFolderId).toBeUndefined();
      expect(await savedInFile(fileSystem)).toBeUndefined();
    }
  );

  it('keeps following the folder when it is renamed or moved to another valid place', async () => {
    const { application, vault } = await setup('alpha');

    vault.moveFolder('alpha', `${ROOT}/Projects/Beta`, 'projects');
    expect(application.resolveDefaultNoteFolderId()).toBe('alpha');

    vault.moveFolder('alpha', `${ROOT}/Alpha`, null);
    expect(application.resolveDefaultNoteFolderId()).toBe('alpha');
    expect(application.spaceProfile?.defaultNoteFolderId).toBe('alpha');
  });

  it('goes back to Inbox as soon as the folder is deleted, without anyone asking', async () => {
    const { application, vault, fileSystem } = await setup('alpha');

    vault.removeFolder('alpha');
    await flush();

    expect(application.spaceProfile?.defaultNoteFolderId).toBeUndefined();
    expect(await savedInFile(fileSystem)).toBeUndefined();
  });

  it('goes back to Inbox when the folder is moved into Archive', async () => {
    const { application, vault } = await setup('alpha');

    vault.moveFolder('alpha', `${ROOT}/Archive/Alpha`, 'archive');
    await flush();

    expect(application.spaceProfile?.defaultNoteFolderId).toBeUndefined();
  });

  it('is independent per Space: each Application reads its own Space profile', async () => {
    const one = await setup('projects');
    const two = await setup('alpha');
    const three = await setup();

    expect(one.application.resolveDefaultNoteFolderId()).toBe('projects');
    expect(two.application.resolveDefaultNoteFolderId()).toBe('alpha');
    expect(three.application.resolveDefaultNoteFolderId()).toBeUndefined();
  });
});
