import { describe, expect, it } from 'vitest';
import { SelfWriteRegistry } from './SelfWriteRegistry';
import { SelfWriteAwareFileSystem } from './SelfWriteAwareFileSystem';
import { SelfWriteAwareWatcher } from './SelfWriteAwareWatcher';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { MoveService } from '../persistence/MoveService';
import { VaultSyncService } from '../sync/VaultSyncService';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import type { Page } from '../models/Page';

const ROOT = '/vault';

function buildPage(): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: 'Original body',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function makeVault(pages: Page[]): Vault {
  return new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

/**
 * Wires the exact production suppression graph — SelfWriteAwareFileSystem
 * wrapping the write side, SelfWriteAwareWatcher wrapping the read side,
 * sharing one SelfWriteRegistry — the same way Application's composition
 * root does. Only the Tauri-facing edges (InMemoryVaultFileSystem,
 * FakeVaultFileSystemWatcher) are faked; everything else is real.
 */
function setup(page: Page) {
  const vault = makeVault([page]);
  const rawFileSystem = new InMemoryVaultFileSystem();
  rawFileSystem.seedFile(
    page.path,
    new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
  );

  const registry = new SelfWriteRegistry();
  const fileSystem = new SelfWriteAwareFileSystem(rawFileSystem, registry, ROOT);

  const rawWatcher = new FakeVaultFileSystemWatcher();
  const watcher = new SelfWriteAwareWatcher(rawWatcher, registry);

  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );

  const documentRegistry = new DocumentRegistry();
  new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    documentRegistry,
    new FrontmatterSerializer(),
    new FakeIdGenerator()
  );

  let notificationCount = 0;
  vault.subscribe(() => {
    notificationCount += 1;
  });

  return {
    vault,
    rawFileSystem,
    fileSystem,
    rawWatcher,
    coordinator,
    getNotificationCount: () => notificationCount,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Internal write vs. filesystem watcher: duplicate-notification suppression', () => {
  it('an internal save produces exactly one Vault change notification, even after the watcher echoes it', async () => {
    const page = buildPage();
    const { vault, rawWatcher, coordinator, getNotificationCount } = setup(page);

    const result = await coordinator.enqueue(page.id, {
      kind: 'save',
      content: 'Saved from inside Clutter',
    });
    expect(result.status).toBe('saved');

    // The single notification so far came from PagePersistenceCoordinator's
    // own vault.replacePage() call.
    expect(getNotificationCount()).toBe(1);

    // The OS watcher now observes the same write and reports it, exactly as
    // a real filesystem watcher would after this app's own writeFile() call.
    rawWatcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    // Suppressed: SelfWriteAwareWatcher recognized this as our own echo and
    // never forwarded it to VaultSyncService, so no second notification and
    // no redundant re-read/rebuild of the page fired.
    expect(getNotificationCount()).toBe(1);
    expect(vault.getPage(page.id)!.source.markdown).toBe('Saved from inside Clutter');
  });

  it('a genuine external edit (no internal write registered for that path) still syncs normally', async () => {
    const page = buildPage();
    const { vault, rawFileSystem, rawWatcher, getNotificationCount } = setup(page);

    // Some other application edits the file directly on disk — no write
    // went through SelfWriteAwareFileSystem, so nothing was registered as
    // pending for this path.
    rawFileSystem.seedFile(
      `${ROOT}/Note.md`,
      '---\nid: page-1\n---\nEdited by another app'
    );
    rawWatcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    expect(getNotificationCount()).toBe(1);
    expect(vault.getPage(page.id)!.source.markdown).toBe('Edited by another app');
  });

  it('an internal save followed immediately by a real external edit only suppresses the echo, not the external change', async () => {
    const page = buildPage();
    const { vault, rawFileSystem, rawWatcher, coordinator, getNotificationCount } = setup(page);

    await coordinator.enqueue(page.id, {
      kind: 'save',
      content: 'Saved from inside Clutter',
    });
    expect(getNotificationCount()).toBe(1);

    // Echo of our own save arrives first and is suppressed.
    rawWatcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    expect(getNotificationCount()).toBe(1);

    // A second, genuinely external edit follows — this must not be
    // swallowed, proving suppression is a one-for-one consume rather than a
    // debounce/time window that would also eat this event.
    rawFileSystem.seedFile(
      `${ROOT}/Note.md`,
      '---\nid: page-1\n---\nEdited externally after our save'
    );
    rawWatcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    expect(getNotificationCount()).toBe(2);
    expect(vault.getPage(page.id)!.source.markdown).toBe(
      'Edited externally after our save'
    );
  });
});

