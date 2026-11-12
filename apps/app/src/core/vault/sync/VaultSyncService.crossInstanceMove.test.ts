import { describe, expect, it, vi } from 'vitest';

import { VaultSyncService } from './VaultSyncService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import type { VaultEntry, VaultFileSystem } from '../providers/VaultFileSystem';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';

/**
 * Gap A: another Clutter instance moves a note, so this instance sees the old path disappear (`deleted`) and the
 * new path appear (`created`) — in either order, or as crossed/mis-paired renames. The Vault page (identified by
 * its frontmatter id) must be relocated, never removed and re-added, so its tab and DocumentSession survive.
 */

const ROOT = '/vault';

const document = (id: string, body = 'body') => `---\nid: ${id}\n---\n${body}`;

function page(id: string, name: string, body = 'body'): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

/** Lets chained, queued hand-offs finish (each hop is its own macrotask-free microtask chain). */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** Delegates to a real in-memory filesystem, with hooks to count listings and to hide a path from `exists`. */
class ObservedFileSystem implements VaultFileSystem {
  readonly hiddenFromExists = new Set<string>();
  readonly listings: string[] = [];

  constructor(readonly inner: InMemoryVaultFileSystem) {}

  async exists(path: string) {
    return this.hiddenFromExists.has(path) ? false : this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  async readDirectory(path: string): Promise<VaultEntry[]> {
    this.listings.push(path);
    return this.inner.readDirectory(path);
  }
  readFile(path: string) {
    return this.inner.readFile(path);
  }
  writeFile(path: string, contents: string) {
    return this.inner.writeFile(path, contents);
  }
  deleteFile(path: string, options?: { recursive?: boolean }) {
    return this.inner.deleteFile(path, options);
  }
  copyFile(from: string, to: string) {
    return this.inner.copyFile(from, to);
  }
  moveFile(from: string, to: string) {
    return this.inner.moveFile(from, to);
  }
}

function setup(pages: Page[]) {
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const inner = new InMemoryVaultFileSystem();
  const fileSystem = new ObservedFileSystem(inner);
  const watcher = new FakeVaultFileSystemWatcher();
  const documentRegistry = new DocumentRegistry();
  const service = new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    documentRegistry,
    new FrontmatterSerializer(),
    new FakeIdGenerator()
  );

  // What Application's workspace reconciliation depends on: a tab closes when its page id is missing from the
  // Vault at any notification. `missingAt` records every notification at which a watched id was absent.
  const removed: string[] = [];
  const missingAt: string[] = [];
  const watched = new Set<string>();
  vault.subscribe((event) => {
    if (event.type === 'page-removed') removed.push(event.pageId);
    for (const id of watched) {
      if (!vault.getPage(id)) missingAt.push(`${id}@${event.type}`);
    }
  });

  return { vault, fileSystem, inner, watcher, documentRegistry, service, removed, missingAt, watched };
}

/** The move another instance performed: the file is already at its destination when events arrive. */
function moveOnDisk(inner: InMemoryVaultFileSystem, from: string, to: string, contents: string) {
  inner.seedFile(`${ROOT}/${to}`, contents);
  void from; // the old path was never seeded: it is "gone"
}

