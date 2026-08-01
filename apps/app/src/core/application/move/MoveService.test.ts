import { describe, expect, it } from 'vitest';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
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

function buildPage(path: string): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
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
}

function makeVault(pages: Page[], folders: Folder[]): Vault {
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

describe('MoveService.resolveMoveDestination', () => {
  it('resolves the destination path inside the target folder, preserving the filename', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([page], [folder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveMoveDestination(page, 'folder-1');

    expect(destination).toEqual({
      path: `${ROOT}/Projects/Note.md`,
      parentId: 'folder-1',
    });
  });

  it('throws for an unknown destination folder id', () => {
    const page = buildPage(`${ROOT}/Note.md`);
    const vault = makeVault([page], []);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    expect(() => moveService.resolveMoveDestination(page, 'does-not-exist')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  it('preserves filenames containing spaces and special characters', () => {
    const page = buildPage(`${ROOT}/My Great Idea (draft).md`);
    const folder = makeFolder('folder-1', `${ROOT}/Archive Bin`);
    const vault = makeVault([page], [folder]);
    const moveService = new MoveService(vault, new InMemoryVaultFileSystem());

    const destination = moveService.resolveMoveDestination(page, 'folder-1');

    expect(destination).toEqual({
      path: `${ROOT}/Archive Bin/My Great Idea (draft).md`,
      parentId: 'folder-1',
    });
  });
});
