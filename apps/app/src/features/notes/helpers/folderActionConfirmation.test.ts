import { describe, expect, it } from 'vitest';
import {
  getFolderArchiveConfirmation,
  getFolderDeleteConfirmation,
  PAGE_DELETE_CONFIRMATION_MESSAGE,
} from './folderActionConfirmation';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

const ROOT = '/vault';

const activeFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: activeFolderMetadata,
  };
}

function makePage(id: string, path: string, parentId: string | null = null): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1, path.length - '.md'.length),
    path,
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

function makeVault(folders: Folder[], pages: Page[] = []): Vault {
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

describe('getFolderDeleteConfirmation', () => {
  it('hasDescendants is false and the message is the plain form for an empty folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);

    const result = getFolderDeleteConfirmation(vault, 'folder-1');

    expect(result.hasDescendants).toBe(false);
    expect(result.message).toBe('This cannot be undone.');
  });

  it('hasDescendants is true and the message names counts for a non-empty folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const nestedFolder = makeFolder('folder-2', `${ROOT}/Projects/Sub`, 'folder-1');
    const nestedPage = makePage('page-1', `${ROOT}/Projects/Note.md`, 'folder-1');
    const vault = makeVault([folder, nestedFolder], [nestedPage]);

    const result = getFolderDeleteConfirmation(vault, 'folder-1');

    expect(result.hasDescendants).toBe(true);
    expect(result.message).toBe(
      'Delete this folder and everything inside it? This will permanently delete 1 folder(s) and 1 page(s). This cannot be undone.'
    );
  });
});

describe('getFolderArchiveConfirmation (unchanged by the "always confirm delete" product decision)', () => {
  it('hasDescendants is false for an empty folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);

    expect(getFolderArchiveConfirmation(vault, 'folder-1').hasDescendants).toBe(false);
  });

  it('hasDescendants is true and names counts for a non-empty folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const nestedPage = makePage('page-1', `${ROOT}/Projects/Note.md`, 'folder-1');
    const vault = makeVault([folder], [nestedPage]);

    const result = getFolderArchiveConfirmation(vault, 'folder-1');

    expect(result.hasDescendants).toBe(true);
    expect(result.message).toContain('1 page(s)');
  });
});

describe('PAGE_DELETE_CONFIRMATION_MESSAGE', () => {
  it('is a fixed, non-empty confirmation message for a Note/Daily Note delete', () => {
    expect(PAGE_DELETE_CONFIRMATION_MESSAGE).toBe('This cannot be undone.');
  });
});
