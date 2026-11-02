import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';

// The Gate registers a folder it has just created. Sync can register the same path first: the OS watcher reports the new
// directory within ~10 ms, and the Gate's own marker write takes about as long (ADR-067, "First real-app run"). The
// Gate accepts that registration only when it is demonstrably the echo of this very create, and refuses every genuine
// conflict exactly as before.

const ROOT = '/vault';

const metadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: null,
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

const folder = (id: string, path: string, parentId: string | null = null): Folder => ({
  id,
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  parentId,
  metadata,
});

function setup(folders: Folder[]) {
  const vault = new Vault(ROOT, [], folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );

  return { vault, fileSystem, coordinator };
}

const document = (id: string) => `---\nid: ${id}\nicon: 👋\n---\n`;
const createFolderOp = (path: string, id: string, parentId: string | null = null) =>
  ({ kind: 'create-folder' as const, path, parentId, content: document(id) });

const PATH = `${ROOT}/Welcome`;
const foldersAtPath = (vault: Vault) => [...vault.folders()].filter((f) => f.path === PATH);

describe('create-folder when Sync registered the same path first', () => {
  it('adopts the path-derived registration Sync made: one folder remains, under the id the written .folder.md carries', async () => {
    const { vault, fileSystem, coordinator } = setup([folder(PATH, PATH)]);

    const result = await coordinator.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'));

    expect(result.status).toBe('folder-created');
    expect(result.status === 'folder-created' && result.folder.id).toBe('shipped-id');
    expect(foldersAtPath(vault).map((f) => f.id)).toEqual(['shipped-id']);
    expect(vault.getFolder(PATH)).toBeUndefined();
    expect(fileSystem.hasFileSync(`${PATH}/.folder.md`)).toBe(true);
  });

  it('is idempotent when Sync already registered it under the very id that was written', async () => {
    const { vault, coordinator } = setup([folder('shipped-id', PATH)]);

    const result = await coordinator.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'));

    expect(result.status).toBe('folder-created');
    expect(foldersAtPath(vault).map((f) => f.id)).toEqual(['shipped-id']);
  });

  it('adopts under the same parent only: a registration under a different parent is a genuine conflict', async () => {
    const parent = folder('parent', `${ROOT}/Outer`);
    const { vault, coordinator } = setup([parent, folder(`${ROOT}/Outer/Welcome`, `${ROOT}/Outer/Welcome`, 'parent')]);

    const result = await coordinator.enqueue('shipped-id', createFolderOp(`${ROOT}/Outer/Welcome`, 'shipped-id', null));

    expect(result.status).toBe('abandoned');
    expect(vault.getFolder(`${ROOT}/Outer/Welcome`)?.parentId).toBe('parent');
  });

  it('REFUSES a genuine conflict: another folder with its own persisted id at that path', async () => {
    const { vault, coordinator } = setup([folder('someone-elses-id', PATH)]);

    const result = await coordinator.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'));

    expect(result.status).toBe('abandoned');
    expect(foldersAtPath(vault).map((f) => f.id)).toEqual(['someone-elses-id']);
  });

  it('REFUSES when the path-derived folder already has content under it: it is not a fresh echo', async () => {
    const withChild = [folder(PATH, PATH), folder(`${PATH}/Inner`, `${PATH}/Inner`, PATH)];
    const { vault, coordinator } = setup(withChild);

    const result = await coordinator.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'));

    expect(result.status).toBe('abandoned');
    expect(foldersAtPath(vault).map((f) => f.id)).toEqual([PATH]);
    expect(vault.getFolder(`${PATH}/Inner`)).toBeDefined();
  });

  it('REFUSES when a page is already registered under the path-derived folder', async () => {
    const { vault, coordinator } = setup([folder(PATH, PATH)]);
    vault.addPage(
      new PageBuilder().build({
        parentId: PATH,
        page: {
          path: `${PATH}/Note.md`,
          directoryPath: PATH,
          frontmatter: { id: 'note' },
          frontmatterAnalysis: { aliases: [] },
          content: 'Body',
          analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
        },
      })
    );

    const result = await coordinator.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'));

    expect(result.status).toBe('abandoned');
    expect(vault.getPage('note')).toBeDefined();
  });

  it('REFUSES a case-variant path, as before: only the exact path is ever adopted', async () => {
    const { vault, coordinator } = setup([folder(`${ROOT}/welcome`, `${ROOT}/welcome`)]);

    const result = await coordinator.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'));

    expect(result.status).toBe('abandoned');
    expect(vault.getFolder(`${ROOT}/welcome`)).toBeDefined();
  });

  it('never adopts over a marker it did not write: an existing .folder.md refuses the create-only write first', async () => {
    const { vault, fileSystem } = setup([folder(PATH, PATH)]);
    await fileSystem.createDirectory(PATH);
    await fileSystem.writeFile(`${PATH}/.folder.md`, 'USER FOLDER');
    // The in-memory double ignores write intent, so state what the production stack guarantees: a create-only write that
    // finds a file there throws before the Vault is touched.
    const refusing = Object.create(fileSystem) as InMemoryVaultFileSystem;
    refusing.writeFile = async () => { throw new Error('destinationExists'); };
    const guarded = new PagePersistenceCoordinator(refusing, vault, new FrontmatterSerializer(), new FrontmatterParser(), new PageRebuilder(), new MoveService(vault, refusing));

    await expect(guarded.enqueue('shipped-id', createFolderOp(PATH, 'shipped-id'))).rejects.toThrow('destinationExists');

    expect(foldersAtPath(vault).map((f) => f.id)).toEqual([PATH]);
  });
});
