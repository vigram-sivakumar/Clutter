import { describe, expect, it } from 'vitest';

import { VaultSyncService } from './VaultSyncService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { InFlightPaths } from '../providers/InFlightPaths';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';

const ROOT = '/vault';

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

const archiveFolder: Folder = {
  id: 'folder-archive',
  name: 'Archive',
  path: `${ROOT}/Archive`,
  parentId: null,
  metadata: folderMetadata,
};

function page(id: string, path: string, body = 'body'): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/${path}`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

const document = (id: string, body = 'body') => `---\nid: ${id}\n---\n${body}`;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(pages: Page[]) {
  const vault = new Vault(ROOT, pages, [archiveFolder], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();
  const watcher = new FakeVaultFileSystemWatcher();
  const inFlight = new InFlightPaths();
  const service = new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    new DocumentRegistry(),
    new FrontmatterSerializer(),
    new FakeIdGenerator(),
    undefined,
    inFlight
  );

  return { vault, fileSystem, watcher, inFlight, service };
}

/** What the Gate's final `replacePage` does for an archive. */
function commitArchive(vault: Vault, id: string, destinationPath: string) {
  const current = vault.getPage(id)!;
  vault.replacePage({
    ...current,
    path: destinationPath,
    parentId: archiveFolder.id,
    metadata: { ...current.metadata, status: 'archived' },
  });
}

describe('VaultSyncService while the Persistence Gate has an archive in flight', () => {
  it('does not remove or relocate the page for events about its old path, however they are reported — it waits', async () => {
    const note = page('a', 'Note.md');
    const { vault, fileSystem, watcher, inFlight } = setup([note]);
    // The Gate has moved the file; the Vault has not been told yet.
    fileSystem.seedFile(`${ROOT}/Archive/Note.md`, document('a'));
    const release = inFlight.begin([`${ROOT}/Note.md`, `${ROOT}/Archive/Note.md`]);

    watcher.emit({ type: 'deleted', path: 'Note.md' });
    watcher.emit({ type: 'moved', fromPath: 'Note.md', toPath: 'Archive/Note.md' });
    watcher.emit({ type: 'created', path: 'Archive/Note.md', isDirectory: false });
    await flush();

    // Before the fix a delete read against the still-old path removed the page, and the Gate's commit then failed
    // with "Cannot replace unknown page".
    expect(vault.getPage('a')).toBeDefined();
    expect(vault.getPage('a')!.path).toBe(`${ROOT}/Note.md`);

    // The Gate commits, then releases: the waiting events are interpreted against the finished state.
    commitArchive(vault, 'a', `${ROOT}/Archive/Note.md`);
    release();
    await flush();
    await flush();

    expect(vault.pageCount).toBe(1);
    expect(vault.getPage('a')!.path).toBe(`${ROOT}/Archive/Note.md`);
    expect(vault.getPageByPath(`${ROOT}/Archive/Note.md`)?.id).toBe('a');
    expect(vault.getPageByPath(`${ROOT}/Note.md`)).toBeUndefined();
  });

  it('leaves an archive the Gate then fails exactly as it was — the waiting events find the page still there', async () => {
    const note = page('a', 'Note.md');
    const { vault, fileSystem, watcher, inFlight } = setup([note]);
    fileSystem.seedFile(`${ROOT}/Note.md`, document('a'));
    const release = inFlight.begin([`${ROOT}/Note.md`, `${ROOT}/Archive/Note.md`]);

    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    release();
    await flush();

    expect(vault.getPage('a')!.path).toBe(`${ROOT}/Note.md`);
    expect(vault.pageCount).toBe(1);
  });

  it('keeps handling events for other paths at once', async () => {
    const note = page('a', 'Note.md');
    const other = page('c', 'Other.md');
    const { vault, fileSystem, watcher, inFlight } = setup([note, other]);
    fileSystem.seedFile(`${ROOT}/Note.md`, document('a'));
    const release = inFlight.begin([`${ROOT}/Note.md`, `${ROOT}/Archive/Note.md`]);

    watcher.emit({ type: 'deleted', path: 'Other.md' });
    await flush();

    expect(vault.getPage('c')).toBeUndefined();
    expect(vault.getPage('a')).toBeDefined();
    release();
  });

  it('handles delayed and duplicated events after the Gate has finished without disturbing the committed page', async () => {
    const note = page('a', 'Note.md');
    const { vault, fileSystem, watcher } = setup([note]);
    fileSystem.seedFile(`${ROOT}/Archive/Note.md`, document('a'));
    commitArchive(vault, 'a', `${ROOT}/Archive/Note.md`);

    for (const change of [
      { type: 'deleted', path: 'Note.md' },
      { type: 'deleted', path: 'Note.md' },
      { type: 'moved', fromPath: 'Note.md', toPath: 'Archive/Note.md' },
      { type: 'moved', fromPath: 'Note.md', toPath: 'Archive/Note.md' },
      { type: 'created', path: 'Archive/Note.md', isDirectory: false },
    ] as const) {
      watcher.emit(change);
    }
    await flush();
    await flush();

    expect(vault.pageCount).toBe(1);
    expect(vault.getPage('a')!.path).toBe(`${ROOT}/Archive/Note.md`);
    expect(vault.getPageByPath(`${ROOT}/Archive/Note.md`)?.id).toBe('a');
  });
});

describe('VaultSyncService and a rename the watcher paired with the wrong file', () => {
  it('does not give a page another page’s file: an unmatched pair is checked against the file’s own id', async () => {
    // macOS gives no id linking a rename's two halves, so "A.md vanished" can be reported as "Archive/B.md appeared".
    const a = page('a', 'A.md', 'A body');
    const { vault, fileSystem, watcher } = setup([a]);
    fileSystem.seedFile(`${ROOT}/A.md`, document('a', 'A body'));
    fileSystem.seedFile(`${ROOT}/Archive/B.md`, document('b', 'B body'));

    watcher.emit({ type: 'moved', fromPath: 'A.md', toPath: 'Archive/B.md' });
    await flush();
    await flush();

    // A is still at A's path, and B's file became its own page — no page took the other's path.
    expect(vault.getPage('a')!.path).toBe(`${ROOT}/A.md`);
    expect(vault.getPageByPath(`${ROOT}/Archive/B.md`)?.id).toBe('b');
    expect(vault.pageCount).toBe(2);
  });

  it('still applies a genuine move, where the file at the destination is the page’s own', async () => {
    const a = page('a', 'A.md');
    const { vault, fileSystem, watcher } = setup([a]);
    fileSystem.seedFile(`${ROOT}/Archive/A.md`, document('a'));

    watcher.emit({ type: 'moved', fromPath: 'A.md', toPath: 'Archive/A.md' });
    await flush();

    expect(vault.getPage('a')!.path).toBe(`${ROOT}/Archive/A.md`);
    expect(vault.pageCount).toBe(1);
  });
});
