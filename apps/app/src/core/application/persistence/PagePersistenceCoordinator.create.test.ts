import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from '../move/MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

function makeVault(pages: Page[] = []): Vault {
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

function setup(pages: Page[] = []) {
  const vault = makeVault(pages);
  const fileSystem = new InMemoryVaultFileSystem();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );

  return { vault, fileSystem, coordinator };
}

function noteDocument(id: string, body: string): string {
  return `---\nid: ${id}\n---\n${body}`;
}

describe('PagePersistenceCoordinator create vertical slice', () => {
  it('writes the file and registers a new page in the vault with derived metadata', async () => {
    const { vault, fileSystem, coordinator } = setup();

    const result = await coordinator.enqueue('page-new', {
      kind: 'create',
      path: `${ROOT}/Untitled.md`,
      parentId: null,
      content: noteDocument('page-new', '- [ ] Buy milk'),
    });

    expect(result.status).toBe('saved');
    expect(fileSystem.hasFileSync(`${ROOT}/Untitled.md`)).toBe(true);

    const created = vault.getPage('page-new');
    expect(created).toBeDefined();
    expect(created!.path).toBe(`${ROOT}/Untitled.md`);
    expect(created!.parentId).toBeNull();
    expect(created!.source.markdown).toBe('- [ ] Buy milk');
    expect(created!.analysis.tasks).toHaveLength(1);
  });

  it('abandons the operation, without wedging the queue, when the path collides with an existing page', async () => {
    const existing = new PageBuilder().build({
      parentId: null,
      page: {
        path: `${ROOT}/Occupied.md`,
        directoryPath: ROOT,
        frontmatter: { id: 'existing-page' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Already here',
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
    const { vault, coordinator } = setup([existing]);

    const result = await coordinator.enqueue('page-new', {
      kind: 'create',
      path: `${ROOT}/Occupied.md`,
      parentId: null,
      content: noteDocument('page-new', 'Colliding content'),
    });

    expect(result.status).toBe('abandoned');
    expect(vault.getPage('page-new')).toBeUndefined();
    expect(vault.getPage('existing-page')!.source.markdown).toBe('Already here');

    // The queue isn't wedged by the abandoned operation — a subsequent
    // operation for a different id still runs normally.
    const followUp = await coordinator.enqueue('page-another', {
      kind: 'create',
      path: `${ROOT}/Another.md`,
      parentId: null,
      content: noteDocument('page-another', 'Fresh content'),
    });
    expect(followUp.status).toBe('saved');
    expect(vault.getPage('page-another')).toBeDefined();
  });

  it('does not block or get blocked by an operation enqueued for a different page id', async () => {
    const existing = new PageBuilder().build({
      parentId: null,
      page: {
        path: `${ROOT}/Existing.md`,
        directoryPath: ROOT,
        frontmatter: { id: 'existing-page' },
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
    const { vault, coordinator } = setup([existing]);

    const [saveResult, createResult] = await Promise.all([
      coordinator.enqueue('existing-page', { kind: 'save', content: 'Edited body' }),
      coordinator.enqueue('page-new', {
        kind: 'create',
        path: `${ROOT}/New.md`,
        parentId: null,
        content: noteDocument('page-new', 'Brand new body'),
      }),
    ]);

    expect(saveResult.status).toBe('saved');
    expect(createResult.status).toBe('saved');
    expect(vault.getPage('existing-page')!.source.markdown).toBe('Edited body');
    expect(vault.getPage('page-new')!.source.markdown).toBe('Brand new body');
  });
});