describe('Internal move vs. filesystem watcher: duplicate-notification suppression', () => {
  it('an internal move produces exactly one Vault change notification, even after the watcher echoes it', async () => {
    const page = buildPage();
    const { vault, fileSystem, rawWatcher, getNotificationCount } = setup(page);

    vault.updatePagePath(page.id, `${ROOT}/Archive/Note.md`, null);
    expect(getNotificationCount()).toBe(1);

    await fileSystem.moveFile(`${ROOT}/Note.md`, `${ROOT}/Archive/Note.md`);

    rawWatcher.emit({
      type: 'moved',
      fromPath: 'Note.md',
      toPath: 'Archive/Note.md',
    });
    await flush();

    expect(getNotificationCount()).toBe(1);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/Note.md`);
  });

  it('a genuine external move (no internal move registered for that pair) still syncs normally', async () => {
    const page = buildPage();
    const movedPage = { ...page, path: `${ROOT}/old/path.md` };
    const vault = makeVault([movedPage]);
    const rawFileSystem = new InMemoryVaultFileSystem();
    rawFileSystem.seedFile(
      movedPage.path,
      new FrontmatterSerializer().serializeDocument(movedPage, movedPage.source.markdown)
    );

    const registry = new SelfWriteRegistry();
    const fileSystem = new SelfWriteAwareFileSystem(rawFileSystem, registry, ROOT);
    const rawWatcher = new FakeVaultFileSystemWatcher();
    const watcher = new SelfWriteAwareWatcher(rawWatcher, registry);
    new VaultSyncService(
      vault,
      fileSystem,
      watcher,
      new DocumentRegistry(),
      new FrontmatterSerializer(),
      new FakeIdGenerator()
    );

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    rawWatcher.emit({
      type: 'moved',
      fromPath: 'old/path.md',
      toPath: 'new/path.md',
    });
    await flush();

    expect(notificationCount).toBe(1);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/new/path.md`);
  });

  it('an internal move to Archive/A does not suppress an external move to the same destination from a different source', async () => {
    const builder = new PageBuilder();
    const pageA = builder.build({
      parentId: null,
      page: {
        path: `${ROOT}/Projects/A.md`,
        directoryPath: `${ROOT}/Projects`,
        frontmatter: { id: 'page-a' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Page A',
        analysis: {
          headings: [],
          blockReferences: [],
          tasks: [],
          tags: [],
          links: [],
          embeds: [],
        },
      },
    });
    const pageB = builder.build({
      parentId: null,
      page: {
        path: `${ROOT}/Inbox/B.md`,
        directoryPath: `${ROOT}/Inbox`,
        frontmatter: { id: 'page-b' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Page B',
        analysis: {
          headings: [],
          blockReferences: [],
          tasks: [],
          tags: [],
          links: [],
          embeds: [],
        },
      },
    });

    const vault = makeVault([pageA, pageB]);
    const rawFileSystem = new InMemoryVaultFileSystem();
    rawFileSystem.seedFile(
      pageA.path,
      new FrontmatterSerializer().serializeDocument(pageA, pageA.source.markdown)
    );
    rawFileSystem.seedFile(
      pageB.path,
      new FrontmatterSerializer().serializeDocument(pageB, pageB.source.markdown)
    );

    const registry = new SelfWriteRegistry();
    const fileSystem = new SelfWriteAwareFileSystem(rawFileSystem, registry, ROOT);
    const rawWatcher = new FakeVaultFileSystemWatcher();
    const watcher = new SelfWriteAwareWatcher(rawWatcher, registry);
    new VaultSyncService(
      vault,
      fileSystem,
      watcher,
      new DocumentRegistry(),
      new FrontmatterSerializer(),
      new FakeIdGenerator()
    );

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    vault.updatePagePath(pageA.id, `${ROOT}/Archive/A.md`, null);
    expect(notificationCount).toBe(1);

    await fileSystem.moveFile(`${ROOT}/Projects/A.md`, `${ROOT}/Archive/A.md`);

    rawWatcher.emit({
      type: 'moved',
      fromPath: 'Projects/A.md',
      toPath: 'Archive/A.md',
    });
    await flush();
    expect(notificationCount).toBe(1);

    // Pair-key safety: a different source to the same destination must not
    // consume the internal Projects/A → Archive/A mark.
    expect(registry.consumePendingMove('Inbox/B.md', 'Archive/A.md')).toBe(false);

    rawWatcher.emit({
      type: 'moved',
      fromPath: 'Inbox/B.md',
      toPath: 'Archive/B.md',
    });
    await flush();

    expect(notificationCount).toBe(2);
    expect(vault.getPage(pageB.id)!.path).toBe(`${ROOT}/Archive/B.md`);
  });

  it('rolls back a pending move mark when the filesystem move fails', async () => {
    const page = buildPage();
    const rawFileSystem = new InMemoryVaultFileSystem();
    rawFileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    class FailingMoveFileSystem extends InMemoryVaultFileSystem {
      async moveFile(): Promise<void> {
        throw new Error('move failed');
      }
    }

    const registry = new SelfWriteRegistry();
    const fileSystem = new SelfWriteAwareFileSystem(
      new FailingMoveFileSystem(),
      registry,
      ROOT
    );
    const rawWatcher = new FakeVaultFileSystemWatcher();
    const watcher = new SelfWriteAwareWatcher(rawWatcher, registry);
    const vault = makeVault([page]);
    new VaultSyncService(
      vault,
      fileSystem,
      watcher,
      new DocumentRegistry(),
      new FrontmatterSerializer(),
      new FakeIdGenerator()
    );

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    await expect(
      fileSystem.moveFile(`${ROOT}/Note.md`, `${ROOT}/Archive/Note.md`)
    ).rejects.toThrow(/move failed/);

    rawWatcher.emit({
      type: 'moved',
      fromPath: 'Note.md',
      toPath: 'Archive/Note.md',
    });
    await flush();

    expect(notificationCount).toBe(1);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/Note.md`);
  });
});
