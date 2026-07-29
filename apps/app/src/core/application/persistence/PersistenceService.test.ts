import { describe, expect, it } from 'vitest';
import { PersistenceService } from './PersistenceService';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentSession } from '../../engine/DocumentSession';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { DocumentState } from '../../engine/DocumentState';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { MoveService } from '../move/MoveService';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

function buildPage(overrides: Partial<Parameters<PageBuilder['build']>[0]['page']> = {}): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', icon: '📝', favorite: true },
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
      ...overrides,
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

function setup(page: Page) {
  const vault = makeVault([page]);
  const fileSystem = new InMemoryVaultFileSystem();
  fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const persistenceService = new PersistenceService(coordinator, saveCoordinator);
  const session = new DocumentSession(page);

  return { vault, fileSystem, saveCoordinator, persistenceService, session };
}

describe('PersistenceService.save() round-trip', () => {
  it('preserves the page id and updates the markdown body on disk and in the vault', async () => {
    const page = buildPage();
    const { vault, fileSystem, saveCoordinator, persistenceService, session } = setup(page);

    session.commit(new DocumentTransaction('Edited body'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await persistenceService.save(session, revision);

    const diskContent = await fileSystem.readFile(page.path);
    expect(diskContent).toContain('Edited body');

    const updated = vault.getPage(page.id);
    expect(updated).toBeDefined();
    expect(updated!.id).toBe(page.id);
    expect(updated!.source.markdown).toBe('Edited body');
  });

  it('preserves unrelated metadata (icon, favorite) across a content-only save', async () => {
    const page = buildPage();
    const { vault, saveCoordinator, persistenceService, session } = setup(page);

    session.commit(new DocumentTransaction('New content'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await persistenceService.save(session, revision);

    const updated = vault.getPage(page.id)!;
    expect(updated.metadata.icon).toBe('📝');
    expect(updated.metadata.favorite).toBe(true);
  });

  it('updates updatedAt to a fresh timestamp when the original had none', async () => {
    const page = buildPage();
    expect(page.metadata.updatedAt).toBeNull();
    const { vault, saveCoordinator, persistenceService, session } = setup(page);

    session.commit(new DocumentTransaction('New content'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await persistenceService.save(session, revision);

    const updated = vault.getPage(page.id)!;
    expect(updated.metadata.updatedAt).not.toBeNull();
    expect(() => new Date(updated.metadata.updatedAt as string).toISOString()).not.toThrow();
  });

  it('re-derives analysis (tags/tasks) from the newly saved markdown', async () => {
    const page = buildPage();
    const { vault, saveCoordinator, persistenceService, session } = setup(page);

    session.commit(new DocumentTransaction('New body #project\n- [ ] follow up'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await persistenceService.save(session, revision);

    const updated = vault.getPage(page.id)!;
    expect(updated.analysis.tags.map((t) => t.name)).toContain('project');
    expect(updated.analysis.tasks).toHaveLength(1);
    expect(updated.analysis.tasks[0]?.text).toBe('follow up');
    expect(Array.from(vault.tags()).map((t) => t.name)).toContain('project');
  });

  it('marks the session saved and clean after a successful save', async () => {
    const page = buildPage();
    const { saveCoordinator, persistenceService, session } = setup(page);

    session.commit(new DocumentTransaction('New content'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await persistenceService.save(session, revision);

    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(false);
    expect(session.savedRevision).toBe(revision);
  });

  it('is a no-op when the supplied revision is already stale at call time', async () => {
    const page = buildPage();
    const { vault, saveCoordinator, persistenceService, session } = setup(page);

    session.commit(new DocumentTransaction('First edit'));
    const staleRevision = session.currentRevision;
    session.commit(new DocumentTransaction('Second edit'));
    saveCoordinator.beginSave(session);

    await persistenceService.save(session, staleRevision);

    // The stale revision must not have been persisted anywhere.
    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
  });
});

describe('PersistenceService.save() failure behavior', () => {
  it('propagates writeFile failures, marks the session as SaveError, and does not touch the vault', async () => {
    const page = buildPage();
    const { vault, fileSystem, saveCoordinator, persistenceService, session } = setup(page);
    fileSystem.writeFile = async () => {
      throw new Error('disk full');
    };

    session.commit(new DocumentTransaction('New content'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await expect(persistenceService.save(session, revision)).rejects.toThrow('disk full');

    expect(session.state).toBe(DocumentState.SaveError);
    // Vault must remain on the pre-save page since the write never succeeded.
    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
  });

  it('FIXED: no longer writes to disk or throws an uncaught error when the page has been removed from the vault mid-save', async () => {
    const page = buildPage();
    const { vault, fileSystem, saveCoordinator, persistenceService, session } = setup(page);
    const diskBefore = await fileSystem.readFile(page.path);

    // Simulate the page having been removed from the vault (e.g. deleted
    // externally) between when editing started and when save() runs.
    vault.removePage(page.id);

    session.commit(new DocumentTransaction('New content'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    // Previously this rejected with "Cannot replace unknown page" after
    // already having written the new content to disk. PagePersistenceCoordinator
    // now checks the Vault for the current page before writing anything, so
    // save() resolves cleanly (as an abandoned/failed save) and disk is left
    // untouched — no split-brain state between disk and the vault.
    await expect(persistenceService.save(session, revision)).resolves.toBeUndefined();

    expect(session.state).toBe(DocumentState.SaveError);
    expect(vault.getPage(page.id)).toBeUndefined();

    const diskAfter = await fileSystem.readFile(page.path);
    expect(diskAfter).toBe(diskBefore);
    expect(diskAfter).not.toContain('New content');
  });
});
