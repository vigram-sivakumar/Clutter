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
  const suggest = createWikiLinkSuggester(
    vault,
    { open: vi.fn(), create: vi.fn() } as unknown as PageOperations,
    { create: vi.fn() } as unknown as FolderOperations,
    undefined,
    undefined,
    selector,
    resolveUrl,
    'My Space'
  );

  return { vault, suggest };
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

  it('an empty query lists only notes — no folders (reserved or not), images or PDFs', () => {
    const { suggest } = fixture();

    expect(summarize(suggest(''))).toEqual(expect.arrayContaining(['page:Plan', 'page:Projects']));
    expect(suggest('').every((suggestion) => suggestion.kind === 'page')).toBe(true);
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
    expect(suggest('Inbox')).toEqual([]);
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
