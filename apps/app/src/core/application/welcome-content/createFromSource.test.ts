import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomicWriteFileSystem } from '../../vault/atomicWrite/AtomicWriteFileSystem';
import { InMemoryAtomicVaultWriter } from '../../vault/testing/InMemoryAtomicVaultWriter';
import type { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { mintShippedFolderSource, mintShippedPageSource } from './ShippedSource';
import { makeWelcomeRig, SPACE_ROOT, type WelcomeRig } from './welcomeContentTestRig';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

/** The production write stack over the in-memory writer, which enforces create-only intent like the native one. */
const atomicStack = (disk: InMemoryVaultFileSystem) => {
  const writer = new InMemoryAtomicVaultWriter(disk);

  return { fileSystem: new AtomicWriteFileSystem(disk, writer), writer };
};
const makeRig = () => makeWelcomeRig(atomicStack);

// ADR-067: PageOperations.createFromSource and FolderOperations.createFromSource, against the real Gate, Vault and
// the production write stack. The three guards are checked under the actual queue and mutation model, including the
// case where the world changes between the check and the queued write.

const NOTE = (id: string, body = 'shipped body') => `---\nid: ${id}\nicon: 👋\nfavorite: false\nstatus: active\n---\n${body}\n`;
const FOLDER = (id: string) => `---\nid: ${id}\nicon: 👋\nstatus: active\n---\n`;

afterEach(() => vi.restoreAllMocks());

async function withFolder(rig: WelcomeRig, name = 'Welcome', id = 'folder-1'): Promise<string> {
  const path = `${SPACE_ROOT}/${name}`;
  await rig.fileSystem.createDirectory(path, { exclusive: true });
  const outcome = await rig.application.folderOperations.createFromSource(
    mintShippedFolderSource({ path, parentId: null, content: FOLDER(id), id })
  );
  expect(outcome).toEqual({ status: 'created', id });

  return id;
}

const pageSource = (path: string, id: string, parentId: string | null, content = NOTE(id)) =>
  mintShippedPageSource({ path: `${SPACE_ROOT}/${path}`, parentId, content, id });

describe('PageOperations.createFromSource', () => {
  it('writes the supplied text unchanged and the page keeps the frontmatter id', async () => {
    const rig = await makeRig();
    const folderId = await withFolder(rig);

    const outcome = await rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-1', folderId));

    expect(outcome).toEqual({ status: 'created', id: 'note-1' });
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Welcome/Hello.md`)).toBe(NOTE('note-1'));
    expect(rig.vault.getPage('note-1')?.path).toBe(`${SPACE_ROOT}/Welcome/Hello.md`);
    expect(rig.vault.getPage('note-1')?.parentId).toBe(folderId);
  });

  it('enqueues exactly once, under a queue slot that is never the page id, and opens no draft or session', async () => {
    const rig = await makeRig();
    const folderId = await withFolder(rig);
    const enqueue = vi.spyOn(PagePersistenceCoordinator.prototype, 'enqueue');
    const activeBefore = rig.application.workspace.activePageId;

    await rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-1', folderId));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]![0]).toBe(`shipped-source:${SPACE_ROOT}/Welcome/Hello.md`);
    expect(enqueue.mock.calls[0]![0]).not.toBe('note-1');
    expect(rig.application.documentRegistry.get('note-1')).toBeUndefined();
    expect(rig.application.workspace.activePageId).toBe(activeBefore);
  });

  it('GUARD 1: an id the Vault already holds is skipped: nothing is written and the page is not saved over', async () => {
    const rig = await makeRig();
    const folderId = await withFolder(rig);
    await rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-1', folderId, NOTE('note-1', 'USER EDITED')));
    const writesBefore = rig.writer.calls.length;

    const again = await rig.application.pageOperations.createFromSource(
      pageSource('Welcome/Elsewhere.md', 'note-1', folderId, NOTE('note-1', 'shipped body'))
    );

    expect(again).toEqual({ status: 'skipped', reason: 'id-exists' });
    expect(rig.writer.calls).toHaveLength(writesBefore);
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Welcome/Hello.md`)).toBe(NOTE('note-1', 'USER EDITED'));
    expect(rig.disk.hasFileSync(`${SPACE_ROOT}/Welcome/Elsewhere.md`)).toBe(false);
  });

  it('GUARD 1 under a stale check: an id that appears in the Vault after the check is still never saved over', async () => {
    const rig = await makeRig();
    const folderId = await withFolder(rig);
    await rig.disk.writeFile(`${SPACE_ROOT}/Welcome/Mine.md`, NOTE('note-1', 'USER CONTENT'));
    const existing = new PageBuilder().build({
      parentId: folderId,
      page: {
        path: `${SPACE_ROOT}/Welcome/Mine.md`,
        directoryPath: `${SPACE_ROOT}/Welcome`,
        frontmatter: { id: 'note-1' },
        frontmatterAnalysis: { aliases: [] },
        content: 'USER CONTENT',
        analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
      },
    });
    // Between the facade's check and the queued write, the id turns up in the Vault.
    const original = PagePersistenceCoordinator.prototype.enqueue;
    vi.spyOn(PagePersistenceCoordinator.prototype, 'enqueue').mockImplementation(function (this: PagePersistenceCoordinator, key, operation) {
      if (operation.kind === 'create' && key.startsWith('shipped-source:')) rig.vault.addPage(existing);

      return original.call(this, key, operation);
    });

    await expect(
      rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-1', folderId, NOTE('note-1', 'shipped body')))
    ).rejects.toThrow();

    // The existing page's file is untouched: the Gate did not turn the create into a save of it.
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Welcome/Mine.md`)).toBe(NOTE('note-1', 'USER CONTENT'));
    expect(rig.vault.getPage('note-1')?.path).toBe(`${SPACE_ROOT}/Welcome/Mine.md`);
    expect(rig.writer.calls.filter((call) => call.includes('Mine.md') && !call.startsWith('write:create:'))).toEqual([]);
  });

  it('GUARD 2: an unresolved parent id is rejected before anything is enqueued or written', async () => {
    const rig = await makeRig();
    await withFolder(rig);
    const enqueue = vi.spyOn(PagePersistenceCoordinator.prototype, 'enqueue');

    for (const parentId of ['no-such-folder', null]) {
      const outcome = await rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-1', parentId));

      expect(outcome).toEqual({ status: 'skipped', reason: 'parent-unknown' });
    }

    expect(enqueue).not.toHaveBeenCalled();
    expect(rig.disk.hasFileSync(`${SPACE_ROOT}/Welcome/Hello.md`)).toBe(false);
    expect(rig.vault.getPage('note-1')).toBeUndefined();
  });

  it('a path the Vault already holds is skipped, and a file on disk the Vault does not know refuses the create-only write', async () => {
    const rig = await makeRig();
    const folderId = await withFolder(rig);
    await rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-1', folderId));

    expect(await rig.application.pageOperations.createFromSource(pageSource('Welcome/Hello.md', 'note-2', folderId))).toEqual({
      status: 'skipped',
      reason: 'path-exists',
    });

    await rig.disk.writeFile(`${SPACE_ROOT}/Welcome/Unknown.md`, 'USER CONTENT');
    await expect(
      rig.application.pageOperations.createFromSource(pageSource('Welcome/Unknown.md', 'note-3', folderId))
    ).rejects.toMatchObject({ name: 'AtomicNotCommittedError', reason: 'destinationExists' });
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Welcome/Unknown.md`)).toBe('USER CONTENT');
    expect(rig.vault.getPage('note-3')).toBeUndefined();
  });
});

