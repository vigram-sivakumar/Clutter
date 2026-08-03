import { describe, expect, it, vi } from 'vitest';
import { buildBreadcrumbs, buildBreadcrumbsForDraft } from './buildBreadcrumbs';
import { getPageIcon } from './getPageIcon';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import type { Folder } from '../vault/models/Folder';
import type { Page } from '../vault/models/Page';

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
    name: 'Projects',
    path: `${ROOT}/Projects`,
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
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
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

// A non-root ancestor folder, shared by every "trailing crumb" / "icon"
// test below so those tests exercise the trailing-crumb content in
// isolation from the root-visibility policy (covered separately below).
function makeAncestorFolder(overrides: Partial<Folder> = {}): Folder {
  return makeFolder({
    id: 'ancestor-folder',
    name: 'Ancestor',
    parentId: null,
    ...overrides,
  });
}

describe('buildBreadcrumbs — root visibility policy', () => {
  it('returns no breadcrumb trail for a root folder', () => {
    const folder = makeFolder({ parentId: null });
    const crumbs = buildBreadcrumbs(folder, makeVault(), vi.fn());

    expect(crumbs).toEqual([]);
  });

  it('returns no breadcrumb trail for a root note', () => {
    const page = makePage({ parentId: null });
    const crumbs = buildBreadcrumbs(page, makeVault(), vi.fn());

    expect(crumbs).toEqual([]);
  });

  it('returns no breadcrumb trail for a root daily note', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: null,
    });
    const crumbs = buildBreadcrumbs(page, makeVault(), vi.fn());

    expect(crumbs).toEqual([]);
  });
});

describe('buildBreadcrumbsForDraft — root visibility policy', () => {
  it('returns no breadcrumb trail for a root draft', () => {
    const crumbs = buildBreadcrumbsForDraft(
      'draft-1',
      null,
      'New Note',
      'note',
      makeVault(),
      vi.fn()
    );

    expect(crumbs).toEqual([]);
  });
});

describe('buildBreadcrumbs — nested entries render the full chain', () => {
  it('returns the parent folder plus the current folder for a nested folder', () => {
    const parent = makeAncestorFolder();
    const folder = makeFolder({
      id: 'folder-child',
      name: 'Design',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(folder, makeVault([parent, folder]), vi.fn());

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', 'Design']);
  });

  it('returns the parent folder plus the current note for a nested note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ name: 'Meeting Notes', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', 'Meeting Notes']);
  });

  it('returns the parent folder plus the current daily note for a nested daily note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', '2026-08-02']);
  });
});

describe('buildBreadcrumbsForDraft — nested drafts render the full chain', () => {
  it('returns the parent folder plus the draft for a nested draft', () => {
    const parent = makeAncestorFolder();
    const crumbs = buildBreadcrumbsForDraft(
      'draft-1',
      'ancestor-folder',
      'New Note',
      'note',
      makeVault([parent]),
      vi.fn()
    );

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', 'New Note']);
  });
});

describe('buildBreadcrumbs — trailing crumb (Category B)', () => {
  it('uses the real name for a folder', () => {
    const parent = makeAncestorFolder();
    const folder = makeFolder({ name: 'Projects', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(folder, makeVault([parent, folder]), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('Projects');
  });

  it('uses the real filename for a deliberately-named note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ name: 'Meeting Notes', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('Meeting Notes');
  });

  it('shows the placeholder text, not the raw generated name, for an untitled note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ name: 'Untitled 2', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('New Note');
  });

  it('always shows the real date for a daily note, never a placeholder', () => {
    const parent = makeAncestorFolder();
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('2026-08-02');
  });
});

describe('buildBreadcrumbs — icon sourced from getPageIcon (single authority)', () => {
  it('uses getPageIcon for a folder crumb', () => {
    const parent = makeAncestorFolder();
    const folder = makeFolder({ parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(folder, makeVault([parent, folder]), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('folder'));
  });

  it('uses getPageIcon for a note crumb', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ type: 'note', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('note'));
  });

  it('uses getPageIcon for a daily-note crumb', () => {
    const parent = makeAncestorFolder();
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('daily-note'));
  });

  it('uses getPageIcon for an ancestor folder crumb', () => {
    const parent = makeFolder({ id: 'folder-1', name: 'Projects', parentId: null });
    const page = makePage({ parentId: 'folder-1' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), vi.fn());

    expect(crumbs[0]!.icon).toBe(getPageIcon('folder'));
  });

  it('uses getPageIcon for a draft crumb', () => {
    const parent = makeAncestorFolder();
    const crumbs = buildBreadcrumbsForDraft(
      'draft-1',
      'ancestor-folder',
      'New Note',
      'note',
      makeVault([parent]),
      vi.fn()
    );

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('note'));
  });
});
