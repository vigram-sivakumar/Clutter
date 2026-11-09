import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

import { createPageEmbedResolver } from './resolvePageEmbed';
import { resolveResourceEmbed } from './resolveResourceEmbed';
import { createReferencedPage, createWikiLinkResolver } from './resolveWikiLink';

/**
 * A reference to an item that was archived: it sits in Archive/ now, and is found by where it was archived from.
 * Active items, permanently deleted items and genuinely missing ones keep the behaviour they had.
 */

const ROOT = '/vault';

const folderMetadata = {
  defaultTemplateId: null, icon: null, favorite: false, description: '', cover: null, coverHidden: false,
  coverLayout: 'side' as const, coverPositionAbove: 50, coverPositionSide: 50,
  status: 'active' as const, archivedAt: null, originalPath: null as string | null, originalParentId: null,
};
const pageMetadata = {
  icon: null, cover: null, coverHidden: false, coverLayout: 'side' as const, coverPositionAbove: 50,
  coverPositionSide: 50, description: '', favorite: false, status: 'active' as const, archivedAt: null,
  originalParentId: null, originalPath: null as string | null, createdAt: null, updatedAt: null,
};

const folder = (path: string, originalPath: string | null = null, parentId: string | null = null): Folder => ({
  id: `folder:${path}`, path: `${ROOT}/${path}`, name: path.split('/').pop()!, parentId,
  metadata: { ...folderMetadata, originalPath: originalPath === null ? null : `${ROOT}/${originalPath}`, status: originalPath === null ? 'active' : 'archived' },
});
const page = (id: string, path: string, originalPath: string | null = null, extra: Partial<Page> = {}): Page => ({
  id, path: `${ROOT}/${path}`, name: path.split('/').pop()!.replace(/\.md$/, ''), type: 'note', parentId: null,
  metadata: { ...pageMetadata, originalPath: originalPath === null ? null : `${ROOT}/${originalPath}` },
  source: { markdown: '' },
  analysis: { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
  ...extra,
});
const asset = (id: string, path: string): VaultResource => ({ id, kind: 'image', name: path.split('/').pop()!, path: `${ROOT}/${path}`, parentId: null });

function makeVault(pages: Page[], folders: Folder[] = [], resources: VaultResource[] = [], origins: Record<string, string> = {}): Vault {
  const vault = new Vault(
    ROOT, pages, [folder('Archive'), ...folders], new TagBuilder().build(pages), [], [],
    new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), resources
  );
  vault.setArchivedResourceOrigins({ originalPathOf: (archived) => origins[archived] });
  return vault;
}

