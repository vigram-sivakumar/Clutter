import { describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { VaultBuilder, VaultScanner } from '../vault/ingest';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { createWikiLinkResolver } from '../../app/layouts/page/resolveWikiLink';
import { createPageEmbedResolver } from '../../app/layouts/page/resolvePageEmbed';
import { resolveResourceEmbed } from '../../app/layouts/page/resolveResourceEmbed';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

/**
 * References to archived items, through the real Application: the real archive, restore and delete operations, the
 * real Vault and files, and the resolver a click goes through. "Restarting" scans the same files again into a fresh
 * Application, the way bootstrap does.
 */

const ROOT = '/vault';
const FILES: Record<string, string> = {
  [`${ROOT}/Docs/Note.md`]: '---\nid: note1\n---\n# Note\n\nBody.\n',
  [`${ROOT}/Docs/Other.md`]: '---\nid: other1\n---\n# Other\n',
  [`${ROOT}/Box/.folder.md`]: '---\nid: box\n---\n',
  [`${ROOT}/Box/Inner/.folder.md`]: '---\nid: inner\n---\n',
  [`${ROOT}/Box/Inner/Deep.md`]: '---\nid: deep\n---\n# Deep\n',
  [`${ROOT}/Assets/hero.png`]: 'png-bytes',
  [`${ROOT}/Assets/keep.png`]: 'png-bytes-2',
};

async function makeFileSystem(): Promise<InMemoryVaultFileSystem> {
  const fileSystem = new InMemoryVaultFileSystem(FILES);
  await fileSystem.createDirectory(ROOT);
  for (const directory of new Set(Object.keys(FILES).map((path) => path.slice(0, path.lastIndexOf('/'))))) {
    await fileSystem.createDirectory(directory);
  }
  return fileSystem;
}

/** What bootstrap does with the same files: scan, build, construct, attach, load the archive records. */
async function start(fileSystem: InMemoryVaultFileSystem) {
  const { vault } = new VaultBuilder(new UuidGenerator()).build(await new VaultScanner(fileSystem).scan(ROOT));
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  await application.loadArchivedResourceOrigins();

  const openResource = vi.fn();
  const resolver = createWikiLinkResolver(vault, application.pageOperations, application.folderOperations, undefined, {
    openFolder: (folderId) => void application.folderOperations.open(folderId),
    openResource,
  });
  const counts = () => ({ pages: [...vault.pages()].length, folders: [...vault.folders()].length, resources: [...vault.resources()].length });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const click = async (link: string) => {
    const resolution = resolver(link, null);
    resolution.activate();
    await flush();
    return resolution;
  };

  return { application, vault, fileSystem, resolver, openResource, counts, click };
}

describe('a reference to an archived note, through the real Application', () => {
  it('opens the archived note, creates nothing, does not restore it, and works after a restart', async () => {
    const fileSystem = await makeFileSystem();
    const first = await start(fileSystem);
    const resolution = first.resolver('Docs/Note', null);
    expect(resolution).toMatchObject({ status: 'resolved', pageId: 'note1' });

    await first.application.pageOperations.archive('note1');

    // Right after the archive completed: the same reference now names the archived note.
    const before = first.counts();
    expect(await first.click('Docs/Note')).toMatchObject({ status: 'resolved', pageId: 'note1' });
    expect(first.application.workspace.activePageId).toBe('note1');
    expect(first.counts()).toEqual(before);
    const archived = first.vault.getPage('note1')!;
    expect(first.vault.isPageEffectivelyArchived(archived)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Docs/Note.md`)).toBe(false);
    expect(await fileSystem.exists(archived.path)).toBe(true);

    // After a restart: the original location is read back from the note's own file.
    const second = await start(fileSystem);
    const afterRestart = second.counts();
    expect(await second.click('Docs/Note')).toMatchObject({ status: 'resolved', pageId: 'note1' });
    expect(second.application.workspace.activePageId).toBe('note1');
    expect(second.counts()).toEqual(afterRestart);
    expect(second.vault.isPageEffectivelyArchived(second.vault.getPage('note1')!)).toBe(true);

    // An embed of it shows the archived note.
    const embed = createPageEmbedResolver(second.vault, second.application.effectivePageState)('Docs/Note');
    expect(embed).toMatchObject({ status: 'resolved', pageId: 'note1' });
  });

  it('an explicit restore makes it resolve to the active note again; a permanent delete leaves it unresolved', async () => {
    const fileSystem = await makeFileSystem();
    const app = await start(fileSystem);

    await app.application.pageOperations.archive('note1');
    await app.application.pageOperations.restore('note1');
    expect(app.vault.isPageEffectivelyArchived(app.vault.getPage('note1')!)).toBe(false);
    expect(app.vault.getPage('note1')!.path).toBe(`${ROOT}/Docs/Note.md`);
    expect(app.resolver('Docs/Note', null)).toMatchObject({ status: 'resolved', pageId: 'note1' });

    await app.application.pageOperations.archive('other1');
    await app.application.pageOperations.delete('other1');
    expect(app.resolver('Docs/Other', null).status).toBe('unresolved');
    const restarted = await start(fileSystem);
    expect(restarted.resolver('Docs/Other', null).status).toBe('unresolved');
    expect(restarted.resolver('Docs/Never', null).status).toBe('unresolved');
  });

  it('two archived notes from the same original path make the reference ambiguous: nothing opens or is created', async () => {
    const fileSystem = await makeFileSystem();
    const app = await start(fileSystem);
    await app.application.pageOperations.archive('note1');
    // A second archived note with the same original path (as left by a note archived, re-created and archived again).
    const twin = '---\nid: twin\n---\n# Note\n';
    await fileSystem.writeFile(`${ROOT}/Docs/Note.md`, twin);
    const rescanned = await start(fileSystem);
    await rescanned.application.pageOperations.archive('twin');

    const resolution = rescanned.resolver('Docs/Note', null);
    expect(resolution.status).toBe('ambiguous');
    const before = rescanned.counts();
    const activeBefore = rescanned.application.workspace.activePageId;
    resolution.activate();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rescanned.application.workspace.activePageId).toBe(activeBefore);
    expect(rescanned.counts()).toEqual(before);
  });
});

describe('a reference to an archived folder, through the real Application', () => {
  it('opens the archived folder in place, keeps it archived, creates nothing, and works after a restart', async () => {
    const fileSystem = await makeFileSystem();
    const first = await start(fileSystem);
    await first.application.folderOperations.archive('box');

    const before = first.counts();
    expect(await first.click('Box/')).toMatchObject({ status: 'resolved', targetKind: 'folder', targetId: 'box' });
    expect(first.application.workspace.activeFolderId).toBe('box');
    expect(first.counts()).toEqual(before);
    const folder = first.vault.getFolder('box')!;
    expect(first.vault.isFolderEffectivelyArchived('box')).toBe(true);
    expect(folder.path).toBe(`${ROOT}/Archive/Box`);
    expect(await fileSystem.exists(`${ROOT}/Box`)).toBe(false);

    // What was inside it resolves through the folder's original location.
    expect(first.resolver('Box/Inner/Deep', null)).toMatchObject({ status: 'resolved', pageId: 'deep' });
    expect(first.resolver('Box/Inner/', null)).toMatchObject({ status: 'resolved', targetId: 'inner' });

    const second = await start(fileSystem);
    const afterRestart = second.counts();
    expect(await second.click('Box/')).toMatchObject({ status: 'resolved', targetId: 'box' });
    expect(second.application.workspace.activeFolderId).toBe('box');
    expect(second.counts()).toEqual(afterRestart);
    expect(second.vault.isFolderEffectivelyArchived('box')).toBe(true);
    expect(second.resolver('Box/Inner/Deep', null)).toMatchObject({ pageId: 'deep' });
  });

  it('after an explicit restore it resolves to the active folder; once permanently deleted it is unresolved', async () => {
    const fileSystem = await makeFileSystem();
    const app = await start(fileSystem);

    await app.application.folderOperations.archive('box');
    await app.application.folderOperations.restore('box');
    expect(app.vault.getFolder('box')!.path).toBe(`${ROOT}/Box`);
    expect(app.resolver('Box/', null)).toMatchObject({ status: 'resolved', targetId: 'box' });

    await app.application.folderOperations.archive('box');
    await app.application.folderOperations.delete('box');
    expect(app.resolver('Box/', null).status).toBe('unresolved');
    expect(app.resolver('Box/Inner/Deep', null).status).toBe('unresolved');
    expect((await start(fileSystem)).resolver('Box/', null).status).toBe('unresolved');
  });
});

describe('a reference to an archived asset, through the real Application', () => {
  const heroId = (vault: Awaited<ReturnType<typeof start>>['vault']) =>
    [...vault.resources()].find((resource) => resource.name === 'hero.png')!.id;

  it('resolves the moment the archive completes, opens the preview without actions, restores nothing, and works after a restart', async () => {
    const fileSystem = await makeFileSystem();
    const first = await start(fileSystem);
    expect(resolveResourceEmbed(first.vault, 'Assets/hero.png')?.path).toBe(`${ROOT}/Assets/hero.png`);

    await first.application.resourceOperations.archiveResource(heroId(first.vault));

    // No reload to wait for: the very next lookup already sees the archived file.
    const archived = resolveResourceEmbed(first.vault, 'Assets/hero.png');
    expect(archived).toBeDefined();
    expect(first.vault.isResourceEffectivelyArchived(archived!)).toBe(true);
    const before = first.counts();
    expect(await first.click('Assets/hero.png')).toMatchObject({ status: 'resolved', targetId: archived!.id });
    expect(first.openResource).toHaveBeenCalledWith(archived, { archived: true });
    expect(first.counts()).toEqual(before);
    expect(await fileSystem.exists(archived!.path)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Assets/hero.png`)).toBe(false);
    // Another asset is untouched, and a lookalike name resolves to nothing.
    expect(resolveResourceEmbed(first.vault, 'Assets/keep.png')?.path).toBe(`${ROOT}/Assets/keep.png`);
    expect(resolveResourceEmbed(first.vault, 'hero.png')).toBeUndefined();

    const second = await start(fileSystem);
    const resolved = resolveResourceEmbed(second.vault, 'Assets/hero.png');
    expect(resolved).toBeDefined();
    expect(second.vault.isResourceEffectivelyArchived(resolved!)).toBe(true);
    expect(await second.click('Assets/hero.png')).toMatchObject({ status: 'resolved' });
    expect(second.openResource).toHaveBeenCalledWith(resolved, { archived: true });
  });

  it('restoring resolves to the active file at once; deleting leaves it unresolved at once, and after a restart', async () => {
    const fileSystem = await makeFileSystem();
    const app = await start(fileSystem);
    const id = heroId(app.vault);

    await app.application.resourceOperations.archiveResource(id);
    await app.application.resourceOperations.restoreResource(id);
    const restored = resolveResourceEmbed(app.vault, 'Assets/hero.png');
    expect(restored?.path).toBe(`${ROOT}/Assets/hero.png`);
    expect(app.vault.isResourceEffectivelyArchived(restored!)).toBe(false);

    await app.application.resourceOperations.archiveResource(id);
    await app.application.resourceOperations.deleteResource(id);
    expect(resolveResourceEmbed(app.vault, 'Assets/hero.png')).toBeUndefined();
    expect(app.resolver('Assets/hero.png', null).status).toBe('unresolved');
    expect(resolveResourceEmbed((await start(fileSystem)).vault, 'Assets/hero.png')).toBeUndefined();
  });

  it('a stale or missing archive record leaves the reference unresolved', async () => {
    const fileSystem = await makeFileSystem();
    const first = await start(fileSystem);
    await first.application.resourceOperations.archiveResource(heroId(first.vault));
    // The records are lost (a file dropped in Archive/ from outside has none either).
    await fileSystem.writeFile(`${ROOT}/.clutter/resource-archive.json`, JSON.stringify({ resources: {} }));

    const second = await start(fileSystem);

    expect(resolveResourceEmbed(second.vault, 'Assets/hero.png')).toBeUndefined();
    expect(second.resolver('Assets/hero.png', null).status).toBe('unresolved');
  });
});