describe('VaultSyncService: a page moved by another instance keeps its Vault entry and session (Gap A)', () => {
  it('deleted(old) then created(new): relocated in place, never removed', async () => {
    const original = page('p1', 'Old.md');
    const ctx = setup([original]);
    const session = ctx.documentRegistry.open('p1', original.source.markdown);
    ctx.watched.add('p1');
    const onDisk = document('p1');
    moveOnDisk(ctx.inner, 'Old.md', 'New.md', onDisk);

    ctx.watcher.emit({ type: 'deleted', path: 'Old.md' });
    ctx.watcher.emit({ type: 'created', path: 'New.md', isDirectory: false });
    await settle();

    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/New.md`);
    expect(ctx.vault.getPageByPath(`${ROOT}/Old.md`)).toBeUndefined();
    expect(ctx.vault.pageCount).toBe(1);
    expect(ctx.removed).toEqual([]);
    expect(ctx.missingAt).toEqual([]); // the tab's page id was present at every notification
    expect(ctx.documentRegistry.get('p1')).toBe(session);
    expect(await ctx.inner.readFile(`${ROOT}/New.md`)).toBe(onDisk); // frontmatter untouched
  });

  it('created(new) then deleted(old): the id is not reassigned and the file is not rewritten', async () => {
    const original = page('p1', 'Old.md');
    const ctx = setup([original]);
    const session = ctx.documentRegistry.open('p1', original.source.markdown);
    ctx.watched.add('p1');
    const onDisk = document('p1');
    moveOnDisk(ctx.inner, 'Old.md', 'New.md', onDisk);

    ctx.watcher.emit({ type: 'created', path: 'New.md', isDirectory: false });
    ctx.watcher.emit({ type: 'deleted', path: 'Old.md' });
    await settle();

    expect(ctx.vault.pageCount).toBe(1);
    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/New.md`);
    expect(ctx.removed).toEqual([]);
    expect(ctx.missingAt).toEqual([]);
    expect(ctx.documentRegistry.get('p1')).toBe(session);
    expect(await ctx.inner.readFile(`${ROOT}/New.md`)).toBe(onDisk);
  });

  it('created(new) alone, with no deleted event at all: still a move', async () => {
    const original = page('p1', 'Old.md');
    const ctx = setup([original]);
    ctx.watched.add('p1');
    moveOnDisk(ctx.inner, 'Old.md', 'New.md', document('p1'));

    ctx.watcher.emit({ type: 'created', path: 'New.md', isDirectory: false });
    await settle();

    expect(ctx.vault.pageCount).toBe(1);
    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/New.md`);
    expect(ctx.missingAt).toEqual([]);
  });

  it('crossed rename events for two pages: each page ends at its own file, nothing hangs or is removed', async () => {
    const ctx = setup([page('p1', 'A.md'), page('p2', 'B.md')]);
    const s1 = ctx.documentRegistry.open('p1', 'body');
    const s2 = ctx.documentRegistry.open('p2', 'body');
    ctx.watched.add('p1');
    ctx.watched.add('p2');
    // Disk truth: A -> A2 (p1) and B -> B2 (p2). The watcher pairs the halves the wrong way round.
    moveOnDisk(ctx.inner, 'A.md', 'A2.md', document('p1'));
    moveOnDisk(ctx.inner, 'B.md', 'B2.md', document('p2'));

    ctx.watcher.emit({ type: 'moved', fromPath: 'A.md', toPath: 'B2.md' });
    ctx.watcher.emit({ type: 'moved', fromPath: 'B.md', toPath: 'A2.md' });
    await settle();

    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/A2.md`);
    expect(ctx.vault.getPage('p2')!.path).toBe(`${ROOT}/B2.md`);
    expect(ctx.vault.pageCount).toBe(2);
    expect(ctx.removed).toEqual([]);
    expect(ctx.missingAt).toEqual([]);
    expect(ctx.documentRegistry.get('p1')).toBe(s1);
    expect(ctx.documentRegistry.get('p2')).toBe(s2);
    expect(await ctx.inner.readFile(`${ROOT}/A2.md`)).toBe(document('p1'));
    expect(await ctx.inner.readFile(`${ROOT}/B2.md`)).toBe(document('p2'));
  });

  it('destination validation failure: terminates with one lookup, falls back to a deletion, never loops', async () => {
    const ctx = setup([page('p1', 'Old.md')]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    moveOnDisk(ctx.inner, 'Old.md', 'New.md', document('p1'));
    // The lookup reads the file, but the move's own destination check is told the file is not there.
    ctx.fileSystem.hiddenFromExists.add(`${ROOT}/New.md`);

    ctx.watcher.emit({ type: 'deleted', path: 'Old.md' });
    await settle();

    expect(ctx.vault.getPageByPath(`${ROOT}/Old.md`)).toBeUndefined(); // existing deletion behaviour
    expect(ctx.fileSystem.listings.filter((path) => path === ROOT)).toHaveLength(1); // one lookup, no re-entry
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a refused relocation still adopts its destination afterwards', async () => {
    // The destination exists and carries the id, but the move is refused because another page already owns it.
    const ctx = setup([page('p1', 'Old.md'), page('p2', 'Taken.md')]);
    ctx.inner.seedFile(`${ROOT}/Taken.md`, document('p1')); // a different file now holds p1's id at a tracked path
    ctx.inner.seedFile(`${ROOT}/Elsewhere.md`, document('p1'));

    ctx.watcher.emit({ type: 'deleted', path: 'Old.md' });
    await settle();

    // Elsewhere.md is the untracked candidate and is relocated onto; Taken.md stays p2's.
    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/Elsewhere.md`);
    expect(ctx.vault.getPage('p2')!.path).toBe(`${ROOT}/Taken.md`);
  });

  it('genuine deletion: removed, and an unrelated untracked note with another id is not adopted', async () => {
    const ctx = setup([page('p1', 'Old.md')]);
    ctx.inner.seedFile(`${ROOT}/Unrelated.md`, document('someone-else'));

    ctx.watcher.emit({ type: 'deleted', path: 'Old.md' });
    await settle();

    expect(ctx.vault.getPage('p1')).toBeUndefined();
    expect(ctx.removed).toEqual(['p1']);
    expect(ctx.vault.getPageByPath(`${ROOT}/Unrelated.md`)).toBeUndefined();
    expect(ctx.vault.pageCount).toBe(0);
  });

  it('genuine duplicate copy: the original stays put and keeps its id, the copy gets a fresh one', async () => {
    const original = page('p1', 'Note.md');
    const ctx = setup([original]);
    const session = ctx.documentRegistry.open('p1', original.source.markdown);
    ctx.watched.add('p1');
    const originalOnDisk = document('p1');
    ctx.inner.seedFile(`${ROOT}/Note.md`, originalOnDisk);
    ctx.inner.seedFile(`${ROOT}/Note copy.md`, originalOnDisk);

    ctx.watcher.emit({ type: 'created', path: 'Note copy.md', isDirectory: false });
    await settle();

    const copy = ctx.vault.getPageByPath(`${ROOT}/Note copy.md`)!;
    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/Note.md`);
    expect(copy.id).not.toBe('p1');
    expect(ctx.vault.pageCount).toBe(2);
    expect(ctx.removed).toEqual([]);
    expect(ctx.missingAt).toEqual([]);
    expect(ctx.documentRegistry.get('p1')).toBe(session);
    expect(await ctx.inner.readFile(`${ROOT}/Note.md`)).toBe(originalOnDisk); // original untouched
    expect(await ctx.inner.readFile(`${ROOT}/Note copy.md`)).toContain(`id: ${copy.id}`);
  });

  it('a dirty open session survives the move with its unsaved edit intact', async () => {
    const original = page('p1', 'Old.md');
    const ctx = setup([original]);
    const session = ctx.documentRegistry.open('p1', original.source.markdown);
    session.commit(new DocumentTransaction('my unsaved edit'));
    ctx.watched.add('p1');
    moveOnDisk(ctx.inner, 'Old.md', 'New.md', document('p1'));

    ctx.watcher.emit({ type: 'created', path: 'New.md', isDirectory: false });
    ctx.watcher.emit({ type: 'deleted', path: 'Old.md' });
    await settle();

    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/New.md`);
    expect(ctx.missingAt).toEqual([]);
    expect(ctx.documentRegistry.get('p1')).toBe(session);
    expect(session.isDirty).toBe(true);
    expect(session.currentRevision.markdown).toBe('my unsaved edit');
  });
});

/**
 * Repeated movement: a stale `created` for the path the page has since left reaches reconcileFileEntity()
 * directly (not through reconcilePath()), so its "gone again" branch must look for the page's new location too.
 */
const folderMetadata = {
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

const folders: Folder[] = ['F1', 'F2', 'F3'].map((name) => ({
  id: `folder-${name}`,
  name,
  path: `${ROOT}/${name}`,
  parentId: null,
  metadata: folderMetadata,
}));

function pageIn(id: string, folderName: string): Page {
  return new PageBuilder().build({
    parentId: `folder-${folderName}`,
    page: {
      path: `${ROOT}/${folderName}/N.md`,
      directoryPath: `${ROOT}/${folderName}`,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

async function setupFolders(original: Page) {
  const vault = new Vault(ROOT, [original], folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const inner = new InMemoryVaultFileSystem();
  for (const folder of folders) await inner.createDirectory(folder.path);
  const watcher = new FakeVaultFileSystemWatcher();
  const documentRegistry = new DocumentRegistry();
  new VaultSyncService(vault, inner, watcher, documentRegistry, new FrontmatterSerializer(), new FakeIdGenerator());
  const removed: string[] = [];
  vault.subscribe((event) => {
    if (event.type === 'page-removed') removed.push(event.pageId);
  });

  return { vault, inner, watcher, documentRegistry, removed };
}

describe('VaultSyncService: repeated movement of the same note (stale created for the previous path)', () => {
  it('F1 -> F2 then F2 -> F3 with a stale created(F2/N.md): never removed, same id, session and final path', async () => {
    const ctx = await setupFolders(pageIn('p1', 'F1'));
    const session = ctx.documentRegistry.open('p1', 'body');

    // Move 1 (clean): the file is at F2 when events arrive.
    ctx.inner.seedFile(`${ROOT}/F2/N.md`, document('p1'));
    ctx.watcher.emit({ type: 'moved', fromPath: 'F1/N.md', toPath: 'F2/N.md' });
    await settle();
    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/F2/N.md`);

    // Move 2 already happened on disk (F2 -> F3); a late created(F2/N.md) is handled first.
    await ctx.inner.deleteFile(`${ROOT}/F2/N.md`);
    ctx.inner.seedFile(`${ROOT}/F3/N.md`, document('p1'));
    ctx.watcher.emit({ type: 'created', path: 'F2/N.md', isDirectory: false });
    ctx.watcher.emit({ type: 'moved', fromPath: 'F2/N.md', toPath: 'F3/N.md' });
    await settle();

    expect(ctx.removed).toEqual([]);
    expect(ctx.vault.getPage('p1')!.path).toBe(`${ROOT}/F3/N.md`);
    expect(ctx.vault.pageCount).toBe(1);
    expect(ctx.documentRegistry.get('p1')).toBe(session);
    expect(await ctx.inner.readFile(`${ROOT}/F3/N.md`)).toBe(document('p1'));
  });

  it('a stale created for a path whose file is genuinely gone still removes the page', async () => {
    const ctx = await setupFolders(pageIn('p1', 'F2'));

    ctx.watcher.emit({ type: 'created', path: 'F2/N.md', isDirectory: false });
    await settle();

    expect(ctx.vault.getPage('p1')).toBeUndefined();
    expect(ctx.removed).toEqual(['p1']);
  });
});
