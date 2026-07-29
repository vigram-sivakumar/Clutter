import { describe, expect, it } from 'vitest';
import { Vault } from './Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { Page } from './Page';
import type { Folder } from './Folder';

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
  return new Vault(
    '/vault',
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const defaultPageMetadata = {
  icon: null,
  cover: null,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

const defaultAnalysis = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makeFolder(overrides: Partial<Folder> & Pick<Folder, 'id' | 'path'>): Folder {
  return {
    name: overrides.path.split('/').pop() ?? '',
    parentId: null,
    metadata: defaultFolderMetadata,
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> & Pick<Page, 'id' | 'path'>): Page {
  return {
    type: 'note',
    name: overrides.path.split('/').pop()?.replace('.md', '') ?? '',
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

function makeProjectsHierarchy(): {
  projects: Folder;
  design: Folder;
  notes: Page;
} {
  const projects = makeFolder({
    id: 'folder-projects',
    name: 'Projects',
    path: '/vault/Projects',
    parentId: null,
  });

  const design = makeFolder({
    id: 'folder-design',
    name: 'Design',
    path: '/vault/Projects/Design',
    parentId: 'folder-projects',
  });

  const notes = makePage({
    id: 'page-notes',
    path: '/vault/Projects/Design/Notes.md',
    parentId: 'folder-design',
  });

  return { projects, design, notes };
}

describe('Vault invariants', () => {
  it('finds a folder by its current filesystem path', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const vault = makeVault([], [folder]);

    const found = vault.getFolderByPath('/vault/Projects');

    expect(found).toBeDefined();
    expect(found!.id).toBe('folder-1');
  });

  it('moves a folder and updates its path lookup', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const vault = makeVault([], [folder]);

    vault.moveFolder('folder-1', '/vault/NewProjects', null);

    const moved = vault.getFolder('folder-1');

    expect(moved).toBeDefined();
    expect(moved!.path).toBe('/vault/NewProjects');
    expect(moved!.parentId).toBeNull();

    expect(vault.getFolderByPath('/vault/Projects')).toBeUndefined();
    expect(vault.getFolderByPath('/vault/NewProjects')?.id).toBe('folder-1');
  });

  it('emits one folder-moved event when a folder moves', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const vault = makeVault([], [folder]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.moveFolder('folder-1', '/vault/NewProjects', null);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'folder-moved',
      folderId: 'folder-1',
      path: '/vault/NewProjects',
    });
  });
});

describe('updatePagePath', () => {
  it('updates parentId when a page moves', () => {
    const sourceFolder = makeFolder({
      id: 'folder-source',
      path: '/vault/Source',
      name: 'Source',
    });
    const targetFolder = makeFolder({
      id: 'folder-target',
      path: '/vault/Target',
      name: 'Target',
    });
    const page = makePage({
      id: 'page-1',
      path: '/vault/Source/Note.md',
      parentId: 'folder-source',
    });
    const vault = makeVault([page], [sourceFolder, targetFolder]);

    vault.updatePagePath('page-1', '/vault/Target/Note.md', 'folder-target');

    const moved = vault.getPage('page-1');

    expect(moved!.path).toBe('/vault/Target/Note.md');
    expect(moved!.parentId).toBe('folder-target');
  });

  it('is a no-op when path and parentId are unchanged', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const page = makePage({
      id: 'page-1',
      path: '/vault/Projects/Note.md',
      parentId: 'folder-1',
    });
    const vault = makeVault([page], [folder]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.updatePagePath('page-1', '/vault/Projects/Note.md', 'folder-1');

    expect(vault.getPage('page-1')).toBe(page);
    expect(events).toHaveLength(0);
  });

  it('throws for an unknown page', () => {
    const vault = makeVault([]);

    expect(() => {
      vault.updatePagePath('missing', '/vault/Note.md', null);
    }).toThrow('Cannot move unknown page: missing');
  });

  it('throws on path collision', () => {
    const pageA = makePage({ id: 'page-a', path: '/vault/A.md' });
    const pageB = makePage({ id: 'page-b', path: '/vault/B.md' });
    const vault = makeVault([pageA, pageB]);

    expect(() => {
      vault.updatePagePath('page-a', '/vault/B.md', null);
    }).toThrow('Path already in use by another page: /vault/B.md');
  });
});

describe('moveFolder cascade', () => {
  it('updates folder path, child folder path, page path, and page parentId', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.moveFolder('folder-projects', '/vault/Work', null);

    const movedProjects = vault.getFolder('folder-projects');
    const movedDesign = vault.getFolder('folder-design');
    const movedNotes = vault.getPage('page-notes');

    expect(movedProjects!.path).toBe('/vault/Work');
    expect(movedProjects!.parentId).toBeNull();

    expect(movedDesign!.path).toBe('/vault/Work/Design');
    expect(movedDesign!.parentId).toBe('folder-projects');

    expect(movedNotes!.path).toBe('/vault/Work/Design/Notes.md');
    expect(movedNotes!.parentId).toBe('folder-design');
  });

  it('emits exactly one folder-moved event for a cascade move', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.moveFolder('folder-projects', '/vault/Work', null);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'folder-moved',
      folderId: 'folder-projects',
      path: '/vault/Work',
    });
  });

  it('keeps folder IDs and page IDs unchanged', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.moveFolder('folder-projects', '/vault/Work', null);

    expect(vault.getFolder('folder-projects')).toBeDefined();
    expect(vault.getFolder('folder-design')).toBeDefined();
    expect(vault.getPage('page-notes')).toBeDefined();
  });

  it('clears old paths and resolves new paths', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.moveFolder('folder-projects', '/vault/Work', null);

    expect(vault.getFolderByPath('/vault/Projects')).toBeUndefined();
    expect(vault.getFolderByPath('/vault/Projects/Design')).toBeUndefined();
    expect(vault.getPageByPath('/vault/Projects/Design/Notes.md')).toBeUndefined();

    expect(vault.getFolderByPath('/vault/Work')?.id).toBe('folder-projects');
    expect(vault.getFolderByPath('/vault/Work/Design')?.id).toBe('folder-design');
    expect(vault.getPageByPath('/vault/Work/Design/Notes.md')?.id).toBe('page-notes');
  });
});
