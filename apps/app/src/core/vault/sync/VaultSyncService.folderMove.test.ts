import { describe, expect, it } from 'vitest';

import { PAGE_IDS, ROOT, createFolderWorld, settle, type FolderWorld } from '../testing/TwoInstanceFolderWorld';

/**
 * Cross-instance folder movement (Fix 1 and Fix 2). Another instance moves a folder; this one sees the old path
 * disappear and the new one appear — as one `moved`, or as `deleted`/`created` in either order, or as the mis-paired
 * halves of a rapid double move. The folder, every descendant, their ids and their open DocumentSessions must be
 * relocated in place, never removed and rediscovered, and no note may be rewritten on disk.
 */

function expectRelocatedIntact(world: FolderWorld, base: string) {
  const { vaultB } = world;

  expect(world.folderRemoved).toEqual([]);
  expect(world.pageRemoved).toEqual([]);
  expect(world.missingAt).toEqual([]); // no descendant was ever absent at a notification
  expect(vaultB.getFolder(world.ids.projects)!.path).toBe(`${ROOT}/${base}`);
  expect(vaultB.getFolder(world.ids.sub)!.path).toBe(`${ROOT}/${base}/Sub`);
  expect(vaultB.getPage('p-top')!.path).toBe(`${ROOT}/${base}/N.md`);
  expect(vaultB.getPage('p-sub')!.path).toBe(`${ROOT}/${base}/Sub/M.md`);
  expect([...vaultB.folders()].map((f) => f.id).sort()).toEqual(world.initialIds.folders);
  expect([...vaultB.pages()].map((p) => p.id).sort()).toEqual(world.initialIds.pages);
  for (const id of PAGE_IDS) {
    expect(world.documentRegistry.get(id)).toBe(world.sessions[id]);
  }
  expect(world.fileSystem.writes).toEqual([]); // nothing rewritten: no fresh ids, no repairs
}

async function expectNotesUntouched(world: FolderWorld, base: string) {
  expect(await world.inner.readFile(`${ROOT}/${base}/N.md`)).toBe(world.initialTexts.top);
  expect(await world.inner.readFile(`${ROOT}/${base}/Sub/M.md`)).toBe(world.initialTexts.sub);
}

