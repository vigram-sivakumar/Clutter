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
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { InFlightPaths } from '../providers/InFlightPaths';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { MoveFileOptions, VaultFileSystem } from '../providers/VaultFileSystem';

const ROOT = '/vault';
const ARCHIVE = `${ROOT}/Archive`;

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

const sourceFolders: Folder[] = ['One', 'Two', 'Three'].map((name) => ({
  id: `folder-${name}`,
  name,
  path: `${ROOT}/${name}`,
  parentId: null,
  metadata: folderMetadata,
}));

const archiveFolder: Folder = { id: 'folder-archive', name: 'Archive', path: ARCHIVE, parentId: null, metadata: folderMetadata };

function page(id: string, path: string, body: string): Page {
  return new PageBuilder().build({
    parentId: `folder-${path.split('/')[2]}`,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

/** Wraps a filesystem so a test can hold chosen moves until it lets them through, or make them fail. */
class ControlledFileSystem implements VaultFileSystem {
  holdMoves: Promise<void> | null = null;
  failMovesWith: Error | null = null;
  readonly moves: string[] = [];

  constructor(private readonly inner: InMemoryVaultFileSystem) {}

  exists(path: string) {
    return this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  readDirectory(path: string) {
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
  copyFile(source: string, destination: string) {
    return this.inner.copyFile(source, destination);
  }
  async moveFile(source: string, destination: string, options?: MoveFileOptions) {
    this.moves.push(`${source}->${destination}`);
    await this.holdMoves;
    if (this.failMovesWith) {
      throw this.failMovesWith;
    }
    return this.inner.moveFile(source, destination, options);
  }
}

function setup(pages: Page[]) {
  const vault = new Vault(ROOT, pages, [archiveFolder, ...sourceFolders], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const inner = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const p of pages) {
    inner.seedFile(p.path, serializer.serializeDocument(p, p.source.markdown));
  }
  const fileSystem = new ControlledFileSystem(inner);
  const inFlight = new InFlightPaths();
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    serializer,
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem),
    undefined,
    inFlight
  );

  return { vault, inner, fileSystem, coordinator, inFlight };
}

const SAME_NAME = [
  page('p1', `${ROOT}/One/Paragraph.md`, 'body one'),
  page('p2', `${ROOT}/Two/Paragraph.md`, 'body two'),
  page('p3', `${ROOT}/Three/Paragraph.md`, 'body three'),
];

/** Every page id resolves by path to itself, and no two ids share a path: the two indexes agree. */
function expectIndexesConsistent(vault: Vault, ids: string[]) {
  const paths = ids.map((id) => vault.getPage(id)!.path.toLowerCase());
  expect(new Set(paths).size).toBe(ids.length);
  for (const id of ids) {
    expect(vault.getPageByPath(vault.getPage(id)!.path)?.id).toBe(id);
  }
}

describe('archiving pages concurrently', () => {
  it('gives pages with identical titles distinct destinations, and overwrites no file', async () => {
    const { vault, inner, coordinator } = setup(SAME_NAME);

    const results = await Promise.all(SAME_NAME.map((p) => coordinator.enqueue(p.id, { kind: 'archive' })));

    expect(results.map((result) => result.status)).toEqual(['saved', 'saved', 'saved']);
    const paths = SAME_NAME.map((p) => vault.getPage(p.id)!.path);
    expect(new Set(paths.map((path) => path.toLowerCase())).size).toBe(3);
    expect(paths.every((path) => path.startsWith(`${ARCHIVE}/Paragraph`))).toBe(true);
    // One keeps the plain name (the common case is unchanged); the others carry the existing timestamp suffix.
    expect(paths.filter((path) => path === `${ARCHIVE}/Paragraph.md`)).toHaveLength(1);
    expect(paths.filter((path) => /Paragraph \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}(\.\d{2})?\.md$/.test(path))).toHaveLength(2);

    // Each file on disk is its own page's: the right id and the right body, none replaced by another's.
    for (const p of SAME_NAME) {
      const onDisk = await inner.readFile(vault.getPage(p.id)!.path);
      expect(onDisk).toContain(`id: ${p.id}`);
      expect(onDisk).toContain(p.source.markdown);
    }
    for (const p of SAME_NAME) {
      expect(inner.hasFileSync(p.path)).toBe(false);
    }
    expectIndexesConsistent(vault, ['p1', 'p2', 'p3']);
  });

  it('chooses a free name when an untracked file is already on disk at the plain destination, leaving that file as it was', async () => {
    const { vault, inner, coordinator } = setup([SAME_NAME[0]!]);
    inner.seedFile(`${ARCHIVE}/Paragraph.md`, 'an orphan the vault does not know about');

    const result = await coordinator.enqueue('p1', { kind: 'archive' });

    expect(result.status).toBe('saved');
    expect(await inner.readFile(`${ARCHIVE}/Paragraph.md`)).toBe('an orphan the vault does not know about');
    expect(vault.getPage('p1')!.path).not.toBe(`${ARCHIVE}/Paragraph.md`);
    expect(inner.hasFileSync(vault.getPage('p1')!.path)).toBe(true);
    expectIndexesConsistent(vault, ['p1']);
  });

  it('refuses the move itself, in the filesystem, rather than checking and then replacing', async () => {
    const { fileSystem, inner } = setup([SAME_NAME[0]!]);
    inner.seedFile(`${ARCHIVE}/taken.md`, 'x');
    inner.seedFile(`${ROOT}/src.md`, 'y');

    await expect(fileSystem.moveFile(`${ROOT}/src.md`, `${ARCHIVE}/taken.md`, { noClobber: true })).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await inner.readFile(`${ARCHIVE}/taken.md`)).toBe('x');
    expect(await inner.readFile(`${ROOT}/src.md`)).toBe('y');
  });

  it('serializes repeated requests for one page: the first archives it, the second reports it is already archived', async () => {
    const { vault, coordinator } = setup([SAME_NAME[0]!]);

    const [first, second] = await Promise.allSettled([
      coordinator.enqueue('p1', { kind: 'archive' }),
      coordinator.enqueue('p1', { kind: 'archive' }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason.message).toMatch(/already archived/);
    expect(vault.getPage('p1')!.path).toBe(`${ARCHIVE}/Paragraph.md`);
    expectIndexesConsistent(vault, ['p1']);
  });

  it('keeps each source and destination in flight, for Sync, from the move until the Vault is updated — and no longer', async () => {
    const { vault, fileSystem, coordinator, inFlight } = setup([SAME_NAME[0]!]);
    let release!: () => void;
    fileSystem.holdMoves = new Promise<void>((resolve) => {
      release = resolve;
    });

    const archiving = coordinator.enqueue('p1', { kind: 'archive' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(inFlight.covers(`${ROOT}/One/Paragraph.md`)).toBe(true);
    expect(inFlight.covers(`${ARCHIVE}/Paragraph.md`)).toBe(true);
    // The Vault has not been told yet: this is exactly the window a watcher event must not be acted on in.
    expect(vault.getPage('p1')!.path).toBe(`${ROOT}/One/Paragraph.md`);

    release();
    await archiving;

    expect(inFlight.covers(`${ROOT}/One/Paragraph.md`)).toBe(false);
    expect(inFlight.covers(`${ARCHIVE}/Paragraph.md`)).toBe(false);
  });

  it('a failed archive changes nothing, and releases its claim and its in-flight mark so the name is free again', async () => {
    const { vault, inner, fileSystem, coordinator, inFlight } = setup([SAME_NAME[0]!, SAME_NAME[1]!]);
    fileSystem.failMovesWith = new Error('disk said no');

    await expect(coordinator.enqueue('p1', { kind: 'archive' })).rejects.toThrow('disk said no');

    expect(vault.getPage('p1')!.path).toBe(`${ROOT}/One/Paragraph.md`);
    expect(inner.hasFileSync(`${ROOT}/One/Paragraph.md`)).toBe(true);
    expect(inFlight.covers(`${ARCHIVE}/Paragraph.md`)).toBe(false);

    fileSystem.failMovesWith = null;
    await coordinator.enqueue('p2', { kind: 'archive' });
    expect(vault.getPage('p2')!.path).toBe(`${ARCHIVE}/Paragraph.md`);
    expectIndexesConsistent(vault, ['p1', 'p2']);
  });

  it('archive followed by restore puts every same-named page back where it was, with consistent indexes', async () => {
    const { vault, coordinator } = setup(SAME_NAME);
    await Promise.all(SAME_NAME.map((p) => coordinator.enqueue(p.id, { kind: 'archive' })));

    for (const p of SAME_NAME) {
      const result = await coordinator.enqueue(p.id, { kind: 'restore' });
      expect(result.status).toBe('saved');
    }

    for (const p of SAME_NAME) {
      expect(vault.getPage(p.id)!.path).toBe(p.path);
    }
    expectIndexesConsistent(vault, ['p1', 'p2', 'p3']);
  });
});

describe('archiving folders and files concurrently', () => {
  it('gives same-named folders distinct destinations, each holding its own contents', async () => {
    const folderNamed = (id: string, parent: string): Folder => ({
      id,
      name: 'Project',
      path: `${ROOT}/${parent}/Project`,
      parentId: `folder-${parent}`,
      metadata: folderMetadata,
    });
    const folders = [folderNamed('fp1', 'One'), folderNamed('fp2', 'Two')];
    const vault = new Vault(
      ROOT,
      [],
      [archiveFolder, ...sourceFolders, ...folders],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder()
    );
    const inner = new InMemoryVaultFileSystem();
    for (const folder of folders) {
      await inner.createDirectory(folder.path);
      inner.seedFile(`${folder.path}/.folder.md`, `---\nid: ${folder.id}\n---\n`);
      inner.seedFile(`${folder.path}/note-of-${folder.id}.md`, `---\nid: n-${folder.id}\n---\nbody`);
    }
    const coordinator = new PagePersistenceCoordinator(
      inner,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      new MoveService(vault, inner)
    );

    await Promise.all(folders.map((folder) => coordinator.enqueue(folder.id, { kind: 'archive-folder' })));

    const paths = folders.map((folder) => vault.getFolder(folder.id)!.path);
    expect(new Set(paths.map((path) => path.toLowerCase())).size).toBe(2);
    expect(paths.filter((path) => path === `${ARCHIVE}/Project`)).toHaveLength(1);
    for (const folder of folders) {
      const archivedPath = vault.getFolder(folder.id)!.path;
      expect(await inner.readFile(`${archivedPath}/.folder.md`)).toContain(`id: ${folder.id}`);
      expect(inner.hasFileSync(`${archivedPath}/note-of-${folder.id}.md`)).toBe(true);
    }
  });

  it('gives same-named files distinct destinations and overwrites neither', async () => {
    const resources = ['One', 'Two'].map((parent, index) => ({
      id: `r${index + 1}`,
      kind: 'image' as const,
      name: 'pic.png',
      path: `${ROOT}/${parent}/pic.png`,
      parentId: `folder-${parent}`,
    }));
    const vault = new Vault(
      ROOT,
      [],
      [archiveFolder, ...sourceFolders],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder(),
      new Map(),
      resources
    );
    const inner = new InMemoryVaultFileSystem();
    for (const resource of resources) {
      inner.seedFile(resource.path, `bytes of ${resource.id}`);
    }
    const coordinator = new PagePersistenceCoordinator(
      inner,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      new MoveService(vault, inner)
    );

    await Promise.all(resources.map((resource) => coordinator.enqueue(resource.id, { kind: 'archive-resource' })));

    const paths = resources.map((resource) => vault.getResource(resource.id)!.path);
    expect(new Set(paths.map((path) => path.toLowerCase())).size).toBe(2);
    expect(paths.filter((path) => path === `${ARCHIVE}/pic.png`)).toHaveLength(1);
    for (const resource of resources) {
      expect(await inner.readFile(vault.getResource(resource.id)!.path)).toBe(`bytes of ${resource.id}`);
    }
  });
});

