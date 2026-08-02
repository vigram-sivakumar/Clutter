import { describe, expect, it, vi } from 'vitest';
import { toCollectionPageModel } from './toCollectionPageModel';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const defaultPageMetadata: Page['metadata'] = {
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
};

const defaultAnalysis: Page['analysis'] = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Root',
    path: ROOT,
    parentId: null,
    metadata: defaultFolderMetadata,
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    type: 'note',
    name: 'Untitled',
    path: `${ROOT}/Untitled.md`,
    parentId: 'folder-1',
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

function makeQuery(folders: Folder[], pages: Page[]): VaultQuery {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  return new VaultQuery(vault);
}

describe('toCollectionPageModel — browse surface (Category A)', () => {
  it('uses the folder name verbatim for a subfolder entry', () => {
    const active = makeFolder({ id: 'folder-1', name: 'Root' });
    const child = makeFolder({ id: 'folder-2', name: 'Subfolder', parentId: 'folder-1' });
    const query = makeQuery([active, child], []);

    const model = toCollectionPageModel(active, query, new Workspace(), {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
    });

    expect(model.folders).toEqual([
      expect.objectContaining({ id: 'folder-2', title: 'Subfolder' }),
    ]);
  });

  it('uses the real filename for a deliberately-named note', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({ name: 'Meeting Notes' });
    const query = makeQuery([active], [page]);

    const model = toCollectionPageModel(active, query, new Workspace(), {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', title: 'Meeting Notes' }),
    ]);
  });

  it('does not show the raw auto-generated filename for an unnamed note', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({
      name: 'Untitled 2',
      source: { markdown: 'Real content here' },
    });
    const query = makeQuery([active], [page]);

    const model = toCollectionPageModel(active, query, new Workspace(), {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', title: 'Real content here' }),
    ]);
  });
});
