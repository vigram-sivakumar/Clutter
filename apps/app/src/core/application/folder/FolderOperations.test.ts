import { describe, expect, it } from 'vitest';
import { FolderOperations } from './FolderOperations';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
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

describe('FolderOperations.open()', () => {
  it('opens the folder in the workspace', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const workspace = new Workspace();
    const folderOperations = new FolderOperations(vault, workspace);

    await folderOperations.open('folder-1');

    expect(workspace.activeFolderId).toBe('folder-1');
  });

  it('throws for an unknown folder id', async () => {
    const vault = makeVault([]);
    const workspace = new Workspace();
    const folderOperations = new FolderOperations(vault, workspace);

    await expect(folderOperations.open('does-not-exist')).rejects.toThrow(
      /Folder not found/
    );
  });
});
