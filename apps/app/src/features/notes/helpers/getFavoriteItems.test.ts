import { describe, expect, it } from 'vitest';
import { toFavoriteItems } from './getFavoriteItems';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: true,
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
  favorite: true,
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
    name: 'Projects',
    path: '/vault/Projects',
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
    path: '/vault/Untitled.md',
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

describe('toFavoriteItems', () => {
  it('uses the folder name verbatim — folders never go through the display-label fallback chain', () => {
    const folder = makeFolder({ name: 'Projects' });

    const items = toFavoriteItems([folder], []);

    expect(items).toEqual([
      { id: 'folder-1', title: 'Projects', titleStyle: 'default', type: 'folder' },
    ]);
  });

  it('uses the real filename for a deliberately-named favorited page', () => {
    const page = makePage({ name: 'Meeting Notes' });

    const items = toFavoriteItems([], [page]);

    expect(items).toEqual([
      { id: 'page-1', title: 'Meeting Notes', titleStyle: 'default', type: 'note' },
    ]);
  });

  it('does not show a raw auto-generated name for a favorited-but-unnamed page, and styles the inferred label as a placeholder', () => {
    const page = makePage({
      name: 'Untitled 2',
      source: { markdown: 'Real content here' },
    });

    const items = toFavoriteItems([], [page]);

    expect(items).toEqual([
      {
        id: 'page-1',
        title: 'Real content here',
        titleStyle: 'placeholder',
        type: 'note',
      },
    ]);
  });

  it('marks the item as a placeholder when the label falls all the way through to it', () => {
    const page = makePage({ name: 'Untitled', source: { markdown: '' } });

    const items = toFavoriteItems([], [page]);

    expect(items).toEqual([
      { id: 'page-1', title: 'New Note', titleStyle: 'placeholder', type: 'note' },
    ]);
  });
});
