import { describe, expect, it } from 'vitest';
import { resolveFolderPathOrRoot } from './resolveFolderPathOrRoot';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import type { Folder } from '../vault/models/Folder';

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

function makeVault(folders: Folder[] = []): Vault {
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

describe('resolveFolderPathOrRoot', () => {
  it('returns the vault root when folderId is null', () => {
    expect(resolveFolderPathOrRoot(makeVault(), null)).toBe(ROOT);
  });

  it('returns the folder path for a known folderId', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);

    expect(resolveFolderPathOrRoot(makeVault([folder]), 'folder-1')).toBe(
      `${ROOT}/Projects`
    );
  });

  it('throws for an unknown folderId', () => {
    expect(() => resolveFolderPathOrRoot(makeVault(), 'does-not-exist')).toThrow(
      /Folder not found: does-not-exist/
    );
  });
});
