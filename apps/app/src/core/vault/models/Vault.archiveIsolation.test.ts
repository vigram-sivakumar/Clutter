import { describe, expect, it } from 'vitest';

import { Vault } from './Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { TagBuilder } from '../knowledge/TagBuilder';
import { TaskBuilder } from '../knowledge/TaskBuilder';
import { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { Page } from './Page';
import type { Folder } from './Folder';

/**
 * Archive isolation. ARCHIVED STATE IS LOCATION: an item is archived exactly when it sits inside the reserved
 * `Archive/` hierarchy, whatever its `status` metadata says (that is provenance). An archived item takes no part
 * in the active app's projections (tags, tasks, daily notes, embeds, the knowledge graph). Raw accessors
 * (`pages()`) still return it, for maintenance and sync.
 */

const folderMeta = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const pageMeta = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

const analysis = { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };

function folder(id: string, path: string, parentId: string | null = null, status: 'active' | 'archived' = 'active'): Folder {
  return { id, name: path.split('/').pop()!, path, parentId, metadata: { ...folderMeta, status } };
}

function page(id: string, overrides: Partial<Page> = {}): Page {
  return {
    id,
    type: 'note',
    name: id,
    path: `/vault/${id}.md`,
    parentId: null,
    metadata: pageMeta,
    source: { markdown: '' },
    analysis,
    ...overrides,
  } as Page;
}

const withTags = (p: Page, ...names: string[]): Page => ({
  ...p,
  analysis: { ...analysis, tags: names.map((name) => ({ name, sourcePageId: p.id })) },
});
const withTask = (p: Page, text: string): Page => ({
  ...p,
  analysis: { ...analysis, tasks: [{ sourcePageId: p.id, text, completed: false }] },
});

/** Built like a real scan: tags and tasks derived from ALL pages, handed to the constructor. */
function makeVault(pages: Page[], folders: Folder[] = [], declared = new Map<string, { name?: string }>()): Vault {
  return new Vault(
    '/vault',
    pages,
    folders,
    new TagBuilder().build(pages, declared as never),
    new TaskBuilder().build(pages),
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    declared as never
  );
}

const usage = (vault: Vault) => [...vault.tags()].map((tag) => [tag.name, tag.usageCount]);

/** A page physically inside Archive/ — archived, whatever its status says. */
const inArchive = (id: string, overrides: Partial<Page> = {}): Page =>
  page(id, { path: `/vault/Archive/${id}.md`, parentId: 'f-archive', ...overrides });
const archiveFolder = () => folder('f-archive', '/vault/Archive');

describe('archived state is physical location: the four states', () => {
  const vault = makeVault([], [archiveFolder(), folder('f-arch-old', '/vault/Archive/Old', 'f-archive'), folder('f-active', '/vault/Projects')]);
  const archivedStatus = { ...pageMeta, status: 'archived' as const };

  it('status archived INSIDE Archive/ → archived', () => {
    expect(vault.isPageEffectivelyArchived(inArchive('a', { metadata: archivedStatus }))).toBe(true);
  });

  it('status active INSIDE Archive/ → archived (nothing is written to make it so)', () => {
    const external = inArchive('a');

    expect(external.metadata.status).toBe('active');
    expect(vault.isPageEffectivelyArchived(external)).toBe(true);
  });

  it('status archived OUTSIDE Archive/ → active (the status is stale provenance, not a current-state signal)', () => {
    expect(vault.isPageEffectivelyArchived(page('a', { metadata: archivedStatus }))).toBe(false);
  });

  it('status active OUTSIDE Archive/ → active', () => {
    expect(vault.isPageEffectivelyArchived(page('a'))).toBe(false);
  });

  it('the same four states hold for a folder, whatever its status says', () => {
    const v = makeVault(
      [],
      [
        archiveFolder(),
        folder('in-active-status', '/vault/Archive/A', 'f-archive'),
        folder('in-archived-status', '/vault/Archive/B', 'f-archive', 'archived'),
        folder('out-archived-status', '/vault/Projects/C', null, 'archived'),
        folder('out-active-status', '/vault/Projects/D'),
      ]
    );

    expect(v.isFolderEffectivelyArchived('in-active-status')).toBe(true);
    expect(v.isFolderEffectivelyArchived('in-archived-status')).toBe(true);
    expect(v.isFolderEffectivelyArchived('out-archived-status')).toBe(false);
    expect(v.isFolderEffectivelyArchived('out-active-status')).toBe(false);
    expect(v.isFolderEffectivelyArchived(null)).toBe(false);
  });

  it('the same four states hold for a vault file (an Asset)', () => {
    expect(vault.isResourceEffectivelyArchived({ path: '/vault/Archive/hero.png' })).toBe(true);
    expect(vault.isResourceEffectivelyArchived({ path: '/vault/Archive/Old/hero.png' })).toBe(true);
    expect(vault.isResourceEffectivelyArchived({ path: '/vault/Assets/hero.png' })).toBe(false);
  });

  it('the Archive folder itself is the container, never archived — and "ArchiveNotes" is not Archive/', () => {
    expect(vault.isFolderEffectivelyArchived('f-archive')).toBe(false);
    expect(vault.isPageEffectivelyArchived(page('x', { path: '/vault/ArchiveNotes/x.md' }))).toBe(false);
  });

  it('only something DIRECTLY in Archive/ is restorable on its own', () => {
    expect(vault.isDirectlyInArchive('/vault/Archive/a.md')).toBe(true);
    expect(vault.isDirectlyInArchive('/vault/Archive/Old/a.md')).toBe(false);
    expect(vault.isDirectlyInArchive('/vault/Projects/a.md')).toBe(false);
  });
});

describe('tags: archived usage is not active usage', () => {
  it('a note in Archive/ no longer contributes to a tag\'s usage count or its pages', () => {
    const vault = makeVault([withTags(page('live'), 'design'), withTags(inArchive('old'), 'design')], [archiveFolder()]);

    expect(usage(vault)).toEqual([['design', 1]]);
    expect(vault.pageIdsForTag('design')).toEqual(['live']);
  });

  it('a tag used only by archived notes disappears when it is not declared', () => {
    const vault = makeVault([withTags(inArchive('old'), 'retired')], [archiveFolder()]);

    expect(vault.getTagByName('retired')).toBeUndefined();
    expect(usage(vault)).toEqual([]);
  });

  it('a declared tag used only by archived notes stays, with 0 usage', () => {
    const declared = new Map([['retired', { name: 'retired' }]]);
    const vault = makeVault([withTags(inArchive('old'), 'retired')], [archiveFolder()], declared);

    expect(usage(vault)).toEqual([['retired', 0]]);
  });

  it('a note inside an archived folder does not count either (it is inside Archive/ too)', () => {
    const vault = makeVault(
      [withTags(inArchive('inside', { path: '/vault/Archive/Old/inside.md', parentId: 'f-old' }), 'work'), withTags(page('live'), 'work')],
      [archiveFolder(), folder('f-old', '/vault/Archive/Old', 'f-archive', 'archived')]
    );

    expect(usage(vault)).toEqual([['work', 1]]);
  });

  it('a stale status:archived page OUTSIDE Archive/ counts as active usage', () => {
    const stale = { ...withTags(page('stale'), 'work'), metadata: { ...pageMeta, status: 'archived' as const } };
    const vault = makeVault([stale], [archiveFolder()]);

    expect(usage(vault)).toEqual([['work', 1]]);
  });

  it('EXTERNAL ENTRY: an active note that lands in Archive/ leaves the counts, with no metadata written', () => {
    const note = withTags(page('n'), 'design');
    const vault = makeVault([note, withTags(page('other'), 'design')], [archiveFolder()]);
    expect(usage(vault)).toEqual([['design', 2]]);

    vault.updatePagePath('n', '/vault/Archive/n.md', 'f-archive');

    expect(usage(vault)).toEqual([['design', 1]]);
    expect(vault.getPage('n')!.metadata.status).toBe('active');
  });

  it('EXTERNAL EXIT: a note leaving Archive/ comes back into the counts', () => {
    const vault = makeVault([withTags(inArchive('n'), 'design')], [archiveFolder()]);
    expect(usage(vault)).toEqual([]);

    vault.updatePagePath('n', '/vault/n.md', null);

    expect(usage(vault)).toEqual([['design', 1]]);
  });

  it('moving WITHIN Archive/ leaves it archived', () => {
    const vault = makeVault(
      [withTags(inArchive('n'), 'design')],
      [archiveFolder(), folder('f-old', '/vault/Archive/Old', 'f-archive')]
    );

    vault.updatePagePath('n', '/vault/Archive/Old/n.md', 'f-old');

    expect(usage(vault)).toEqual([]);
    expect(vault.isPageEffectivelyArchived(vault.getPage('n')!)).toBe(true);
  });

  it('archiving and restoring a FOLDER moves everything beneath it out of, and back into, the counts', () => {
    const projects = folder('f1', '/vault/Projects');
    const vault = makeVault(
      [withTags(page('inside', { parentId: 'f1', path: '/vault/Projects/inside.md' }), 'work')],
      [projects, archiveFolder()]
    );
    expect(usage(vault)).toEqual([['work', 1]]);

    vault.archiveFolder('f1', '/vault/Archive/Projects', 'f-archive', {
      status: 'archived',
      archivedAt: '2026-01-01T00:00:00.000Z',
      originalPath: '/vault/Projects',
      originalParentId: null,
    });
    expect(usage(vault)).toEqual([]);

    vault.restoreFolder('f1', '/vault/Projects', null, {
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    });
    expect(usage(vault)).toEqual([['work', 1]]);
  });

  it('EXTERNAL FOLDER MOVES: an active folder moved into Archive/ takes its notes out of the counts; moved back, they return', () => {
    const vault = makeVault(
      [withTags(page('inside', { parentId: 'f1', path: '/vault/Projects/inside.md' }), 'work')],
      [folder('f1', '/vault/Projects'), archiveFolder()]
    );

    vault.moveFolder('f1', '/vault/Archive/Projects', 'f-archive');
    expect(usage(vault)).toEqual([]);
    expect(vault.getFolder('f1')!.metadata.status).toBe('active');

    vault.moveFolder('f1', '/vault/Projects', null);
    expect(usage(vault)).toEqual([['work', 1]]);
  });

  it('raw pages() still returns archived notes (maintenance and sync need them)', () => {
    const vault = makeVault([inArchive('old')], [archiveFolder()]);

    expect([...vault.pages()].map((p) => p.id)).toEqual(['old']);
  });
});

describe('tasks', () => {
  it('tasks of notes inside Archive/ — directly or in an archived folder — are not active tasks', () => {
    const vault = makeVault(
      [
        withTask(page('live'), 'live task'),
        withTask(inArchive('old'), 'archived task'),
        withTask(inArchive('inside', { path: '/vault/Archive/Old/inside.md', parentId: 'f-old' }), 'task in archived folder'),
      ],
      [archiveFolder(), folder('f-old', '/vault/Archive/Old', 'f-archive', 'archived')]
    );

    expect([...vault.tasks()].map((t) => t.text)).toEqual(['live task']);
  });

  it('a note moved into Archive/ takes its tasks out; moved out, they come back', () => {
    const note = withTask(page('n'), 'do it');
    const vault = makeVault([note], [archiveFolder()]);

    vault.updatePagePath('n', '/vault/Archive/n.md', 'f-archive');
    expect([...vault.tasks()]).toHaveLength(0);

    vault.updatePagePath('n', '/vault/n.md', null);
    expect([...vault.tasks()]).toHaveLength(1);
  });
});

describe('daily notes', () => {
  it('Daily Notes inside Archive/ are not active Daily Notes', () => {
    const daily = (id: string, overrides: Partial<Page> = {}) => page(id, { type: 'daily-note', name: id, ...overrides });
    const vault = makeVault(
      [daily('2026-01-01'), daily('2026-01-02', { path: '/vault/Archive/2026-01-02.md', parentId: 'f-archive' })],
      [archiveFolder()]
    );

    expect([...vault.dailyNotes()].map((p) => p.id)).toEqual(['2026-01-01']);
  });
});

describe('embeds and the knowledge graph are built from active pages only', () => {
  const linking = (id: string, linkTarget: string, embedTarget: string, overrides: Partial<Page> = {}): Page =>
    page(id, {
      ...overrides,
      analysis: {
        ...analysis,
        links: [{ sourcePageId: id, target: linkTarget } as never],
        embeds: [{ sourcePageId: id, target: embedTarget } as never],
      },
    });

  const edges = (vault: Vault) => vault.knowledgeGraph().edges.map((edge) => `${edge.sourcePageId}->${edge.targetPageId}`);

  const build = () =>
    makeVault(
      [
        linking('live', 'live-target', 'live.png'),
        linking('old', 'live-target', 'only-old.png', { path: '/vault/Archive/old.md', parentId: 'f-archive' }),
        page('live-target'),
        page('old-target', { path: '/vault/Archive/old-target.md', parentId: 'f-archive' }),
        linking('live2', 'old-target', 'live.png'),
      ],
      [archiveFolder()]
    );

  it('an archived note contributes no embeds', () => {
    const vault = build();
    vault.replacePage(page('live-target')); // invalidate the lazily built projections
    const targets = [...vault.embeds()].map((embed) => embed.target);

    expect(targets).toContain('live.png');
    expect(targets).not.toContain('only-old.png');
  });

  it('an archived note contributes no graph edges, and none point at one', () => {
    const vault = build();
    vault.replacePage(page('live-target'));

    expect(edges(vault).sort()).toEqual(['live->live-target']);
  });

  it('a vault handed projections built from every page corrects them at construction when anything is archived', () => {
    const vault = build();

    expect([...vault.embeds()].map((embed) => embed.target)).not.toContain('only-old.png');
  });
});
