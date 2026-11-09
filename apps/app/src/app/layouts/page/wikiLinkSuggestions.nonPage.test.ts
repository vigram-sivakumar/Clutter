import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

import { createWikiLinkSuggester } from './wikiLinkSuggestions';

/**
 * Folders and asset files in `[[` autocomplete: what is offered, how each is matched and spelled, and
 * that notes, Daily Notes and Create behave as before. The selector is a real `MembershipSelector` over
 * a real `Vault`, so "visible" and "archived" are the app's own rules.
 */

const ROOT = '/vault';

const folderMetadata = {
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

const pageMetadata = {
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

const folder = (path: string): Folder => ({
  id: `folder:${path}`,
  path: `${ROOT}/${path}`,
  name: path.split('/').pop()!,
  parentId: null,
  metadata: folderMetadata,
});

const page = (path: string): Page =>
  ({
    id: `page:${path}`,
    path: `${ROOT}/${path}.md`,
    name: path.split('/').pop()!,
    type: 'note',
    parentId: null,
    metadata: pageMetadata,
    source: { markdown: '' },
    analysis: { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
  }) as Page;

const resource = (path: string, kind: VaultResource['kind'] = 'image'): VaultResource => ({
  id: `resource:${path}`,
  kind,
  name: path.split('/').pop()!,
  path: `${ROOT}/${path}`,
  parentId: null,
});

function setup(pages: Page[], folders: Folder[], resources: VaultResource[], resolveUrl?: (path: string) => string) {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const selector = new MembershipSelector(
    vault,
    { getAllResources: () => Array.from(vault.resources()) } as unknown as VaultQuery,
    {} as EffectivePageState
  );
  const pageCreate = vi.fn();
  const folderCreate = vi.fn();
  const ensureReservedFolder = vi.fn();
  const suggest = createWikiLinkSuggester(
    vault,
    { open: vi.fn(), create: pageCreate } as unknown as PageOperations,
    { create: folderCreate, ensureReservedFolder } as unknown as FolderOperations,
    undefined,
    undefined,
    selector,
    resolveUrl,
    'My Space'
  );

  return { vault, suggest, writes: { pageCreate, folderCreate, ensureReservedFolder } };
}

const summarize = (suggestions: ReturnType<ReturnType<typeof setup>['suggest']>) =>
  suggestions.map((suggestion) => `${suggestion.kind}:${suggestion.path}`);

describe('createWikiLinkSuggester — folders and assets', () => {
  const fixture = () =>
    setup(
      [page('Projects'), page('Plan')],
      [folder('Projects'), folder('Inbox'), folder('Assets'), folder('Archive'), folder('Archive/Old'), folder('.hidden')],
      [resource('Assets/hero.png'), resource('Assets/plan.pdf', 'pdf'), resource('Archive/old.png')]
    );

  it('an empty query lists the notes, then only the four system folders — no other folder, image or PDF', () => {
    const { suggest } = fixture();
    const all = suggest('');

    expect(summarize(all)).toEqual(expect.arrayContaining(['page:Plan', 'page:Projects']));
    expect(all.filter((suggestion) => suggestion.kind !== 'page').map((suggestion) => suggestion.path)).toEqual([
      'Inbox/',
      'Templates/',
      'Archive/',
      'Assets/',
    ]);
  });

  it('a typed query searches every target type at once, in one list ordered by match quality', () => {
    const { suggest } = fixture();

    // The same name in four kinds: all are found, each exactly once.
    expect(summarize(suggest('plan')).sort()).toEqual(['asset:Assets/plan.pdf', 'page:Plan']);
    expect(summarize(suggest('projects')).sort()).toEqual(['folder:Projects/', 'page:Projects']);
    expect(summarize(suggest('hero'))).toEqual(['asset:Assets/hero.png']);
  });

  it('orders by how well each target matches, not by what kind it is', () => {
    const { suggest } = setup(
      [page('Hero journey notes'), page('Hero')],
      [folder('Heroes')],
      [resource('Assets/hero.png')]
    );

    // The exact title ("Hero") leads whatever the kinds of the rest; every kind is found, in one list.
    const order = summarize(suggest('hero'));
    expect(order[0]).toBe('page:Hero');
    expect([...order].sort()).toEqual(['asset:Assets/hero.png', 'folder:Heroes/', 'page:Hero', 'page:Hero journey notes']);
  });

  it('spells a folder with its trailing slash, so it is never read as the note of the same name', () => {
    const { suggest } = fixture();

    const folderSuggestion = suggest('Projects').find((suggestion) => suggestion.kind === 'folder');
    const pageSuggestion = suggest('Projects').find((suggestion) => suggestion.kind === 'page');

    expect(folderSuggestion).toMatchObject({ path: 'Projects/', title: 'Projects', breadcrumb: null });
    expect(pageSuggestion).toMatchObject({ path: 'Projects' });
  });

  it('offers an asset by its extension-included vault path, titled by its file name', () => {
    const { suggest } = fixture();

    expect(suggest('hero')).toEqual([
      { kind: 'asset', path: 'Assets/hero.png', title: 'hero', breadcrumb: 'Assets', assetKind: 'image' },
    ]);
    expect(suggest('plan').find((suggestion) => suggestion.kind === 'asset')).toMatchObject({ path: 'Assets/plan.pdf', assetKind: 'pdf' });
  });

  it('gives an asset the loadable URL of its file for its thumbnail, only when a resolver is given', () => {
    const withUrl = setup([], [], [resource('Assets/hero.png')], (path) => `app://${path}`).suggest('hero');
    const without = fixture().suggest('hero');

    expect(withUrl).toEqual([expect.objectContaining({ kind: 'asset', previewUrl: 'app:///vault/Assets/hero.png' })]);
    expect(without[0]).not.toHaveProperty('previewUrl');
  });

  it('matches an asset by file name including the extension', () => {
    const { suggest } = fixture();

    expect(summarize(suggest('hero.p'))).toEqual(['asset:Assets/hero.png']);
    expect(summarize(suggest('.pdf'))).toEqual(['asset:Assets/plan.pdf']);
  });

  it('a plain query matches names only, so a folder name does not pull in everything inside it', () => {
    const { suggest } = fixture();

    expect(summarize(suggest('assets'))).toEqual(['folder:Assets/']);
  });

  it('a query with a "/" matches the path — `Assets/` lists the folder and what is in it', () => {
    const { suggest } = fixture();

    expect(summarize(suggest('Assets/'))).toEqual(['folder:Assets/', 'asset:Assets/hero.png', 'asset:Assets/plan.pdf']);
    expect(summarize(suggest('assets/he'))).toEqual(['asset:Assets/hero.png']);
  });

  it('never offers an archived folder or file, a dot-hidden folder, or anything archived inside Archive/', () => {
    const { suggest } = fixture();
    const all = summarize(suggest('o'));

    expect(all).not.toContain('folder:Archive/Old/');
    expect(all).not.toContain('asset:Archive/old.png');
    expect(all).not.toContain('folder:.hidden/');
  });

  it('Create is offered only when nothing of any kind matches — never beside a folder or an asset', () => {
    const { suggest } = fixture();

    expect(suggest('zzz')).toEqual([expect.objectContaining({ kind: 'create', path: 'zzz' })]);
    expect(suggest('inbox').map((suggestion) => suggestion.kind)).toEqual(['folder']);
  });

  it('never offers to create a note for a folder link, an asset name or a reserved folder name', () => {
    const { suggest } = setup([], [], []);

    expect(suggest('Newfolder/')).toEqual([]);
    expect(suggest('missing.png')).toEqual([]);
    // `Inbox` is a folder suggestion now, never a Create row.
    expect(suggest('Inbox').map((suggestion) => suggestion.kind)).toEqual(['folder']);
    expect(suggest('Daily Notes')).toEqual([]);
  });

  it('without a membership selector, only notes (and Create) are offered, as before', () => {
    const vault = setup([page('Plan')], [folder('Projects')], [resource('Assets/hero.png')]).vault;
    const suggest = createWikiLinkSuggester(
      vault,
      { open: vi.fn(), create: vi.fn() } as unknown as PageOperations,
      { create: vi.fn() } as unknown as FolderOperations
    );

    expect(summarize(suggest(''))).toEqual(['page:Plan']);
    expect(summarize(suggest('plan'))).toEqual(['page:Plan']);
    expect(summarize(suggest('projects'))).toEqual(['create:projects']);
  });

  it('a reserved folder shows the Space name as its path; an ordinary folder shows its parent', () => {
    const { suggest } = setup([], [folder('Inbox'), folder('Projects')], []);

    expect(suggest('Inbox/')).toEqual([expect.objectContaining({ title: 'Inbox', icon: 'tray', breadcrumb: 'My Space' })]);
    expect(suggest('Projects/')).toEqual([expect.objectContaining({ title: 'Projects', breadcrumb: null })]);
  });

  it('a note still wins its own slot: notes are listed first and keep their own shape', () => {
    const { suggest } = fixture();

    expect(suggest('plan')[0]).toMatchObject({ kind: 'page', path: 'Plan', title: 'Plan' });
  });

  it('an ordinary folder carries its own emoji; a reserved folder never does', () => {
    const emojiFolder = (path: string, icon: string): Folder => ({ ...folder(path), metadata: { ...folderMetadata, icon } });
    const { suggest } = setup([], [emojiFolder('Projects', '🚀'), emojiFolder('Inbox', '📥'), folder('Plain')], []);
    const byTitle = Object.fromEntries(
      ['Projects', 'Inbox', 'Plain'].flatMap((name) => suggest(`${name}/`)).map((suggestion) => [(suggestion as { title: string }).title, suggestion])
    );

    expect(byTitle.Projects).toMatchObject({ emoji: '🚀' });
    expect(byTitle.Inbox).toMatchObject({ icon: 'tray' });
    expect(byTitle.Inbox).not.toHaveProperty('emoji');
    expect(byTitle.Plain).not.toHaveProperty('emoji');
  });

  it('a reserved folder carries its system-location icon; an ordinary folder carries none (the generic icon). Daily Notes is not offered while its folder page is off', () => {
    const { suggest } = setup(
      [],
      [folder('Inbox'), folder('Archive'), folder('Templates'), folder('Daily Notes'), folder('Assets'), folder('Projects')],
      []
    );
    const icons = Object.fromEntries(
      ['Inbox', 'Archive', 'Templates', 'Daily Notes', 'Assets', 'Projects']
        .flatMap((name) => suggest(`${name}/`))
        .filter((suggestion) => suggestion.kind === 'folder')
        .map((suggestion) => [suggestion.title, (suggestion as { icon?: string }).icon])
    );

    expect(icons).toEqual({
      Inbox: 'tray',
      Archive: 'archive',
      Templates: 'template',
      Assets: 'layers',
      Projects: undefined,
    });
  });
});

describe('createWikiLinkSuggester — the four system folders are always offered', () => {
  const FOUR = ['folder:Inbox/', 'folder:Templates/', 'folder:Archive/', 'folder:Assets/'];

  it('offers all four on `[[` with no directories on disk, and on a typed query', () => {
    const { suggest } = setup([page('Plan')], [], []);

    expect(summarize(suggest(''))).toEqual(expect.arrayContaining(FOUR));
    expect(summarize(suggest('inb'))).toEqual(['folder:Inbox/']);
    expect(summarize(suggest('templ'))).toEqual(['folder:Templates/']);
    expect(summarize(suggest('arch'))).toEqual(['folder:Archive/']);
    expect(summarize(suggest('Assets/'))).toEqual(['folder:Assets/']);
  });

  it('presents them like a real reserved folder: system icon, shown inside the Space', () => {
    const { suggest } = setup([], [], []);

    expect(suggest('inb')[0]).toMatchObject({ kind: 'folder', path: 'Inbox/', title: 'Inbox', breadcrumb: 'My Space', icon: 'tray' });
  });

  it('offers each exactly once when the physical folders exist, and as the real folder', () => {
    const { suggest } = setup([], [folder('Inbox'), folder('Templates'), folder('Archive'), folder('Assets')], []);

    for (const query of ['', 'i', 'a', 'Inbox/', 'e']) {
      const paths = summarize(suggest(query));
      for (const entry of FOUR) expect(paths.filter((path) => path === entry).length).toBeLessThanOrEqual(1);
    }
    expect(summarize(suggest('')).filter((path) => FOUR.includes(path))).toEqual(FOUR);
    expect(suggest('inb')[0]).toMatchObject({ kind: 'folder', path: 'Inbox/', icon: 'tray' });
  });

  it('never offers Daily Notes or .clutter, even when Daily Notes exists', () => {
    const { suggest } = setup([], [folder('Daily Notes'), folder('.clutter')], []);

    for (const query of ['', 'daily', 'Daily Notes/', 'clutter', '.clutter', 'notes']) {
      const paths = summarize(suggest(query));
      expect(paths).not.toContain('folder:Daily Notes/');
      expect(paths).not.toContain('folder:.clutter/');
    }
  });

  it('keeps ordinary ranking and filtering: a query matching only ordinary targets is unchanged', () => {
    const { suggest } = setup([page('Projects'), page('Plan')], [folder('Projects')], [resource('Assets/hero.png')]);

    expect(summarize(suggest('proj'))).toEqual(['folder:Projects/', 'page:Projects']);
    expect(summarize(suggest('hero'))).toEqual(['asset:Assets/hero.png']);
  });

  it('typing and autocomplete write nothing: no note or folder is created, no reserved folder ensured', () => {
    const { suggest, writes } = setup([], [], []);

    for (const query of ['', 'i', 'Inbox', 'Inbox/', 'Assets/', 'zzz']) suggest(query);

    expect(writes.pageCreate).not.toHaveBeenCalled();
    expect(writes.folderCreate).not.toHaveBeenCalled();
    expect(writes.ensureReservedFolder).not.toHaveBeenCalled();
  });

  it('without a membership selector nothing but notes is offered, as before', () => {
    const vault = setup([page('Plan')], [], []).vault;
    const suggest = createWikiLinkSuggester(
      vault,
      { open: vi.fn(), create: vi.fn() } as unknown as PageOperations,
      { create: vi.fn() } as unknown as FolderOperations
    );

    expect(summarize(suggest(''))).toEqual(['page:Plan']);
  });
});
