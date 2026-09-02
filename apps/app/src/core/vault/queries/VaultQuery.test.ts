import { describe, expect, it } from 'vitest';
import { VaultQuery } from './VaultQuery';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { VaultResource } from '../models/VaultResource';

const ROOT = '/vault';

function makeFolder(
  id: string,
  name: string,
  parentId: string | null = null
): Folder {
  return {
    id,
    name,
    path: `${ROOT}/${name}`,
    parentId,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makePage(
  id: string,
  name: string,
  parentId: string | null = null
): Page {
  return {
    id,
    type: 'note',
    name,
    path: `${ROOT}/${name}.md`,
    parentId,
    metadata: {
      icon: null,
      cover: null,
      description: null,
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

function makeResource(
  id: string,
  name: string,
  kind: VaultResource['kind'],
  parentId: string | null = null
): VaultResource {
  return {
    id,
    kind,
    name,
    path: `${ROOT}/${name}`,
    parentId,
  };
}

function makeVault(
  folders: Folder[] = [],
  pages: Page[] = [],
  resources: VaultResource[] = []
): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

describe('VaultQuery folder ordering', () => {
  it('getRootFolders returns folders sorted by name, independent of insertion order', () => {
    // Insertion order deliberately not alphabetical, mirroring how a
    // scan or a mid-session Vault.addFolder might hand folders over.
    const folders = [
      makeFolder('folder-c', 'Zebra'),
      makeFolder('folder-a', 'Apple'),
      makeFolder('folder-b', 'Mango'),
    ];
    const query = new VaultQuery(makeVault(folders));

    expect(query.getRootFolders().map((f) => f.name)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('getChildFolders returns folders sorted by name, independent of insertion order', () => {
    const parent = makeFolder('parent', 'Projects');
    const folders = [
      parent,
      makeFolder('child-c', 'Zebra', 'parent'),
      makeFolder('child-a', 'Apple', 'parent'),
      makeFolder('child-b', 'Mango', 'parent'),
    ];
    const query = new VaultQuery(makeVault(folders));

    expect(query.getChildFolders('parent').map((f) => f.name)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('sorts a folder added mid-session (Vault.addFolder, which always appends) identically to a scanned one', () => {
    const vault = makeVault([
      makeFolder('folder-z', 'Zebra'),
      makeFolder('folder-a', 'Apple'),
    ]);
    const query = new VaultQuery(vault);

    // Simulates FolderOperations.create() registering a folder mid-session,
    // the same way the Gate's runCreateFolder does via Vault.addFolder —
    // always an append, never insertion-sorted.
    vault.addFolder(makeFolder('folder-m', 'Mango'));

    expect(query.getRootFolders().map((f) => f.name)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('accepts an explicit sortMode, not just the default', () => {
    const folders = [
      makeFolder('folder-z', 'Zebra'),
      makeFolder('folder-a', 'Apple'),
    ];
    const query = new VaultQuery(makeVault(folders));

    // Only 'title' exists today, but this proves getRootFolders/
    // getChildFolders actually take the mode as a real parameter (not just
    // default it silently) — the seam a future Sort control plugs into
    // without either signature changing.
    expect(query.getRootFolders('title').map((f) => f.name)).toEqual([
      'Apple',
      'Zebra',
    ]);
  });

  it('sorts numeric suffixes naturally, not lexicographically', () => {
    // Plain string comparison would put "Project 10" before "Project 2"
    // (lexicographic: '1' < '2'). Natural sort must not.
    const folders = [
      makeFolder('folder-10', 'Project 10'),
      makeFolder('folder-1', 'Project'),
      makeFolder('folder-2', 'Project 2'),
    ];
    const query = new VaultQuery(makeVault(folders));

    expect(query.getRootFolders().map((f) => f.name)).toEqual([
      'Project',
      'Project 2',
      'Project 10',
    ]);
  });

  it('sorts duplicate "copy" names naturally, grouped with their source', () => {
    const folders = [
      makeFolder('folder-copy10', 'Project copy 10'),
      makeFolder('folder-base', 'Project'),
      makeFolder('folder-copy2', 'Project copy 2'),
      makeFolder('folder-copy', 'Project copy'),
    ];
    const query = new VaultQuery(makeVault(folders));

    expect(query.getRootFolders().map((f) => f.name)).toEqual([
      'Project',
      'Project copy',
      'Project copy 2',
      'Project copy 10',
    ]);
  });
});

describe('VaultQuery.getRootPages', () => {
  it('returns pages whose parentId is null', () => {
    const rootPage = makePage('page-1', 'Root Note', null);
    const query = new VaultQuery(makeVault([], [rootPage]));

    expect(query.getRootPages().map((p) => p.id)).toEqual(['page-1']);
  });

  it('excludes a page that belongs to a folder', () => {
    const folder = makeFolder('folder-1', 'Projects');
    const nestedPage = makePage('page-1', 'Nested Note', 'folder-1');
    const query = new VaultQuery(makeVault([folder], [nestedPage]));

    expect(query.getRootPages()).toEqual([]);
  });

  it('returns pages sorted by name, independent of insertion order', () => {
    // Insertion order deliberately not alphabetical, mirroring how a scan
    // or a mid-session Vault.addPage (startup scan order / fs-watcher
    // arrival order, respectively) might hand pages over.
    const pages = [
      makePage('page-z', 'Zebra', null),
      makePage('page-a', 'Apple', null),
      makePage('page-m', 'Mango', null),
    ];
    const query = new VaultQuery(makeVault([], pages));

    expect(query.getRootPages().map((p) => p.name)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('sorts numeric suffixes naturally, not lexicographically', () => {
    const pages = [
      makePage('page-10', 'Project 10', null),
      makePage('page-1', 'Project', null),
      makePage('page-2', 'Project 2', null),
    ];
    const query = new VaultQuery(makeVault([], pages));

    expect(query.getRootPages().map((p) => p.name)).toEqual([
      'Project',
      'Project 2',
      'Project 10',
    ]);
  });

  it('sorts duplicate "copy" names naturally, grouped with their source', () => {
    const pages = [
      makePage('page-copy10', 'Project copy 10', null),
      makePage('page-base', 'Project', null),
      makePage('page-copy2', 'Project copy 2', null),
      makePage('page-copy', 'Project copy', null),
    ];
    const query = new VaultQuery(makeVault([], pages));

    expect(query.getRootPages().map((p) => p.name)).toEqual([
      'Project',
      'Project copy',
      'Project copy 2',
      'Project copy 10',
    ]);
  });
});

describe('VaultQuery.getChildPages', () => {
  it('returns pages sorted by name, independent of insertion order', () => {
    const folder = makeFolder('folder-1', 'Projects');
    const pages = [
      makePage('page-z', 'Zebra', 'folder-1'),
      makePage('page-a', 'Apple', 'folder-1'),
      makePage('page-m', 'Mango', 'folder-1'),
    ];
    const query = new VaultQuery(makeVault([folder], pages));

    expect(query.getChildPages('folder-1').map((p) => p.name)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });

  it('sorts a page added mid-session (Vault.addPage, which always appends) identically to a scanned one', () => {
    const folder = makeFolder('folder-1', 'Projects');
    const vault = makeVault(
      [folder],
      [
        makePage('page-z', 'Zebra', 'folder-1'),
        makePage('page-a', 'Apple', 'folder-1'),
      ]
    );
    const query = new VaultQuery(vault);

    // Simulates the fs-watcher's create-event handler (VaultSyncService)
    // appending a newly discovered/duplicated page — always an append,
    // never insertion-sorted.
    vault.addPage(makePage('page-m', 'Mango', 'folder-1'));

    expect(query.getChildPages('folder-1').map((p) => p.name)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });
});

describe('VaultQuery.getRootResources', () => {
  it('returns resources whose parentId is null', () => {
    const rootResource = makeResource('resource-1', 'Cover.png', 'image', null);
    const query = new VaultQuery(makeVault([], [], [rootResource]));

    expect(query.getRootResources().map((r) => r.id)).toEqual(['resource-1']);
  });

  it('excludes a resource that belongs to a folder', () => {
    const folder = makeFolder('folder-1', 'Assets');
    const nestedResource = makeResource('resource-1', 'Cover.png', 'image', 'folder-1');
    const query = new VaultQuery(makeVault([folder], [], [nestedResource]));

    expect(query.getRootResources()).toEqual([]);
  });

  it('returns an empty list when there are no resources', () => {
    const query = new VaultQuery(makeVault());

    expect(query.getRootResources()).toEqual([]);
  });

  it('returns resources sorted by name, independent of insertion order', () => {
    const resources = [
      makeResource('resource-z', 'Zebra.png', 'image', null),
      makeResource('resource-a', 'Apple.pdf', 'pdf', null),
      makeResource('resource-m', 'Mango.svg', 'image', null),
    ];
    const query = new VaultQuery(makeVault([], [], resources));

    expect(query.getRootResources().map((r) => r.name)).toEqual([
      'Apple.pdf',
      'Mango.svg',
      'Zebra.png',
    ]);
  });
});

describe('VaultQuery.getChildResources', () => {
  it('returns exactly the supported resources belonging to a folder', () => {
    const assets = makeFolder('assets-folder', 'Assets');
    const resources = [
      makeResource('house', 'house.png', 'image', 'assets-folder'),
      makeResource('logo', 'logo.svg', 'image', 'assets-folder'),
      makeResource('brochure', 'brochure.pdf', 'pdf', 'assets-folder'),
    ];
    const query = new VaultQuery(makeVault([assets], [], resources));

    expect(query.getChildResources('assets-folder').map((r) => r.name)).toEqual([
      'brochure.pdf',
      'house.png',
      'logo.svg',
    ]);
  });

  it('keeps pages and resources separate within the same folder', () => {
    const notes = makeFolder('notes-folder', 'Notes');
    const page = makePage('page-1', 'Ideas', 'notes-folder');
    const resource = makeResource('resource-1', 'Cover.png', 'image', 'notes-folder');
    const query = new VaultQuery(makeVault([notes], [page], [resource]));

    expect(query.getChildPages('notes-folder').map((p) => p.id)).toEqual(['page-1']);
    expect(query.getChildResources('notes-folder').map((r) => r.id)).toEqual([
      'resource-1',
    ]);
  });

  it('excludes resources belonging to a different folder', () => {
    const assets = makeFolder('assets-folder', 'Assets');
    const notes = makeFolder('notes-folder', 'Notes');
    const resources = [
      makeResource('house', 'house.png', 'image', 'assets-folder'),
      makeResource('unrelated', 'unrelated.pdf', 'pdf', 'notes-folder'),
    ];
    const query = new VaultQuery(makeVault([assets, notes], [], resources));

    expect(query.getChildResources('assets-folder').map((r) => r.id)).toEqual(['house']);
  });

  it('does not return a nested folder\'s resources as direct children of its ancestor', () => {
    const assets = makeFolder('assets-folder', 'Assets');
    const nested = makeFolder('nested-folder', 'Nested', 'assets-folder');
    const nestedResource = makeResource('nested-resource', 'deep.png', 'image', 'nested-folder');
    const query = new VaultQuery(makeVault([assets, nested], [], [nestedResource]));

    expect(query.getChildResources('assets-folder')).toEqual([]);
    expect(query.getChildResources('nested-folder').map((r) => r.id)).toEqual([
      'nested-resource',
    ]);
  });

  it('returns an empty list for a folder with no resources', () => {
    const empty = makeFolder('empty-folder', 'Empty');
    const query = new VaultQuery(makeVault([empty]));

    expect(query.getChildResources('empty-folder')).toEqual([]);
  });

  it('returns resources sorted by name, independent of insertion order', () => {
    const folder = makeFolder('folder-1', 'Assets');
    const resources = [
      makeResource('resource-z', 'Zebra.png', 'image', 'folder-1'),
      makeResource('resource-a', 'Apple.pdf', 'pdf', 'folder-1'),
      makeResource('resource-m', 'Mango.svg', 'image', 'folder-1'),
    ];
    const query = new VaultQuery(makeVault([folder], [], resources));

    expect(query.getChildResources('folder-1').map((r) => r.name)).toEqual([
      'Apple.pdf',
      'Mango.svg',
      'Zebra.png',
    ]);
  });
});

describe('VaultQuery.getAllResources', () => {
  it('returns every resource in the vault regardless of parent folder', () => {
    const assets = makeFolder('assets-folder', 'Assets');
    const research = makeFolder('research-folder', 'Research');
    const resources = [
      makeResource('house', 'house.png', 'image', 'assets-folder'),
      makeResource('paper', 'paper.pdf', 'pdf', 'research-folder'),
      makeResource('root-photo', 'root.png', 'image', null),
    ];
    const query = new VaultQuery(makeVault([assets, research], [], resources));

    expect(query.getAllResources().map((r) => r.id)).toEqual(
      expect.arrayContaining(['house', 'paper', 'root-photo'])
    );
    expect(query.getAllResources()).toHaveLength(3);
  });

  it('returns resources sorted by name, independent of insertion order', () => {
    const resources = [
      makeResource('resource-z', 'Zebra.png', 'image', null),
      makeResource('resource-a', 'Apple.pdf', 'pdf', null),
      makeResource('resource-m', 'Mango.svg', 'image', null),
    ];
    const query = new VaultQuery(makeVault([], [], resources));

    expect(query.getAllResources().map((r) => r.name)).toEqual([
      'Apple.pdf',
      'Mango.svg',
      'Zebra.png',
    ]);
  });

  it('returns an empty list when there are no resources', () => {
    const query = new VaultQuery(makeVault());

    expect(query.getAllResources()).toEqual([]);
  });
});

describe('VaultQuery.getPagesByTag', () => {
  function withTag(page: Page, tagName: string): Page {
    return {
      ...page,
      analysis: {
        ...page.analysis,
        tags: [{ name: tagName, sourcePageId: page.id }],
      },
    };
  }

  it('returns exactly the pages referencing the given tag, by exact name match', () => {
    const tagged = withTag(makePage('page-1', 'Tagged'), 'Project');
    const untagged = makePage('page-2', 'Untagged');
    const query = new VaultQuery(makeVault([], [tagged, untagged]));

    expect(query.getPagesByTag('Project').map((p) => p.id)).toEqual(['page-1']);
  });

  it('returns an empty array when no page references the tag', () => {
    const query = new VaultQuery(makeVault([], [makePage('page-1', 'Untagged')]));

    expect(query.getPagesByTag('nonexistent')).toEqual([]);
  });
});
