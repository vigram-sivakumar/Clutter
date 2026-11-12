import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { MoveService } from '../persistence/MoveService';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { InFlightPaths } from '../providers/InFlightPaths';
import { ROOT, createFolderWorld, settle, type FolderWorld } from '../testing/TwoInstanceFolderWorld';

/**
 * Fix 3: archive metadata written by another instance. Archiving moves the folder and then writes its `.folder.md`
 * (status, archivedAt, originalPath, originalParentId). The observer sees `moved` plus created/changed for that file;
 * its Vault must take the four fields as the file holds them — without writing — so that restoring from the
 * observer has the original destination.
 */

async function archiveInA(world: FolderWorld) {
  await world.gateA.enqueue(world.ids.projects, { kind: 'archive-folder' });
  world.fileSystem.writes.length = 0;
  world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Archive/Projects' });
  world.watcher.emit({ type: 'created', path: 'Archive/Projects/.folder.md', isDirectory: false });
  world.watcher.emit({ type: 'changed', path: 'Archive/Projects/.folder.md' });
  await settle();
}

function gateB(world: FolderWorld) {
  return new PagePersistenceCoordinator(
    world.fileSystem,
    world.vaultB,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(world.vaultB, world.fileSystem),
    undefined,
    new InFlightPaths()
  );
}

