import { describe, expect, it } from 'vitest';
import { VaultQuery } from './VaultQuery';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import type { Folder } from '../models/Folder';

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

function makeVault(folders: Folder[]): Vault {
  return new Vault(
    ROOT,
    [],
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
});