describe('FolderOperations.createFromSource', () => {
  it('writes the .folder.md unchanged and the folder keeps its frontmatter id, with parents chained', async () => {
    const rig = await makeRig();
    const parent = await withFolder(rig, 'Outer', 'outer-id');
    await rig.fileSystem.createDirectory(`${SPACE_ROOT}/Outer/Inner`, { exclusive: true });

    const outcome = await rig.application.folderOperations.createFromSource(
      mintShippedFolderSource({ path: `${SPACE_ROOT}/Outer/Inner`, parentId: parent, content: FOLDER('inner-id'), id: 'inner-id' })
    );

    expect(outcome).toEqual({ status: 'created', id: 'inner-id' });
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Outer/.folder.md`)).toBe(FOLDER('outer-id'));
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Outer/Inner/.folder.md`)).toBe(FOLDER('inner-id'));
    expect(rig.vault.getFolder('inner-id')?.parentId).toBe('outer-id');
    expect(rig.vault.getFolder('outer-id')?.parentId).toBeNull();
  });

  it('GUARD 2: an unresolved parent is rejected before anything is enqueued', async () => {
    const rig = await makeRig();
    const enqueue = vi.spyOn(PagePersistenceCoordinator.prototype, 'enqueue');
    await rig.fileSystem.createDirectory(`${SPACE_ROOT}/Orphan`, { exclusive: true });

    const outcome = await rig.application.folderOperations.createFromSource(
      mintShippedFolderSource({ path: `${SPACE_ROOT}/Orphan`, parentId: 'nope', content: FOLDER('orphan'), id: 'orphan' })
    );

    expect(outcome).toEqual({ status: 'skipped', reason: 'parent-unknown' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(rig.disk.hasFileSync(`${SPACE_ROOT}/Orphan/.folder.md`)).toBe(false);
  });

  it('an id the Vault already holds is skipped without a write', async () => {
    const rig = await makeRig();
    await withFolder(rig, 'One', 'same-id');
    await rig.fileSystem.createDirectory(`${SPACE_ROOT}/Two`, { exclusive: true });
    const writesBefore = rig.writer.calls.length;

    const outcome = await rig.application.folderOperations.createFromSource(
      mintShippedFolderSource({ path: `${SPACE_ROOT}/Two`, parentId: null, content: FOLDER('same-id'), id: 'same-id' })
    );

    expect(outcome).toEqual({ status: 'skipped', reason: 'id-exists' });
    expect(rig.writer.calls).toHaveLength(writesBefore);
    expect(rig.disk.hasFileSync(`${SPACE_ROOT}/Two/.folder.md`)).toBe(false);
  });

  it('GUARD 3: an existing directory is never given a marker: the exclusive create that mints a folder source refuses it', async () => {
    const rig = await makeRig();
    await rig.disk.createDirectory(`${SPACE_ROOT}/Mine`);
    await rig.disk.writeFile(`${SPACE_ROOT}/Mine/keep.md`, 'user note');

    // The only way to obtain a folder source is the exclusive directory create that precedes it, and that refuses.
    await expect(rig.fileSystem.createDirectory(`${SPACE_ROOT}/Mine`, { exclusive: true })).rejects.toMatchObject({
      name: 'DestinationExistsError',
    });
    expect(rig.disk.hasFileSync(`${SPACE_ROOT}/Mine/.folder.md`)).toBe(false);
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Mine/keep.md`)).toBe('user note');
  });

  it('an existing .folder.md is refused by the create-only write and left unchanged', async () => {
    const rig = await makeRig();
    await rig.fileSystem.createDirectory(`${SPACE_ROOT}/Taken`, { exclusive: true });
    await rig.disk.writeFile(`${SPACE_ROOT}/Taken/.folder.md`, 'USER FOLDER');

    await expect(
      rig.application.folderOperations.createFromSource(
        mintShippedFolderSource({ path: `${SPACE_ROOT}/Taken`, parentId: null, content: FOLDER('taken'), id: 'taken' })
      )
    ).rejects.toMatchObject({ name: 'AtomicNotCommittedError', reason: 'destinationExists' });
    expect(await rig.disk.readFile(`${SPACE_ROOT}/Taken/.folder.md`)).toBe('USER FOLDER');
    expect(rig.vault.getFolder('taken')).toBeUndefined();
  });
});
