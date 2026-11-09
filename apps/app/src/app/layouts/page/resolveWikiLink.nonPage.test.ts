import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

import { canCreateReferencedPage, createWikiLinkResolver, openSystemFolderThrough } from './resolveWikiLink';

/**
 * `[[Projects/]]` (a folder), `[[Assets/hero.png]]` (an asset) and a bare `[[Projects]]` that no note
 * claims: resolution, activation and the precedence between kinds. Notes, daily notes and templates are
 * covered by resolveWikiLink.test.ts, which this leaves unchanged.
 */

const ROOT = '/vault';

function makeVault(pages: Page[], folders: Folder[], resources: VaultResource[] = []): Vault {
  return new Vault(
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
}

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

function makeFolder(path: string, parentId: string | null = null): Folder {
  return { id: `folder:${ROOT}/${path}`, path: `${ROOT}/${path}`, name: path.split('/').pop()!, parentId, metadata: folderMetadata };
}

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

function makePage(path: string, aliases: string[] = []): Page {
  return {
    id: `page:${path}`,
    path: `${ROOT}/${path}.md`,
    name: path.split('/').pop()!,
    type: 'note',
    parentId: null,
    metadata: pageMetadata,
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: aliases.map((value) => ({ value })),
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  } as Page;
}

function makeResource(path: string, kind: VaultResource['kind'] = 'image'): VaultResource {
  return { id: `resource:${path}`, kind, name: path.split('/').pop()!, path: `${ROOT}/${path}`, parentId: null };
}

function setup(
  pages: Page[],
  folders: Folder[],
  resources: VaultResource[] = [],
  options: Parameters<typeof createWikiLinkResolver>[4] = {}
) {
  const vault = makeVault(pages, folders, resources);
  const openPage = vi.fn();
  const folderOpen = vi.fn(() => Promise.resolve());
  const pageCreate = vi.fn(() => Promise.resolve('new'));
  const folderCreate = vi.fn(() => Promise.resolve('new-folder'));
  const ensureReservedFolder = vi.fn((id: string) => Promise.resolve({ id: `folder:/vault/${id}` }));
  const resolve = createWikiLinkResolver(
    vault,
    { open: openPage, create: pageCreate } as unknown as PageOperations,
    { open: folderOpen, create: folderCreate, ensureReservedFolder } as unknown as FolderOperations,
    undefined,
    options
  );

  return { vault, resolve, openPage, folderOpen, pageCreate, folderCreate, ensureReservedFolder };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('wiki links to folders', () => {
  it('resolves `Projects/` to the folder and opens it through folder navigation', () => {
    const { resolve, folderOpen } = setup([], [makeFolder('Projects')]);

    const resolution = resolve('Projects/', null);

    expect(resolution).toMatchObject({ status: 'resolved', targetKind: 'folder', targetId: 'folder:/vault/Projects', icon: 'folder', emoji: null, displayLabel: 'Projects' });
    resolution.activate();
    expect(folderOpen).toHaveBeenCalledWith('folder:/vault/Projects');
  });

  it('uses the host-supplied folder opener when there is one (the host owns folder navigation)', () => {
    const openFolder = vi.fn();
    const { resolve, folderOpen } = setup([], [makeFolder('Projects')], [], { openFolder });

    resolve('Projects/', null).activate();

    expect(openFolder).toHaveBeenCalledWith('folder:/vault/Projects');
    expect(folderOpen).not.toHaveBeenCalled();
  });

  it('resolves a nested folder, and shows a local alias as its label', () => {
    const projects = makeFolder('Projects');
    const { resolve } = setup([], [projects, makeFolder('Projects/Work', projects.id)]);

    expect(resolve('Projects/Work/', null)).toMatchObject({ status: 'resolved', displayLabel: 'Work' });
    expect(resolve('Projects/Work/', 'My work')).toMatchObject({ status: 'resolved', displayLabel: 'My work' });
  });

  it('a note wins over a folder of the same name on a bare link; the trailing slash reaches the folder', () => {
    const { resolve, openPage, folderOpen } = setup([makePage('Projects')], [makeFolder('Projects')]);

    const bare = resolve('Projects', null);
    expect(bare).toMatchObject({ status: 'resolved', pageId: 'page:Projects' });
    bare.activate();
    expect(openPage).toHaveBeenCalledWith('page:Projects');

    const explicit = resolve('Projects/', null);
    expect(explicit).toMatchObject({ status: 'resolved', targetKind: 'folder' });
    explicit.activate();
    expect(folderOpen).toHaveBeenCalledTimes(1);
  });

  it('a bare link falls back to the folder only when no note matches by path or alias', () => {
    const { resolve } = setup([], [makeFolder('Projects')]);

    expect(resolve('Projects', null)).toMatchObject({ status: 'resolved', targetKind: 'folder' });
  });

  it('an alias match beats the folder, and two alias matches stay ambiguous rather than falling to the folder', () => {
    const one = setup([makePage('Notes/Plan', ['Projects'])], [makeFolder('Projects')]);
    expect(one.resolve('Projects', null)).toMatchObject({ status: 'resolved', pageId: 'page:Notes/Plan' });

    const two = setup([makePage('A', ['Projects']), makePage('B', ['Projects'])], [makeFolder('Projects')]);
    expect(two.resolve('Projects', null).status).toBe('ambiguous');
  });

  it('an explicit folder link never consults notes or aliases', () => {
    const { resolve } = setup([makePage('Projects', ['Projects/'])], []);

    expect(resolve('Projects/', null).status).toBe('unresolved');
  });

  it('a missing folder is unresolved and clicking it creates nothing — no note, no folder', async () => {
    const { resolve, pageCreate, folderCreate, folderOpen } = setup([], []);

    const resolution = resolve('Nowhere/', null);

    expect(resolution).toMatchObject({ status: 'unresolved', displayLabel: 'Nowhere' });
    resolution.activate();
    await flush();
    expect(pageCreate).not.toHaveBeenCalled();
    expect(folderCreate).not.toHaveBeenCalled();
    expect(folderOpen).not.toHaveBeenCalled();
  });

  it('a link whose folder was deleted, renamed or moved goes unresolved; the new path resolves', () => {
    const { vault, resolve } = setup([], [makeFolder('Projects'), makeFolder('Archive2')]);
    expect(resolve('Projects/', null).status).toBe('resolved');

    vault.moveFolder('folder:/vault/Projects', `${ROOT}/Renamed`, null);
    expect(resolve('Projects/', null).status).toBe('unresolved');
    expect(resolve('Renamed/', null).status).toBe('resolved');

    vault.removeFolder('folder:/vault/Projects');
    expect(resolve('Renamed/', null).status).toBe('unresolved');
  });

  it('a #fragment means nothing on a folder: such a link is unresolved', () => {
    const { resolve } = setup([], [makeFolder('Projects')]);

    expect(resolve('Projects#Heading', null).status).toBe('unresolved');
    expect(resolve('Projects/#Heading', null).status).toBe('unresolved');
  });

  it.each(['Inbox', 'Templates', 'Archive', 'Daily Notes', 'Assets'])('resolves the reserved / system folder %s', (name) => {
    const { resolve, folderOpen } = setup([], [makeFolder(name)]);

    for (const link of [`${name}/`, name]) {
      expect(resolve(link, null)).toMatchObject({ status: 'resolved', targetKind: 'folder', displayLabel: name });
    }
    resolve(`${name}/`, null).activate();
    expect(folderOpen).toHaveBeenCalledWith(`folder:/vault/${name}`);
  });

  describe('the four system folders with no directory on disk', () => {
    const NAMES = ['Inbox', 'Templates', 'Archive', 'Assets'] as const;

    it.each(NAMES)('%s resolves as a folder link, with and without the trailing slash, and resolving writes nothing', (name) => {
      const { resolve, pageCreate, folderCreate, folderOpen, ensureReservedFolder } = setup([], []);

      for (const link of [`${name}/`, name]) {
        expect(resolve(link, null)).toMatchObject({ status: 'resolved', targetKind: 'folder', displayLabel: name });
      }
      expect(resolve(`${name}/`, 'Mine')).toMatchObject({ status: 'resolved', displayLabel: 'Mine' });
      expect(pageCreate).not.toHaveBeenCalled();
      expect(folderCreate).not.toHaveBeenCalled();
      expect(folderOpen).not.toHaveBeenCalled();
      expect(ensureReservedFolder).not.toHaveBeenCalled();
    });

    it('Daily Notes and .clutter stay unresolved, as do look-alikes that are not top-level system folders', () => {
      const { resolve } = setup([], []);

      for (const link of ['Daily Notes/', 'Daily Notes', '.clutter/', '.clutter', 'Projects/Inbox/', 'inbox/']) {
        expect(resolve(link, null).status).toBe('unresolved');
      }
    });

    it('a note named Inbox wins the bare link, an alias wins too, and `Inbox/` still means the folder', () => {
      const note = setup([makePage('Inbox')], []);
      expect(note.resolve('Inbox', null)).toMatchObject({ status: 'resolved', pageId: 'page:Inbox' });
      expect(note.resolve('Inbox/', null)).toMatchObject({ status: 'resolved', targetKind: 'folder' });

      const alias = setup([makePage('Notes/Plan', ['Templates'])], []);
      expect(alias.resolve('Templates', null)).toMatchObject({ status: 'resolved', pageId: 'page:Notes/Plan' });
    });

    it('an existing folder is resolved exactly as before (its own id)', () => {
      const { resolve } = setup([], [makeFolder('Inbox')]);

      expect(resolve('Inbox/', null)).toMatchObject({ status: 'resolved', targetKind: 'folder', targetId: 'folder:/vault/Inbox' });
    });

    it('activation: each of the four goes to the host’s navigation for it, and nothing else is opened or created', () => {
      const openSystemFolder = vi.fn();
      const { resolve, folderOpen, folderCreate, ensureReservedFolder, pageCreate } = setup([], [], [], { openSystemFolder });

      for (const name of NAMES) resolve(`${name}/`, null).activate();

      expect(openSystemFolder.mock.calls).toEqual([['inbox'], ['templates'], ['archive'], ['assets']]);
      expect(folderOpen).not.toHaveBeenCalled();
      expect(folderCreate).not.toHaveBeenCalled();
      expect(ensureReservedFolder).not.toHaveBeenCalled();
      expect(pageCreate).not.toHaveBeenCalled();
    });

    it('without a host opener, activation does nothing: the resolver itself has no navigation or folder-creation logic', async () => {
      const { resolve, folderOpen, folderCreate, ensureReservedFolder, pageCreate } = setup([], []);

      for (const name of NAMES) resolve(`${name}/`, null).activate();
      await flush();

      expect(ensureReservedFolder).not.toHaveBeenCalled();
      expect(folderOpen).not.toHaveBeenCalled();
      expect(folderCreate).not.toHaveBeenCalled();
      expect(pageCreate).not.toHaveBeenCalled();
    });

    it('openSystemFolderThrough sends Assets only to openAssets and the others to their own lazy open method', () => {
      const navigation = {
        openAssets: vi.fn(),
        openInbox: vi.fn(),
        openTemplates: vi.fn(),
        openArchive: vi.fn(),
      };
      const open = openSystemFolderThrough(navigation);

      open('assets');
      expect(navigation.openAssets).toHaveBeenCalledTimes(1);
      expect(navigation.openInbox).not.toHaveBeenCalled();
      open('inbox');
      open('templates');
      open('archive');

      expect(navigation.openInbox).toHaveBeenCalledTimes(1);
      expect(navigation.openTemplates).toHaveBeenCalledTimes(1);
      expect(navigation.openArchive).toHaveBeenCalledTimes(1);
      expect(navigation.openAssets).toHaveBeenCalledTimes(1);
    });

    it.each(NAMES)('a resolver wired with the shared helper activates %s through exactly its navigation method', (name) => {
      const navigation = { openAssets: vi.fn(), openInbox: vi.fn(), openTemplates: vi.fn(), openArchive: vi.fn() };
      const { resolve, ensureReservedFolder, folderOpen } = setup([], [], [], {
        openSystemFolder: openSystemFolderThrough(navigation),
      });

      resolve(`${name}/`, null).activate();

      const calls = Object.values(navigation).map((fn) => fn.mock.calls.length);
      expect(calls.reduce((sum, n) => sum + n, 0)).toBe(1);
      expect(navigation[`open${name}` as keyof typeof navigation]).toHaveBeenCalledTimes(1);
      expect(ensureReservedFolder).not.toHaveBeenCalled();
      expect(folderOpen).not.toHaveBeenCalled();
    });

    it('every resolver instance in the app is wired with openSystemFolder (editor, archived editor, and the Notes, Tags, Daily Notes and Tasks sidebars)', () => {
      const root = resolvePath(__dirname, '../../..');
      const files = [
        'app/layouts/page/PageHost.tsx',
        'features/notes/sidebar/Sidebar.Notes.tsx',
        'features/tags/sidebar/Sidebar.Tags.tsx',
        'features/daily-notes/sidebar/Sidebar.DailyNotes.tsx',
        'features/tasks/sidebar/Sidebar.Tasks.tsx',
      ];
      let instances = 0;
      for (const file of files) {
        const source = readFileSync(resolvePath(root, file), 'utf8');
        for (const match of source.matchAll(/createWikiLinkResolver\(/g)) {
          instances += 1;
          const call = source.slice(match.index, match.index + 900);
          expect(call, `${file} must pass openSystemFolder`).toContain('openSystemFolder');
        }
      }
      expect(instances).toBe(6);

      // And no other source file creates one without being listed here.
      const others = execFileSync('grep', ['-rl', 'createWikiLinkResolver(', root, '--include=*.ts', '--include=*.tsx'])
        .toString()
        .split('\n')
        .filter((path) => path && !/\.test\./.test(path) && !path.endsWith('resolveWikiLink.ts'))
        .map((path) => path.slice(root.length + 1))
        .sort();
      expect(others).toEqual([...files].sort());
    }, 30_000);
  });
});

describe('wiki links to assets', () => {
  const hero = makeResource('Assets/hero.png');
  const plan = makeResource('Assets/plan.pdf', 'pdf');

  it('resolves the extension-included vault path to an image and opens it in the existing preview', () => {
    const openResource = vi.fn();
    const { resolve } = setup([], [makeFolder('Assets')], [hero], { openResource });

    const resolution = resolve('Assets/hero.png', null);

    expect(resolution).toMatchObject({ status: 'resolved', targetKind: 'image', targetId: hero.id, icon: 'image', displayLabel: 'hero' });
    resolution.activate();
    expect(openResource).toHaveBeenCalledWith(hero, undefined);
  });

  it('resolves a PDF, and every supported image extension', () => {
    const resources = ['a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg'].map((name) => makeResource(name));
    const openResource = vi.fn();
    const { resolve } = setup([], [], [plan, ...resources], { openResource });

    expect(resolve('Assets/plan.pdf', null)).toMatchObject({ status: 'resolved', targetKind: 'pdf', icon: 'pdf' });
    resolve('Assets/plan.pdf', null).activate();
    expect(openResource).toHaveBeenCalledWith(plan, undefined);

    for (const resource of resources) {
      expect(resolve(resource.name, null)).toMatchObject({ status: 'resolved', targetKind: 'image' });
    }
  });

  it('opens a file in Archive/ read-only', () => {
    const archived = makeResource('Archive/old.png');
    const openResource = vi.fn();
    const { resolve } = setup([], [makeFolder('Archive')], [archived], { openResource });

    resolve('Archive/old.png', null).activate();

    expect(openResource).toHaveBeenCalledWith(archived, { archived: true });
  });

  it('without a host preview, activating a resolved asset does nothing and does not throw', () => {
    const { resolve, pageCreate } = setup([], [], [hero]);

    expect(() => resolve('Assets/hero.png', null).activate()).not.toThrow();
    expect(pageCreate).not.toHaveBeenCalled();
  });

  it('needs the real extension: `Assets/hero` is not the asset, and a local alias is the label', () => {
    const { resolve } = setup([], [], [hero]);

    expect(resolve('Assets/hero', null).status).toBe('unresolved');
    expect(resolve('Assets/hero.png', 'The hero')).toMatchObject({ status: 'resolved', displayLabel: 'The hero' });
  });

  it('a note and an asset that share a stem are told apart by the extension', () => {
    const { resolve } = setup([makePage('Assets/hero')], [], [hero]);

    expect(resolve('Assets/hero', null)).toMatchObject({ status: 'resolved', pageId: 'page:Assets/hero' });
    expect(resolve('Assets/hero.png', null)).toMatchObject({ status: 'resolved', targetKind: 'image' });
  });

  it('a #fragment never matches an asset', () => {
    const { resolve } = setup([], [], [hero]);

    expect(resolve('Assets/hero.png#x', null).status).toBe('unresolved');
  });

  it('a deleted, renamed or moved asset goes unresolved; the new path resolves', () => {
    const { vault, resolve } = setup([], [], [hero]);
    expect(resolve('Assets/hero.png', null).status).toBe('resolved');

    vault.updateResourcePath(hero.id, `${ROOT}/Assets/banner.png`, null);
    expect(resolve('Assets/hero.png', null).status).toBe('unresolved');
    expect(resolve('Assets/banner.png', null).status).toBe('resolved');

    vault.removeResource(hero.id);
    expect(resolve('Assets/banner.png', null).status).toBe('unresolved');
  });

  it('clicking a missing asset creates no note (not `hero.png.md`)', async () => {
    const { resolve, pageCreate } = setup([], []);

    const resolution = resolve('Assets/missing.png', null);
    expect(resolution.status).toBe('unresolved');
    resolution.activate();
    await flush();
    expect(pageCreate).not.toHaveBeenCalled();
  });
});

describe('canCreateReferencedPage — what a link never creates a note for', () => {
  const vault = makeVault([], []);

  it('refuses folder links, asset file names and the reserved top-level folder names', () => {
    for (const path of ['Projects/', 'Assets/hero.png', 'doc.PDF', 'Inbox', 'Assets', 'Templates', 'Archive', 'Daily Notes']) {
      expect(canCreateReferencedPage(vault, path), path).toBe(false);
    }
  });

  it('still allows ordinary notes, including a note inside a reserved folder and a dotted name', () => {
    for (const path of ['Projects/Plan', 'Inbox/Idea', 'v1.2 plan', 'Assets/notes']) {
      expect(canCreateReferencedPage(vault, path), path).toBe(true);
    }
  });
});

describe('icons of folder and asset links', () => {
  const withSelector = (folders: Folder[], resources: VaultResource[] = []) => {
    const vault = makeVault([], folders, resources);
    const membershipSelector = new MembershipSelector(
      vault,
      { getAllResources: () => Array.from(vault.resources()) } as unknown as VaultQuery,
      {} as EffectivePageState
    );

    return createWikiLinkResolver(
      vault,
      { open: vi.fn(), create: vi.fn() } as unknown as PageOperations,
      { open: vi.fn(), create: vi.fn() } as unknown as FolderOperations,
      undefined,
      { membershipSelector }
    );
  };

  it('a reserved folder shows its system-location icon, from the one shared presentation table', () => {
    const resolve = withSelector(['Inbox', 'Archive', 'Templates', 'Daily Notes', 'Assets'].map((name) => makeFolder(name)));

    expect(resolve('Inbox/', null)).toMatchObject({ icon: 'tray' });
    expect(resolve('Archive/', null)).toMatchObject({ icon: 'archive' });
    expect(resolve('Templates/', null)).toMatchObject({ icon: 'template' });
    expect(resolve('Daily Notes/', null)).toMatchObject({ icon: 'calendarToday' });
    expect(resolve('Assets/', null)).toMatchObject({ icon: 'layers' });
  });

  it('an ordinary folder — even one named like a reserved folder but nested — keeps the generic folder icon', () => {
    const projects = makeFolder('Projects');
    const resolve = withSelector([projects, { ...makeFolder('Projects/Inbox', projects.id) }]);

    expect(resolve('Projects/', null)).toMatchObject({ icon: 'folder' });
    expect(resolve('Projects/Inbox/', null)).toMatchObject({ icon: 'folder' });
  });

  it('an ordinary folder with an emoji shows it; a reserved folder keeps its system icon even if it has one', () => {
    const withEmoji = (path: string, icon: string): Folder => ({ ...makeFolder(path), metadata: { ...folderMetadata, icon } });
    const resolve = withSelector([withEmoji('Projects', '🚀'), withEmoji('Inbox', '📥')]);

    expect(resolve('Projects/', null)).toMatchObject({ icon: 'folder', emoji: '🚀' });
    expect(resolve('Inbox/', null)).toMatchObject({ icon: 'tray', emoji: null });
    expect(withSelector([makeFolder('Plain')])('Plain/', null)).toMatchObject({ emoji: null });
  });

  it('a folder link resolved without a selector falls back to the generic folder icon', () => {
    const { resolve } = setup([], [makeFolder('Inbox')]);

    expect(resolve('Inbox/', null)).toMatchObject({ icon: 'folder' });
  });

  it('images and PDFs use the resource icons', () => {
    const resolve = withSelector([], [makeResource('a.png'), makeResource('b.pdf', 'pdf')]);

    expect(resolve('a.png', null)).toMatchObject({ icon: 'image' });
    expect(resolve('b.pdf', null)).toMatchObject({ icon: 'pdf' });
  });
});