describe.each([
  ['folders with a persisted .folder.md id', true],
  ['folders without a .folder.md (path-derived id)', false],
] as const)('cross-instance folder movement: %s', (_label, persisted) => {
  it('a single paired moved event relocates a nested folder with open notes', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Dest/Projects' });
    await settle();

    expectRelocatedIntact(world, 'Dest/Projects');
    await expectNotesUntouched(world, 'Dest/Projects');
  });

  it('deleted(old) then created(new)', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    world.watcher.emit({ type: 'created', path: 'Dest/Projects', isDirectory: true });
    await settle();

    expectRelocatedIntact(world, 'Dest/Projects');
    await expectNotesUntouched(world, 'Dest/Projects');
  });

  it('created(new) then deleted(old)', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'created', path: 'Dest/Projects', isDirectory: true });
    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    await settle();

    expectRelocatedIntact(world, 'Dest/Projects');
    await expectNotesUntouched(world, 'Dest/Projects');
  });

  it('created(new) alone, the deleted(old) arriving only later (a to-half reported before its from-half)', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'created', path: 'Dest/Projects', isDirectory: true });
    await settle();
    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    await settle();

    expectRelocatedIntact(world, 'Dest/Projects');
    await expectNotesUntouched(world, 'Dest/Projects');
  });

  it('rapid double movement: moved(Y -> Z) with the unpaired deleted(X)', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: null, name: 'Again' });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'moved', fromPath: 'Dest/Projects', toPath: 'Again' });
    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    await settle();

    expectRelocatedIntact(world, 'Again');
    await expectNotesUntouched(world, 'Again');
  });

  it('rapid double movement: deleted(X) before moved(Y -> Z)', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: null, name: 'Again' });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    world.watcher.emit({ type: 'moved', fromPath: 'Dest/Projects', toPath: 'Again' });
    await settle();

    expectRelocatedIntact(world, 'Again');
  });

  it('rapid double movement: moved(X -> Z) with the unpaired deleted(Y)', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: null, name: 'Again' });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Again' });
    world.watcher.emit({ type: 'deleted', path: 'Dest/Projects' });
    await settle();

    expectRelocatedIntact(world, 'Again');
  });

  it('a stale created(directory) for the previous path after the folder moved again', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Dest/Projects' });
    await settle();
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: null, name: 'Again' });
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'created', path: 'Dest/Projects', isDirectory: true });
    world.watcher.emit({ type: 'moved', fromPath: 'Dest/Projects', toPath: 'Again' });
    await settle();

    expectRelocatedIntact(world, 'Again');
    await expectNotesUntouched(world, 'Again');
  });

  it('moving the same folder repeatedly, each move delivered cleanly', async () => {
    const world = await createFolderWorld(persisted);
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest });
    world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Dest/Projects' });
    await settle();
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: null, name: 'Again' });
    world.watcher.emit({ type: 'moved', fromPath: 'Dest/Projects', toPath: 'Again' });
    await settle();
    await world.gateA.enqueue(world.ids.projects, { kind: 'move-folder', destinationFolderId: world.ids.dest, name: 'Third' });
    world.fileSystem.writes.length = 0;
    world.watcher.emit({ type: 'deleted', path: 'Again' });
    world.watcher.emit({ type: 'created', path: 'Dest/Third', isDirectory: true });
    await settle();

    expectRelocatedIntact(world, 'Dest/Third');
  });

  it('genuine deletion still removes the folder and every descendant', async () => {
    const world = await createFolderWorld(persisted);
    await world.inner.deleteFile(`${ROOT}/Projects`, { recursive: true });

    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    await settle();

    expect(world.vaultB.getFolder(world.ids.projects)).toBeUndefined();
    expect(world.vaultB.getFolder(world.ids.sub)).toBeUndefined();
    expect(world.vaultB.getPage('p-top')).toBeUndefined();
    expect(world.vaultB.getPage('p-sub')).toBeUndefined();
    expect(world.folderRemoved).toContain(world.ids.projects);
  });

  it('a deletion is not mistaken for a move because an unrelated untracked folder exists', async () => {
    const world = await createFolderWorld(persisted);
    await world.inner.deleteFile(`${ROOT}/Projects`, { recursive: true });
    await world.inner.createDirectory(`${ROOT}/Unrelated`);
    world.inner.seedFile(`${ROOT}/Unrelated/Other.md`, '---\nid: someone-else\n---\nbody');

    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    await settle();

    expect(world.vaultB.getFolder(world.ids.projects)).toBeUndefined();
    expect(world.vaultB.getPage('p-top')).toBeUndefined();
  });

  it('genuine duplication: the original stays put with its ids; the copy gets fresh ids', async () => {
    const world = await createFolderWorld(persisted);
    await world.inner.createDirectory(`${ROOT}/Projects copy`);
    await world.inner.createDirectory(`${ROOT}/Projects copy/Sub`);
    if (persisted) {
      world.inner.seedFile(`${ROOT}/Projects copy/.folder.md`, await world.inner.readFile(`${ROOT}/Projects/.folder.md`));
      world.inner.seedFile(`${ROOT}/Projects copy/Sub/.folder.md`, await world.inner.readFile(`${ROOT}/Projects/Sub/.folder.md`));
    }
    world.inner.seedFile(`${ROOT}/Projects copy/N.md`, world.initialTexts.top);
    world.inner.seedFile(`${ROOT}/Projects copy/Sub/M.md`, world.initialTexts.sub);

    world.watcher.emit({ type: 'created', path: 'Projects copy', isDirectory: true });
    await settle();

    const { vaultB } = world;
    expect(vaultB.getFolder(world.ids.projects)!.path).toBe(`${ROOT}/Projects`);
    expect(vaultB.getPage('p-top')!.path).toBe(`${ROOT}/Projects/N.md`);
    expect(vaultB.getPage('p-sub')!.path).toBe(`${ROOT}/Projects/Sub/M.md`);
    expect(vaultB.getPageByPath(`${ROOT}/Projects copy/N.md`)!.id).not.toBe('p-top');
    expect(vaultB.getPageByPath(`${ROOT}/Projects copy/Sub/M.md`)!.id).not.toBe('p-sub');
    expect(vaultB.getFolderByPath(`${ROOT}/Projects copy`)).toBeDefined();
    expect(vaultB.pageCount).toBe(4);
    expect(world.folderRemoved).toEqual([]);
    expect(world.missingAt).toEqual([]);
    for (const id of PAGE_IDS) expect(world.documentRegistry.get(id)).toBe(world.sessions[id]);
    // The originals were not rewritten.
    expect(await world.inner.readFile(`${ROOT}/Projects/N.md`)).toBe(world.initialTexts.top);
    expect(world.fileSystem.writes.some((path) => path.startsWith(`${ROOT}/Projects/`))).toBe(false);
  });

  it('ambiguous identity is never guessed: two identical candidates and no original means a deletion', async () => {
    const world = await createFolderWorld(persisted);
    // The original is gone, and two copies of it appeared elsewhere (a deletion plus two copy operations).
    for (const name of ['Copy1', 'Copy2']) {
      await world.inner.createDirectory(`${ROOT}/${name}`);
      await world.inner.createDirectory(`${ROOT}/${name}/Sub`);
      if (persisted) {
        world.inner.seedFile(`${ROOT}/${name}/.folder.md`, await world.inner.readFile(`${ROOT}/Projects/.folder.md`));
        world.inner.seedFile(`${ROOT}/${name}/Sub/.folder.md`, await world.inner.readFile(`${ROOT}/Projects/Sub/.folder.md`));
      }
      world.inner.seedFile(`${ROOT}/${name}/N.md`, world.initialTexts.top);
      world.inner.seedFile(`${ROOT}/${name}/Sub/M.md`, world.initialTexts.sub);
    }
    await world.inner.deleteFile(`${ROOT}/Projects`, { recursive: true });

    world.watcher.emit({ type: 'deleted', path: 'Projects' });
    await settle();

    expect(world.vaultB.getFolder(world.ids.projects)).toBeUndefined();
    expect(world.vaultB.getFolderByPath(`${ROOT}/Copy1`)).toBeUndefined(); // not adopted as the moved folder
    expect(world.vaultB.getFolderByPath(`${ROOT}/Copy2`)).toBeUndefined();
  });
});
