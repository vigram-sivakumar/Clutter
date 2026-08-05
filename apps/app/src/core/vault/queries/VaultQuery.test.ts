import { describe, expect, it } from 'vitest';
import { VaultQuery } from './VaultQuery';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';

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

function makeVault(folders: Folder[] = [], pages: Page[] = []): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
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

  it('getVisibleRootFolders stays sorted after filtering out reserved folders', () => {
    const folders = [
      makeFolder('folder-z', 'Zebra'),
      makeFolder('folder-a', 'Apple'),
      { ...makeFolder('folder-archive', 'Archive'), parentId: null },
    ];
    const query = new VaultQuery(makeVault(folders));

    expect(query.getVisibleRootFolders().map((f) => f.name)).toEqual([
      'Apple',
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
    // getChildFolders/getVisibleRootFolders actually take the mode as a
    // real parameter (not just default it silently) — the seam a future
    // Sort control plugs into without any of these signatures changing.
    expect(query.getRootFolders('title').map((f) => f.name)).toEqual([
      'Apple',
      'Zebra',
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

  it('applies no ordering — mirrors getChildPages exactly, deliberately unsorted', () => {
    // Insertion order deliberately not alphabetical. Unlike
    // getRootFolders, this is NOT expected to come out sorted — page
    // ordering (root or nested) is an unresolved product decision, not
    // something to define for root pages ahead of nested ones.
    const pages = [
      makePage('page-z', 'Zebra', null),
      makePage('page-a', 'Apple', null),
      makePage('page-m', 'Mango', null),
    ];
    const query = new VaultQuery(makeVault([], pages));

    expect(query.getRootPages().map((p) => p.name)).toEqual([
      'Zebra',
      'Apple',
      'Mango',
    ]);
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