function operations(vault: Vault) {
  const open = vi.fn();
  const create = vi.fn();
  const createFolder = vi.fn();
  const pageOperations = {
    open: (id: string) => { open(id); return Promise.resolve(); },
    create: (options: { title?: string }) => { create(options); return Promise.resolve('new'); },
  } as unknown as PageOperations;
  const folderOperations = {
    open: vi.fn(() => Promise.resolve()),
    create: (name: string) => { createFolder(name); return Promise.resolve('f'); },
  } as unknown as FolderOperations;
  const openFolder = vi.fn();
  const openResource = vi.fn();
  const resolver = createWikiLinkResolver(vault, pageOperations, folderOperations, undefined, { openFolder, openResource });
  return { open, create, createFolder, openFolder, openResource, resolver, pageOperations, folderOperations };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const snapshot = (vault: Vault) => ({
  pages: [...vault.pages()].map((p) => p.path).sort(),
  folders: [...vault.folders()].map((f) => f.path).sort(),
  resources: [...vault.resources()].map((r) => r.path).sort(),
});

describe('archived references: notes, daily notes and templates', () => {
  it.each([
    ['a note', 'Projects/Note', 'Archive/Note.md', 'Projects/Note.md'],
    ['a daily note', 'Daily Notes/2026/August/2026-08-20', 'Archive/2026-08-20.md', 'Daily Notes/2026/August/2026-08-20.md'],
    ['a template', 'Templates/Meeting', 'Archive/Meeting.md', 'Templates/Meeting.md'],
  ])('%s: resolves to the archived item, opens it, and creates nothing', async (_name, link, archivedPath, originalPath) => {
    const vault = makeVault([page('archived', archivedPath, originalPath)]);
    const { resolver, open, create, createFolder } = operations(vault);
    const before = snapshot(vault);

    const resolution = resolver(link, null);
    expect(resolution.status).toBe('resolved');
    expect(resolution).toMatchObject({ pageId: 'archived' });

    resolution.activate();
    await flush();

    expect(open).toHaveBeenCalledWith('archived');
    expect(create).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();
    expect(snapshot(vault)).toEqual(before);
    // Never restored: it is still where the archive put it.
    expect(vault.isPageEffectivelyArchived(vault.getPage('archived')!)).toBe(true);
  });

  it('a heading reference to an archived note still resolves and opens the note', () => {
    const vault = makeVault([page('archived', 'Archive/Note.md', 'Projects/Note.md', { source: { markdown: '# Intro\n' } })]);
    const { resolver } = operations(vault);

    expect(resolver('Projects/Note#Intro', null)).toMatchObject({ status: 'resolved', pageId: 'archived' });
  });

  it('an active note at the same path beats an archived one', () => {
    const vault = makeVault([page('active', 'Projects/Note.md'), page('archived', 'Archive/Note.md', 'Projects/Note.md')]);

    expect(operations(vault).resolver('Projects/Note', null)).toMatchObject({ status: 'resolved', pageId: 'active' });
  });

  it('after an explicit restore the same reference resolves to the active note', () => {
    const vault = makeVault([page('n', 'Archive/Note.md', 'Projects/Note.md')]);
    const { resolver } = operations(vault);
    expect(resolver('Projects/Note', null)).toMatchObject({ pageId: 'n' });

    vault.removePage('n');
    vault.addPage(page('n', 'Projects/Note.md'));

    expect(resolver('Projects/Note', null)).toMatchObject({ status: 'resolved', pageId: 'n' });
    expect(vault.isPageEffectivelyArchived(vault.getPage('n')!)).toBe(false);
  });

  it('a permanently deleted note stays unresolved, and clicking it creates, as before', async () => {
    const vault = makeVault([page('n', 'Archive/Note.md', 'Note.md')]);
    vault.removePage('n');
    const { resolver, create } = operations(vault);

    const resolution = resolver('Note', null);
    expect(resolution.status).toBe('unresolved');
    resolution.activate();
    await flush();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a genuinely missing note stays unresolved', () => {
    const vault = makeVault([page('n', 'Archive/Note.md', 'Projects/Note.md')]);

    expect(operations(vault).resolver('Projects/Other', null).status).toBe('unresolved');
  });

  it('duplicate titles: only the full original path matches, never the title', () => {
    const vault = makeVault([page('a', 'Archive/Note.md', 'A/Note.md'), page('b', 'Archive/Note 2.md', 'B/Note.md')]);
    const { resolver } = operations(vault);

    expect(resolver('A/Note', null)).toMatchObject({ pageId: 'a' });
    expect(resolver('B/Note', null)).toMatchObject({ pageId: 'b' });
    expect(resolver('Note', null).status).toBe('unresolved');
    expect(resolver('C/Note', null).status).toBe('unresolved');
  });

  it('two archived notes claiming the same path are ambiguous: nothing opens, nothing is created', async () => {
    const vault = makeVault([page('a', 'Archive/Note.md', 'Projects/Note.md'), page('b', 'Archive/Note 2.md', 'Projects/Note.md')]);
    const { resolver, open, create } = operations(vault);

    const resolution = resolver('Projects/Note', null);
    expect(resolution.status).toBe('ambiguous');
    resolution.activate();
    await flush();

    expect(open).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('provenance on a note that is not in the Archive is ignored', () => {
    const vault = makeVault([page('stale', 'Elsewhere/Stale.md', 'Projects/Note.md')]);

    expect(operations(vault).resolver('Projects/Note', null).status).toBe('unresolved');
  });

  it('an archived note with no recorded original location is not matched by name', () => {
    const vault = makeVault([page('dropped', 'Archive/Note.md', null)]);

    expect(operations(vault).resolver('Note', null).status).toBe('unresolved');
  });

  it('a stored original path with repeated separators or decomposed Unicode still matches', () => {
    const decomposed = 'Caf\u0065\u0301/Note.md';
    const vault = makeVault([page('n', 'Archive/Note.md', 'Projects/Note.md'), page('u', 'Archive/Unicode.md', decomposed)]);
    (vault.getPage('n') as { metadata: { originalPath: string } }).metadata = { ...pageMetadata, originalPath: `${ROOT}//Projects//Note.md` };
    const { resolver } = operations(vault);

    expect(resolver('Projects/Note', null)).toMatchObject({ pageId: 'n' });
    expect(resolver('Caf\u00e9/Note', null)).toMatchObject({ pageId: 'u' });
  });
});

describe('archived references: folders', () => {
  const archivedProjects = folder('Archive/Projects', 'Projects');
  const sub = folder('Archive/Projects/Sub', null, archivedProjects.id);

  it('[[Projects/]] and a bare [[Projects]] resolve to the archived folder and open it, creating nothing', async () => {
    const vault = makeVault([], [archivedProjects]);
    const { resolver, openFolder, create, createFolder } = operations(vault);
    const before = snapshot(vault);

    for (const link of ['Projects/', 'Projects']) {
      const resolution = resolver(link, null);
      expect(resolution).toMatchObject({ status: 'resolved', targetKind: 'folder', targetId: archivedProjects.id });
      resolution.activate();
    }
    await flush();

    expect(openFolder).toHaveBeenCalledTimes(2);
    expect(openFolder).toHaveBeenCalledWith(archivedProjects.id);
    expect(create).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();
    expect(snapshot(vault)).toEqual(before);
    expect(vault.isFolderEffectivelyArchived(archivedProjects.id)).toBe(true);
  });

  it('a note and a nested folder inside an archived folder resolve through the folder\'s original path', () => {
    const nested = page('deep', 'Archive/Projects/Sub/Deep.md');
    const vault = makeVault([nested], [archivedProjects, sub]);
    const { resolver } = operations(vault);

    expect(resolver('Projects/Sub/Deep', null)).toMatchObject({ status: 'resolved', pageId: 'deep' });
    expect(resolver('Projects/Sub/', null)).toMatchObject({ status: 'resolved', targetId: sub.id });
  });

  it('an active folder at the path beats the archived one; a deleted archived folder is unresolved', () => {
    const active = folder('Projects');
    const withBoth = makeVault([], [active, archivedProjects]);
    expect(operations(withBoth).resolver('Projects/', null)).toMatchObject({ targetId: active.id });

    const deleted = makeVault([], [archivedProjects]);
    deleted.removeFolder(archivedProjects.id);
    expect(operations(deleted).resolver('Projects/', null).status).toBe('unresolved');
  });

  it('two archived folders claiming the same path are ambiguous', () => {
    const second = folder('Archive/Projects 2', 'Projects');
    const vault = makeVault([], [archivedProjects, second]);

    expect(operations(vault).resolver('Projects/', null).status).toBe('ambiguous');
  });
});

describe('archived references: assets', () => {
  const hero = asset('hero', 'Archive/hero.png');
  const origins = { [`${ROOT}/Archive/hero.png`]: `${ROOT}/Assets/hero.png` };

  it('[[Assets/hero.png]] resolves to the archived file and opens its preview without actions', async () => {
    const vault = makeVault([], [], [hero], origins);
    const { resolver, openResource, create } = operations(vault);

    const resolution = resolver('Assets/hero.png', null);
    expect(resolution).toMatchObject({ status: 'resolved', targetKind: 'image', targetId: 'hero' });
    resolution.activate();
    await flush();

    expect(openResource).toHaveBeenCalledWith(hero, { archived: true });
    expect(create).not.toHaveBeenCalled();
    expect(vault.isResourceEffectivelyArchived(vault.getResource('hero')!)).toBe(true);
  });

  it('the embed resolver finds the archived file too, and only by its full original path', () => {
    const vault = makeVault([], [], [hero], origins);

    expect(resolveResourceEmbed(vault, 'Assets/hero.png')).toBe(hero);
    expect(resolveResourceEmbed(vault, 'hero.png')).toBeUndefined();
    expect(resolveResourceEmbed(vault, 'Other/hero.png')).toBeUndefined();
  });

  it('no record, a stale record (the file is not in the Archive) or a deleted file stays unresolved', () => {
    expect(resolveResourceEmbed(makeVault([], [], [hero], {}), 'Assets/hero.png')).toBeUndefined();

    const moved = asset('hero', 'Assets/hero.png');
    expect(resolveResourceEmbed(makeVault([], [], [moved], { [moved.path]: `${ROOT}/Assets/other.png` }), 'Assets/other.png')).toBeUndefined();

    const deleted = makeVault([], [], [hero], origins);
    deleted.removeResource('hero');
    expect(resolveResourceEmbed(deleted, 'Assets/hero.png')).toBeUndefined();
  });

  it('two archived files claiming the same path stay unresolved (never guessed)', () => {
    const second = asset('hero2', 'Archive/hero 2.png');
    const vault = makeVault([], [], [hero, second], { ...origins, [second.path]: `${ROOT}/Assets/hero.png` });

    expect(resolveResourceEmbed(vault, 'Assets/hero.png')).toBeUndefined();
    expect(operations(vault).resolver('Assets/hero.png', null).status).toBe('ambiguous');
  });

  it('an active file at the path beats the archived one', () => {
    const active = asset('live', 'Assets/hero.png');
    const vault = makeVault([], [], [hero, active], origins);

    expect(resolveResourceEmbed(vault, 'Assets/hero.png')).toBe(active);
  });
});

describe('archived references: note embeds, and the create guard', () => {
  const effective = { getPage: () => undefined } as unknown as EffectivePageState;

  it('![[Projects/Note]] resolves to the archived note; ambiguous and missing are not resolved', () => {
    const vault = makeVault([page('n', 'Archive/Note.md', 'Projects/Note.md')]);
    const resolve = createPageEmbedResolver(vault, effective);

    expect(resolve('Projects/Note')).toMatchObject({ status: 'resolved', pageId: 'n' });
    expect(resolve('Projects/Missing').status).toBe('unresolved');

    const twin = makeVault([page('a', 'Archive/A.md', 'P/N.md'), page('b', 'Archive/B.md', 'P/N.md')]);
    expect(createPageEmbedResolver(twin, effective)('P/N').status).toBe('ambiguous');
  });

  it('createReferencedPage never creates over an archived item: it opens the note, or does nothing when ambiguous', async () => {
    const vault = makeVault([page('n', 'Archive/Note.md', 'Projects/Note.md')]);
    const { open, create, createFolder, pageOperations, folderOperations } = operations(vault);

    await createReferencedPage(vault, folderOperations, pageOperations, 'Projects/Note');
    expect(open).toHaveBeenCalledWith('n');
    expect(create).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();

    const twin = makeVault([page('a', 'Archive/A.md', 'P/N.md'), page('b', 'Archive/B.md', 'P/N.md')]);
    const second = operations(twin);
    await createReferencedPage(twin, second.folderOperations, second.pageOperations, 'P/N');
    expect(second.open).not.toHaveBeenCalled();
    expect(second.create).not.toHaveBeenCalled();
    expect(second.createFolder).not.toHaveBeenCalled();
  });
});