describe('cross-instance folder archive and restore', () => {
  it('archive in A: the observer takes all four archive fields from the file and writes nothing', async () => {
    const world = await createFolderWorld(true);
    await archiveInA(world);

    const fromA = world.vaultA.getFolder(world.ids.projects)!.metadata;
    const inB = world.vaultB.getFolder(world.ids.projects)!;

    expect(inB.path).toBe(`${ROOT}/Archive/Projects`);
    expect(inB.metadata.status).toBe('archived');
    expect(inB.metadata.archivedAt).toBe(fromA.archivedAt);
    expect(inB.metadata.originalPath).toBe(`${ROOT}/Projects`);
    expect(inB.metadata.originalParentId).toBe(fromA.originalParentId);
    expect(world.fileSystem.writes).toEqual([]);
    expect(world.folderRemoved).toEqual([]);
    expect(world.missingAt).toEqual([]);
    for (const id of ['p-top', 'p-sub'] as const) expect(world.documentRegistry.get(id)).toBe(world.sessions[id]);
  });

  it('restore from the observer works after the other instance archived: it has the original destination', async () => {
    const world = await createFolderWorld(true);
    await archiveInA(world);

    const result = await gateB(world).enqueue(world.ids.projects, { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    const restored = world.vaultB.getFolder(world.ids.projects)!;
    expect(restored.path).toBe(`${ROOT}/Projects`);
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.originalPath).toBeNull();
    expect(world.vaultB.getPage('p-top')!.path).toBe(`${ROOT}/Projects/N.md`);
  });

  it('restore in A after archive: the observer clears the four fields and leaves the restored file as A wrote it', async () => {
    const world = await createFolderWorld(true);
    await archiveInA(world);
    await world.gateA.enqueue(world.ids.projects, { kind: 'restore-folder' });
    const writtenByA = await world.inner.readFile(`${ROOT}/Projects/.folder.md`);
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'moved', fromPath: 'Archive/Projects', toPath: 'Projects' });
    world.watcher.emit({ type: 'created', path: 'Projects/.folder.md', isDirectory: false });
    world.watcher.emit({ type: 'changed', path: 'Projects/.folder.md' });
    await settle();

    const inB = world.vaultB.getFolder(world.ids.projects)!;
    expect(inB.path).toBe(`${ROOT}/Projects`);
    expect(inB.metadata).toMatchObject({ status: 'active', archivedAt: null, originalPath: null, originalParentId: null });
    // The existing move-out repair may re-apply the same correction; it is identical to what A wrote.
    expect(await world.inner.readFile(`${ROOT}/Projects/.folder.md`)).toBe(writtenByA);
    expect(world.fileSystem.writes.every((path) => path === `${ROOT}/Projects/.folder.md`)).toBe(true);
    expect(world.folderRemoved).toEqual([]);
    expect(world.missingAt).toEqual([]);
    for (const id of ['p-top', 'p-sub'] as const) expect(world.documentRegistry.get(id)).toBe(world.sessions[id]);
  });

  it('only created(.folder.md) arrives: it is reconciled like a change, not built as a page', async () => {
    const world = await createFolderWorld(true);
    await archiveInA(world);
    const archivedFile = await world.inner.readFile(`${ROOT}/Archive/Projects/.folder.md`);
    const changedFile = archivedFile.replace(/archivedAt: .*/, 'archivedAt: 2030-01-01T00:00:00.000Z');
    expect(changedFile).not.toBe(archivedFile);
    world.inner.seedFile(`${ROOT}/Archive/Projects/.folder.md`, changedFile);
    world.fileSystem.writes.length = 0;

    world.watcher.emit({ type: 'created', path: 'Archive/Projects/.folder.md', isDirectory: false });
    await settle();

    expect(world.vaultB.getFolder(world.ids.projects)!.metadata.archivedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(world.vaultB.pageCount).toBe(2);
    expect(world.fileSystem.writes).toEqual([]);
  });

  it('a file that already matches the Vault inside Archive changes nothing and writes nothing', async () => {
    const world = await createFolderWorld(true);
    await archiveInA(world);
    let notifications = 0;
    world.vaultB.subscribe(() => {
      notifications += 1;
    });

    world.watcher.emit({ type: 'changed', path: 'Archive/Projects/.folder.md' });
    world.watcher.emit({ type: 'created', path: 'Archive/Projects/.folder.md', isDirectory: false });
    await settle();

    expect(notifications).toBe(0);
    expect(world.fileSystem.writes).toEqual([]);
  });

  it('an archived file outside Archive is still the stale case: the file is repaired, as before', async () => {
    const world = await createFolderWorld(true);
    world.inner.seedFile(
      `${ROOT}/Projects/.folder.md`,
      '---\nid: folder-projects\nstatus: archived\narchivedAt: 2026-01-01T00:00:00.000Z\noriginalPath: /vault/Old\n---\n'
    );

    world.watcher.emit({ type: 'changed', path: 'Projects/.folder.md' });
    await settle();

    expect(world.vaultB.getFolder(world.ids.projects)!.metadata.status).toBe('active');
    expect(await world.inner.readFile(`${ROOT}/Projects/.folder.md`)).toMatch(/status:\s*active/);
  });

  describe('event order and the move itself (atomic provider)', () => {
    const FOLDER_MD = (dir: string) => `${ROOT}/${dir}/.folder.md`;

    it('archive race: .folder.md created/changed arrive BEFORE moved — the observer still ends archived', async () => {
      const world = await createFolderWorld(true, { atomic: true });
      await world.gateA.enqueue(world.ids.projects, { kind: 'archive-folder' });
      world.fileSystem.writes.length = 0;

      world.watcher.emit({ type: 'created', path: 'Archive/Projects/.folder.md', isDirectory: false });
      world.watcher.emit({ type: 'changed', path: 'Archive/Projects/.folder.md' });
      world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Archive/Projects' });
      await settle();

      const fromA = world.vaultA.getFolder(world.ids.projects)!.metadata;
      const inB = world.vaultB.getFolder(world.ids.projects)!;
      expect(inB.path).toBe(`${ROOT}/Archive/Projects`);
      expect(inB.metadata).toMatchObject({
        status: 'archived',
        archivedAt: fromA.archivedAt,
        originalPath: `${ROOT}/Projects`,
        originalParentId: fromA.originalParentId,
      });
      expect(world.fileSystem.writes).toEqual([]);
      expect(world.folderRemoved).toEqual([]);
      expect(world.missingAt).toEqual([]);
      for (const id of ['p-top', 'p-sub'] as const) expect(world.documentRegistry.get(id)).toBe(world.sessions[id]);
    });

    it('archive: moved alone is enough — the move reads the file', async () => {
      const world = await createFolderWorld(true, { atomic: true });
      await world.gateA.enqueue(world.ids.projects, { kind: 'archive-folder' });
      world.fileSystem.writes.length = 0;

      world.watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Archive/Projects' });
      await settle();

      expect(world.vaultB.getFolder(world.ids.projects)!.metadata.status).toBe('archived');
      expect(world.fileSystem.writes).toEqual([]);
    });

    it('restore race: A already wrote the cleared file — B clears all four fields with one notification and no write', async () => {
      const world = await createFolderWorld(true, { atomic: true });
      await archiveInA(world);
      expect(world.vaultB.getFolder(world.ids.projects)!.metadata.status).toBe('archived');
      await world.gateA.enqueue(world.ids.projects, { kind: 'restore-folder' });
      const writtenByA = await world.inner.readFile(FOLDER_MD('Projects'));
      world.fileSystem.writes.length = 0;
      const observed: Array<{ path: string; status: string; originalPath: string | null }> = [];
      world.vaultB.subscribe(() => {
        const folder = world.vaultB.getFolder(world.ids.projects)!;
        observed.push({ path: folder.path, status: folder.metadata.status, originalPath: folder.metadata.originalPath });
      });

      world.watcher.emit({ type: 'moved', fromPath: 'Archive/Projects', toPath: 'Projects' });
      await settle();

      expect(world.vaultB.getFolder(world.ids.projects)!.metadata).toMatchObject({
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      });
      expect(observed).toEqual([{ path: `${ROOT}/Projects`, status: 'active', originalPath: null }]);
      expect(world.fileSystem.writes).toEqual([]);
      expect(await world.inner.readFile(FOLDER_MD('Projects'))).toBe(writtenByA);
      expect(world.folderRemoved).toEqual([]);
      expect(world.missingAt).toEqual([]);
      for (const id of ['p-top', 'p-sub'] as const) expect(world.documentRegistry.get(id)).toBe(world.sessions[id]);
    });

    it('Finder move out of Archive with stale archived metadata still follows the existing repair path', async () => {
      const world = await createFolderWorld(true, { atomic: true });
      await archiveInA(world);
      // Finder moves the directory out; nothing rewrites .folder.md, so the file still says archived.
      await world.inner.moveFile(`${ROOT}/Archive/Projects`, `${ROOT}/Projects`);
      expect(await world.inner.readFile(FOLDER_MD('Projects'))).toMatch(/status:\s*archived/);
      world.fileSystem.writes.length = 0;
      const observed: string[] = [];
      world.vaultB.subscribe(() => {
        observed.push(world.vaultB.getFolder(world.ids.projects)!.metadata.status);
      });

      world.watcher.emit({ type: 'moved', fromPath: 'Archive/Projects', toPath: 'Projects' });
      await settle();

      expect(world.fileSystem.writes).toEqual([FOLDER_MD('Projects')]); // the repair writes the cleared file
      expect(await world.inner.readFile(FOLDER_MD('Projects'))).toMatch(/status:\s*active/);
      expect(await world.inner.readFile(FOLDER_MD('Projects'))).not.toMatch(/archivedAt/);
      expect(world.vaultB.getFolder(world.ids.projects)!.metadata).toMatchObject({
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      });
      expect(observed).toEqual(['active']); // one consistent notification
    });
  });
});
