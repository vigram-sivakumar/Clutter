import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { PageBuilder } from '../ingest/PageBuilder';
import { resolveEffectivePageDates } from '../models/effectivePageDates';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import type { Page } from '../models/Page';

const ROOT = '/vault';
const PATH = `${ROOT}/Note.md`;
const BORN = new Date('2026-01-01T09:00:00.000Z');
const OLD_EDIT = new Date('2026-01-02T09:00:00.000Z');

const analysis = { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };

function setup(entryOrder: readonly string[] = ['id']) {
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  const page: Page = new PageBuilder().build({
    parentId: null,
    page: {
      path: PATH,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', entryOrder: [...entryOrder] },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis,
    },
  });

  fileSystem.seedFile(PATH, serializer.serializeDocument(page, 'Body'));
  fileSystem.setFileTimes(PATH, { createdAt: BORN, modifiedAt: OLD_EDIT });

  const vault = new Vault(ROOT, [page], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    serializer,
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );

  return { vault, fileSystem, coordinator };
}

describe('Gate saves and filesystem dates (ADR-057, ADR-058)', () => {
  it('refreshes fileTimes after a successful save, so Last edited moves without a rescan', async () => {
    const { vault, fileSystem, coordinator } = setup(['id', 'modified']);

    expect(vault.getPage('page-1')!.fileTimes).toBeUndefined();

    const result = await coordinator.enqueue('page-1', { kind: 'save', content: 'Edited body' });
    const written = (await fileSystem.stat(PATH)).modifiedAt!;

    expect(result.status).toBe('saved');
    const after = vault.getPage('page-1')!;
    expect(after.fileTimes).toEqual({ createdAt: BORN.toISOString(), modifiedAt: written.toISOString() });
    expect(resolveEffectivePageDates(after).updatedAt).toBe(written.toISOString());
    expect(written.getTime()).toBeGreaterThan(OLD_EDIT.getTime());
  });

  it('never writes a date into a note: with no created / modified keys none appears, however often it is saved', async () => {
    const { vault, fileSystem, coordinator } = setup();

    await coordinator.enqueue('page-1', { kind: 'save', content: 'Edited body' });
    await coordinator.enqueue('page-1', { kind: 'save', content: 'Edited again' });

    const onDisk = await fileSystem.readFile(PATH);
    expect(onDisk).not.toMatch(/^created:/m);
    expect(onDisk).not.toMatch(/^modified:/m);
    // ...while the effective dates still come from the file.
    expect(resolveEffectivePageDates(vault.getPage('page-1')!).createdAt).toBe(BORN.toISOString());
  });

  it('a note that declares Created / Last edited keeps `created: true` / `modified: true` and gains no date value', async () => {
    const { fileSystem, coordinator } = setup(['id', 'created', 'modified']);

    await coordinator.enqueue('page-1', { kind: 'save', content: 'Edited body' });
    await coordinator.enqueue('page-1', { kind: 'save', content: 'Edited again' });

    const onDisk = await fileSystem.readFile(PATH);
    expect(onDisk).toContain('created: true\nmodified: true');
    expect(onDisk).not.toMatch(/^(created|modified): \d/m);
  });
});
