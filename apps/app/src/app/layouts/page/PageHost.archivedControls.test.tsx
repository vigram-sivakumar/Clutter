// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import { DocumentState } from '@core/engine/DocumentState';
import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { DELETE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

/**
 * Standalone page controls for an effectively archived resource, through the real AppLayout
 * composition: the title is plain text, the icon is shown but cannot be changed, there is no
 * favorite star, no Add control on a folder and no day navigation on a Daily Note. The policy is
 * MembershipSelector.isEntityEffectivelyArchived — a note inside an archived folder counts too.
 */

// Application's constructor and the image URL resolver reach Tauri IPC with no runtime to answer under vitest.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  convertFileSrc: (path: string) => `app://${path}`,
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const ROOT = '/vault';
const ISO = '2026-01-15';
const DATE = new Date(2026, 0, 15);

/**
 * Archived state is physical location: a fixture meant to be archived (`status: 'archived'`) is
 * placed inside Archive/, since status alone no longer archives anything.
 */
function archivedLocation(path: string): string {
  return path.startsWith(`${ROOT}/Archive/`) ? path : `${ROOT}/Archive/${path.slice(path.lastIndexOf('/') + 1)}`;
}

function buildPage(path: string, id: string, frontmatter: Record<string, unknown> = {}): Page {
  if (frontmatter.status === 'archived') path = archivedLocation(path);
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeApplication(pages: Page[] = [], folders: Folder[] = [], resources: VaultResource[] = []): Application {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const fileSystem = new InMemoryVaultFileSystem();
  for (const page of pages) {
    fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  }
  for (const resource of resources) {
    fileSystem.seedFile(resource.path, 'binary');
  }
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}


function buildFolder(id: string, path: string, status: 'active' | 'archived', favorite = false): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: {
      icon: '📁',
      favorite,
      description: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status,
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

const titleRoot = () => document.querySelector<HTMLElement>('.page-title')!;
const editableControlsInTitle = () =>
  titleRoot().querySelectorAll('[contenteditable], [role="textbox"], input, textarea');
const changeEmoji = () => document.querySelector('button[aria-label="Change emoji"]');
const star = () =>
  document.querySelector('button[aria-label="Add to Favorites"], button[aria-label="Remove from Favorites"]');
const staticEmoji = () => document.querySelector('.page-header-controls__emoji--static');

async function openNote(frontmatter: Record<string, unknown>, folders: Folder[] = [], parentId: string | null = null) {
  const parent = folders.find((folder) => folder.id === parentId);
  const page = buildPage(`${parent?.path ?? ROOT}/Note.md`, 'note-1', { icon: '🍄', ...frontmatter });
  const application = makeApplication([{ ...page, parentId }], folders);
  await application.pageOperations.open(page.id);
  render(<AppLayout application={application} />);
  await flush();
}

describe('an active note keeps its standalone controls', () => {
  it('editable title, a Change emoji button, a favorite star', async () => {
    await openNote({});

    expect(editableControlsInTitle().length).toBeGreaterThan(0);
    expect(changeEmoji()).not.toBeNull();
    expect(staticEmoji()).toBeNull();
    expect(star()).not.toBeNull();
  });
});

describe('an archived note', () => {
  it('has a read-only title, a visible but unchangeable icon, and no favorite star', async () => {
    await openNote({ status: 'archived', favorite: true });

    expect(titleRoot().textContent).toContain('Note');
    expect(editableControlsInTitle()).toHaveLength(0);
    expect(changeEmoji()).toBeNull();
    expect(staticEmoji()?.textContent).toContain('🍄');
    expect(star()).toBeNull();
  });

  it('still carries its favorite flag — archiving never clears it', async () => {
    const page = buildPage(`${ROOT}/Note.md`, 'note-1', { status: 'archived', favorite: true });

    expect(page.metadata.favorite).toBe(true);
  });
});

describe('a note inside an archived folder (its own status still active)', () => {
  it('is read-only the same way', async () => {
    const archived = buildFolder('folder-1', `${ROOT}/Archive/Projects`, 'archived');
    await openNote({}, [archived], 'folder-1');

    expect(editableControlsInTitle()).toHaveLength(0);
    expect(changeEmoji()).toBeNull();
    expect(star()).toBeNull();
  });
});

describe('a Daily Note', () => {
  const open = async (frontmatter: Record<string, unknown>) => {
    const page = buildPage(DailyNotePath.absoluteFrom(ROOT, DATE), `daily-${ISO}`, frontmatter);
    const application = makeApplication([page]);
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();
  };

  it('active: shows the previous/next day navigation', async () => {
    await open({});

    expect(document.querySelector('.daily-note-nav-controls')).not.toBeNull();
    expect(document.querySelector('[aria-label="Previous day"]')).not.toBeNull();
  });

  it('archived: the whole navigation control is gone', async () => {
    await open({ status: 'archived' });

    expect(document.querySelector('.daily-note-nav-controls')).toBeNull();
    expect(document.querySelector('[aria-label="Previous day"]')).toBeNull();
    expect(document.querySelector('[aria-label="Next day"]')).toBeNull();
    expect(document.querySelector('[aria-label="Open calendar"]')).toBeNull();
  });
});

describe('a folder', () => {
  const openFolder = async (folders: Folder[], id: string) => {
    const application = makeApplication([], folders);
    await application.folderOperations.open(id);
    render(<AppLayout application={application} />);
    await flush();
  };

  it('active: editable title, Change emoji, favorite star and an Add control', async () => {
    await openFolder([buildFolder('f1', `${ROOT}/Projects`, 'active')], 'f1');

    expect(editableControlsInTitle().length).toBeGreaterThan(0);
    expect(changeEmoji()).not.toBeNull();
    expect(star()).not.toBeNull();
    expect(document.querySelector('button[aria-label="New"], [aria-label="Add"]')).not.toBeNull();
  });

  it('archived: read-only title, static icon, no star, no Add control', async () => {
    await openFolder([buildFolder('f1', `${ROOT}/Archive/Projects`, 'archived', true)], 'f1');

    expect(editableControlsInTitle()).toHaveLength(0);
    expect(changeEmoji()).toBeNull();
    expect(staticEmoji()?.textContent).toContain('📁');
    expect(star()).toBeNull();
    expect(document.querySelector('button[aria-label="New"], [aria-label="Add"]')).toBeNull();
  });
});

describe('Phase 4 — the title-controls (More actions) button and the description', () => {
  // The title-controls button (the top bar's overflow menu carries the same label, so scope to the header).
  const moreActions = () => document.querySelector('.page-header-controls button[aria-label="More actions"]');
  const descriptionRoot = () => document.querySelector<HTMLElement>('.page-description');

  it('an active note has the More actions button', async () => {
    await openNote({});

    expect(moreActions()).not.toBeNull();
  });

  it('an archived note has no More actions button at all — not even disabled', async () => {
    await openNote({ status: 'archived' });

    expect(moreActions()).toBeNull();
    expect(document.querySelector('.page-header-controls button[disabled]')).toBeNull();
    expect(titleRoot().textContent).toContain('Note');
  });

  it('an archived note shows an existing description as read-only text', async () => {
    await openNote({ status: 'archived', description: 'About this note' });

    expect(descriptionRoot()?.textContent).toBe('About this note');
    expect(descriptionRoot()?.querySelectorAll('[contenteditable], [role="textbox"], input, textarea')).toHaveLength(0);
  });

  it('an archived note with no description offers no way to add one', async () => {
    await openNote({ status: 'archived' });

    expect(descriptionRoot()).toBeNull();
  });

  it('an active note\'s description stays editable', async () => {
    await openNote({ description: 'About this note' });

    expect(descriptionRoot()?.querySelectorAll('[contenteditable], [role="textbox"], input, textarea').length).toBeGreaterThan(0);
  });

  it('a note inside an archived folder has no More actions button either', async () => {
    const archived = buildFolder('folder-1', `${ROOT}/Archive/Projects`, 'archived');
    await openNote({}, [archived], 'folder-1');

    expect(moreActions()).toBeNull();
  });

  it('an archived Daily Note has no More actions button', async () => {
    const page = buildPage(DailyNotePath.absoluteFrom(ROOT, DATE), `daily-${ISO}`, { status: 'archived' });
    const application = makeApplication([page]);
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();

    expect(moreActions()).toBeNull();
  });

  it('an archived folder has no More actions button and shows its description as text', async () => {
    const folder = buildFolder('f1', `${ROOT}/Archive/Projects`, 'archived');
    const application = makeApplication([], [{ ...folder, metadata: { ...folder.metadata, description: 'About it' } }]);
    await application.folderOperations.open('f1');
    render(<AppLayout application={application} />);
    await flush();

    expect(moreActions()).toBeNull();
    expect(descriptionRoot()?.textContent).toBe('About it');
    expect(descriptionRoot()?.querySelectorAll('[contenteditable], [role="textbox"], input, textarea')).toHaveLength(0);
  });
});

describe('an empty archived folder', () => {
  const openFolder = async (folder: Folder) => {
    const application = makeApplication([], [folder]);
    await application.folderOperations.open(folder.id);
    render(<AppLayout application={application} />);
    await flush();
  };
  const emptyState = () => document.querySelector('.collection-empty-state');

  it('says only "Folder is empty", with no action', async () => {
    await openFolder(buildFolder('f1', `${ROOT}/Archive/Projects`, 'archived'));

    expect(emptyState()?.textContent).toBe('Folder is empty');
    expect(emptyState()?.querySelector('button')).toBeNull();
  });

  it('an empty active folder keeps its usual copy and call to action', async () => {
    await openFolder(buildFolder('f1', `${ROOT}/Projects`, 'active'));

    expect(emptyState()?.textContent).toContain('Create notes or folders to organise your notes');
    expect(emptyState()?.querySelector('button')).not.toBeNull();
  });
});

describe('Phase 5 — cover image of an archived resource', () => {
  const cover = () => document.querySelector('.page__cover');
  const coverMenu = () => document.querySelector('.page__cover__menu');

  it('an active note with a cover has the cover and its menu button', async () => {
    await openNote({ cover: 'https://example.com/c.png' });

    expect(cover()).not.toBeNull();
    expect(coverMenu()).not.toBeNull();
  });

  it('an archived note still shows its cover but has no cover menu button', async () => {
    await openNote({ status: 'archived', cover: 'https://example.com/c.png' });

    expect(cover()).not.toBeNull();
    expect(cover()?.querySelector('img')?.getAttribute('src')).toContain('example.com/c.png');
    expect(coverMenu()).toBeNull();
  });

  it('a note inside an archived folder is the same', async () => {
    const archived = buildFolder('folder-1', `${ROOT}/Archive/Projects`, 'archived');
    await openNote({ cover: 'https://example.com/c.png' }, [archived], 'folder-1');

    expect(cover()).not.toBeNull();
    expect(coverMenu()).toBeNull();
  });

  it('an archived folder keeps its cover and loses the menu button; its stored cover is untouched', async () => {
    const folder = buildFolder('f1', `${ROOT}/Archive/Projects`, 'archived');
    const withCover = { ...folder, metadata: { ...folder.metadata, cover: 'https://example.com/c.png' } };
    const application = makeApplication([], [withCover]);
    await application.folderOperations.open('f1');
    render(<AppLayout application={application} />);
    await flush();

    expect(cover()).not.toBeNull();
    expect(coverMenu()).toBeNull();
    expect(application.vault.getFolder('f1')?.metadata.cover).toBe('https://example.com/c.png');
  });
});

describe('Phase 6 — properties of an archived resource are display-only', () => {
  const PROPS = { unownedLines: ['priority: high'] };
  const section = () => document.querySelector('.property-list');
  const addRow = () => [...document.querySelectorAll('button')].find((b) => /Add a property/i.test(b.textContent ?? ''));

  it('an active note shows its property and an Add a property row', async () => {
    await openNote({ ...PROPS });

    expect(section()?.textContent).toContain('priority');
    expect(addRow()).toBeDefined();
  });

  it('an archived note still shows the property, with no Add property and no editable value or name', async () => {
    await openNote({ ...PROPS, status: 'archived' });

    expect(section()?.textContent).toContain('priority');
    expect(section()?.textContent).toContain('high');
    expect(addRow()).toBeUndefined();
    expect(section()?.querySelectorAll('input, textarea, [contenteditable="true"]')).toHaveLength(0);
  });

  it('a note inside an archived folder (own status active) is read-only the same way', async () => {
    const archived = buildFolder('folder-1', `${ROOT}/Archive/Projects`, 'archived');
    await openNote({ ...PROPS }, [archived], 'folder-1');

    expect(section()?.textContent).toContain('priority');
    expect(addRow()).toBeUndefined();
    expect(section()?.querySelectorAll('input, textarea, [contenteditable="true"]')).toHaveLength(0);
  });

  it('the stored property data is not changed by viewing it', async () => {
    const page = buildPage(`${ROOT}/Note.md`, 'note-1', { ...PROPS, status: 'archived' });

    expect(page.metadata.unownedFrontmatter).toEqual(['priority: high']);
  });
});

describe('Phase 7 — the editor of an archived note is read-only', () => {
  const contentOf = () => document.querySelector<HTMLElement>('.cm-content');

  it('an active note\'s editor is editable', async () => {
    await openNote({});

    expect(contentOf()?.getAttribute('contenteditable')).toBe('true');
  });

  it('an archived note\'s editor is read-only and holds no focus', async () => {
    await openNote({ status: 'archived' });

    expect(contentOf()?.getAttribute('contenteditable')).toBe('false');
    expect(document.activeElement).not.toBe(contentOf());
  });

  it('a note inside an archived folder (its own status active) is read-only the same way', async () => {
    const archived = buildFolder('folder-1', `${ROOT}/Archive/Projects`, 'archived');
    await openNote({}, [archived], 'folder-1');

    expect(contentOf()?.getAttribute('contenteditable')).toBe('false');
  });

  it('archiving an open note makes its editor read-only IN PLACE, and restoring makes it editable again — the same editor throughout', async () => {
    const page = buildPage(`${ROOT}/Note.md`, 'note-1', {});
    const application = makeApplication([page], [buildFolder('folder-archive', `${ROOT}/Archive`, 'active')]);
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();
    const editorElement = document.querySelector('.cm-editor');
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!.parentElement as HTMLElement)!;
    expect(contentOf()?.getAttribute('contenteditable')).toBe('true');
    view.dispatch({ changes: { from: 0, insert: 'kept ' } });
    const undoBefore = undoDepth(view.state);

    await act(async () => {
      await application.pageOperations.archive(page.id);
    });
    await flush();
    expect(contentOf()?.getAttribute('contenteditable')).toBe('false');
    expect(document.querySelector('.cm-editor')).toBe(editorElement);

    await act(async () => {
      await application.pageOperations.restore(page.id);
    });
    await flush();
    expect(contentOf()?.getAttribute('contenteditable')).toBe('true');
    expect(document.querySelector('.cm-editor')).toBe(editorElement);
    expect(undoDepth(view.state)).toBe(undoBefore);
  });

  it('clicking the empty page body does not move a caret into an archived note', async () => {
    await openNote({ status: 'archived' });

    const body = document.querySelector<HTMLElement>('.page__body')!;
    fireEvent.mouseDown(body, { button: 0 });

    expect(document.activeElement).not.toBe(contentOf());
  });
});

describe('Phase 7 — embedded images open view-only in an archived note', () => {
  const IMAGE = '![Mountain](https://example.com/mountain.jpg)';

  const openWithImage = async (frontmatter: Record<string, unknown>) => {
    const built = buildPage(`${ROOT}/Note.md`, 'note-1', frontmatter);
    const page = { ...built, source: { markdown: IMAGE } } as Page;
    const application = makeApplication([page]);
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();

    const button = document.querySelector<HTMLButtonElement>('button.cm-image-button')!;
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    await flush();
  };
  const overlayActions = () => document.querySelector('.image-overlay__controls-viewport button[aria-label="More actions"]');

  it('an active note\'s image overlay offers the image\'s actions', async () => {
    await openWithImage({});

    expect(document.querySelector('.image-overlay')).not.toBeNull();
    expect(overlayActions()).not.toBeNull();
  });

  it('an archived note\'s image still opens, but with no actions at all — no vault-file menu, no URL menu, no set-as-cover', async () => {
    await openWithImage({ status: 'archived' });

    expect(document.querySelector('.image-overlay')).not.toBeNull();
    expect(overlayActions()).toBeNull();
  });
});

describe('Phase 8 — an archived folder shows its children, frozen', () => {
  const FOLDER_PATH = `${ROOT}/Archive/Projects`;
  const childNote = () => ({ ...buildPage(`${FOLDER_PATH}/Child.md`, 'child-1', {}), parentId: 'f1' }) as Page;
  const subFolder = () => ({ ...buildFolder('f2', `${FOLDER_PATH}/Sub`, 'active'), parentId: 'f1' }) as Folder;

  const openArchivedFolder = async (withChildren: boolean) => {
    const folder = buildFolder('f1', FOLDER_PATH, 'archived');
    const application = makeApplication(withChildren ? [childNote()] : [], withChildren ? [folder, subFolder()] : [folder]);
    await application.folderOperations.open('f1');
    render(<AppLayout application={application} />);
    await flush();

    return { application, folder };
  };
  const emptyState = () => document.querySelector('.collection-empty-state');

  it('lists its notes and folders instead of an empty page', async () => {
    await openArchivedFolder(true);

    expect(emptyState()).toBeNull();
    expect(document.querySelector('.collection__content')?.textContent).toContain('Child');
    expect(document.querySelector('.collection__content')?.textContent).toContain('Sub');
  });

  it('shows the real counts on a child folder, not 0', async () => {
    const application = makeApplication([{ ...childNote(), parentId: 'f2' } as Page], [buildFolder('f1', FOLDER_PATH, 'archived'), subFolder()]);
    await application.folderOperations.open('f1');
    render(<AppLayout application={application} />);
    await flush();

    expect(document.querySelector('.collection__content')?.textContent).toMatch(/1\s*Notes?/);
  });

  it('offers no way to add, rename, favorite, change the icon or the cover — its children are read-only too', async () => {
    await openArchivedFolder(true);

    expect(editableControlsInTitle()).toHaveLength(0);
    expect(star()).toBeNull();
    expect(changeEmoji()).toBeNull();
    expect(document.querySelector('button[aria-label="New"], [aria-label="Add"]')).toBeNull();
    expect(document.querySelector('.collection__content button[aria-label="Add cover image"], .collection__content button[aria-label="Change cover image"]')).toBeNull();
  });

  it('an empty archived folder says exactly "Folder is empty", with no action', async () => {
    await openArchivedFolder(false);

    expect(emptyState()?.textContent).toBe('Folder is empty');
    expect(emptyState()?.querySelector('button')).toBeNull();
  });

  it('opening an archived child note shows it read-only', async () => {
    const { application } = await openArchivedFolder(true);

    await act(async () => {
      await application.pageOperations.open('child-1');
    });
    await flush();

    expect(document.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false');
  });

  it('once restored, the folder behaves as an ordinary one again: editable title, Add control, same children', async () => {
    const { application, folder } = await openArchivedFolder(true);

    await act(async () => {
      application.vault.restoreFolder('f1', `${ROOT}/Projects`, null, {
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      });
    });
    await flush();

    expect(application.vault.getFolder(folder.id)!.metadata.status).toBe('active');
    expect(editableControlsInTitle().length).toBeGreaterThan(0);
    expect(star()).not.toBeNull();
    expect(document.querySelector('button[aria-label="New"], [aria-label="Add"]')).not.toBeNull();
    expect(document.querySelector('.collection__content')?.textContent).toContain('Child');
  });
});

describe('Phase 9 — an archived asset opened from the Archive', () => {
  const archive = () => ({ ...buildFolder('archive', `${ROOT}/Archive`, 'active'), name: 'Archive' }) as Folder;
  const assets = () => ({ ...buildFolder('assets', `${ROOT}/Assets`, 'active'), name: 'Assets' }) as Folder;
  const archivedImage = (): VaultResource => ({ id: 'img-1', kind: 'image', name: 'hero.png', path: `${ROOT}/Archive/hero.png`, parentId: 'archive' });

  const openArchiveAndAsset = async (resource: VaultResource, otherResources: VaultResource[] = []) => {
    const application = makeApplication([], [archive(), assets()], [resource, ...otherResources]);
    await application.folderOperations.open('archive');
    render(<AppLayout application={application} />);
    await flush();

    const row = [...document.querySelectorAll<HTMLElement>('.collection-table-row')].find((el) => el.textContent?.includes(resource.name.replace(/\.\w+$/, '')))!;
    fireEvent.click(row);
    await flush();

    return application;
  };
  const moreActions = () =>
    document.querySelector<HTMLButtonElement>('.image-overlay__control button[aria-label="More actions"], .pdf-viewer button[aria-label="More actions"]');
  const menuLabels = () => [...document.querySelectorAll('[role="menuitem"], .menu-item, .entry')].map((el) => el.textContent?.trim()).filter(Boolean);
  const openMenu = async () => {
    fireEvent.click(moreActions()!);
    await flush();
  };
  const clickItem = async (label: string) => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], .entry')].find((el) => el.textContent?.trim() === label)!;
    fireEvent.click(item);
    await flush();
  };

  it('an archived image opens viewable, with a menu of Download, Restore and Delete permanently', async () => {
    await openArchiveAndAsset(archivedImage());

    expect(document.querySelector('.image-overlay img')).not.toBeNull();
    await openMenu();
    const labels = menuLabels();
    expect(labels).toEqual(expect.arrayContaining(['Download', 'Restore', DELETE_ACTION_LABEL]));
    for (const gone of ['Move to…', 'Archive', 'Copy path', 'Reveal in Finder', 'Rename', 'Add to Favorites', 'Set as cover image']) {
      expect(labels, gone).not.toContain(gone);
    }
  });

  it('Restore on an image with no recorded original location asks where to put it — nothing is moved or invented', async () => {
    const application = await openArchiveAndAsset(archivedImage());

    await openMenu();
    await clickItem('Restore');
    await flush();

    expect(document.body.textContent).toContain('Restore to…');
    expect(application.vault.getResource('img-1')!.path).toBe(`${ROOT}/Archive/hero.png`);
  });

  it('choosing a destination restores the image there (Assets stays the only zone an asset can live in)', async () => {
    const application = await openArchiveAndAsset(archivedImage());

    await openMenu();
    await clickItem('Restore');
    await flush();

    const choice = [...document.querySelectorAll<HTMLElement>('[role="option"], .picker-list__item, .picker-item')].find(
      (el) => /Assets/.test(el.textContent ?? '')
    );
    expect(choice).toBeDefined();
    fireEvent.click(choice!);
    await flush();

    expect(application.vault.getResource('img-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
    expect(application.membershipSelector.getAllVisibleResources().map((r) => r.id)).toContain('img-1');
  });

  it('Delete asks first, then removes the file and the vault entry for good', async () => {
    const application = await openArchiveAndAsset(archivedImage());

    await openMenu();
    await clickItem(DELETE_ACTION_LABEL);
    expect(application.vault.getResource('img-1')).toBeDefined();
    expect(document.body.textContent).toContain('Delete permanently?');
    expect(document.body.textContent).toContain('You can\u2019t undo this action.');
    // The confirmation's own button is the plain "Delete".

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Delete')!;
    fireEvent.click(confirm);
    await flush();

    expect(application.vault.getResource('img-1')).toBeUndefined();
  });

  it('cancelling the confirmation deletes nothing', async () => {
    const application = await openArchiveAndAsset(archivedImage());

    await openMenu();
    await clickItem(DELETE_ACTION_LABEL);
    fireEvent.click([...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Cancel')!);
    await flush();

    expect(application.vault.getResource('img-1')).toBeDefined();
  });

  it('an image archived only because its folder is (no record of its own) offers Download and Delete, but no Restore', async () => {
    const old = { ...buildFolder('old', `${ROOT}/Archive/Old`, 'archived'), parentId: 'archive' } as Folder;
    const nested: VaultResource = { id: 'img-2', kind: 'image', name: 'inner.png', path: `${ROOT}/Archive/Old/inner.png`, parentId: 'old' };
    const application = makeApplication([], [archive(), assets(), old], [nested]);
    await application.folderOperations.open('archive');
    render(<AppLayout application={application} />);
    await flush();
    const row = [...document.querySelectorAll<HTMLElement>('.collection-table-row')].find((el) => el.textContent?.includes('inner'))!;
    fireEvent.click(row);
    await flush();

    await openMenu();

    expect(menuLabels()).toEqual(expect.arrayContaining(['Download', DELETE_ACTION_LABEL]));
    expect(menuLabels()).not.toContain('Restore');
  });

  it('an archived image stays out of the active Assets collection', async () => {
    const application = makeApplication([], [archive(), assets()], [archivedImage()]);

    expect(application.membershipSelector.getAllVisibleResources()).toEqual([]);
    expect(application.membershipSelector.getAllAssets()).toEqual([]);
    expect(application.membershipSelector.getArchivedResources().map((r) => r.id)).toEqual(['img-1']);
  });
});

describe('Phase 10 — a tag rename reaches an archived note that is open in the editor', () => {
  const withTag = (page: Page, markdown: string): Page =>
    ({ ...page, source: { markdown }, analysis: { ...page.analysis, tags: [{ name: 'old', sourcePageId: page.id }] } }) as Page;

  it('persists the rewritten note, shows it, and leaves the session clean', async () => {
    const archived = withTag(buildPage(`${ROOT}/Archive/Old.md`, 'archived-1', { status: 'archived' }), 'Body #old');
    const live = withTag(buildPage(`${ROOT}/Live.md`, 'live-1', {}), 'Live #old');
    const application = makeApplication([archived, live], [buildFolder('folder-archive', `${ROOT}/Archive`, 'active')]);
    await application.pageOperations.open(archived.id);
    render(<AppLayout application={application} />);
    await flush();
    expect(document.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false');

    await act(async () => {
      await application.tagOperations.rename('old', 'fresh');
    });
    await flush();

    const session = application.documentRegistry.get(archived.id)!;
    expect(session.currentRevision.markdown).toContain('#fresh');
    expect(session.isDirty).toBe(false);
    expect(session.state).not.toBe(DocumentState.SaveError);
    expect(application.vault.getPage(archived.id)!.source.markdown).toContain('#fresh');
    expect(application.vault.getPage(archived.id)!.metadata.status).toBe('archived');
    expect(document.querySelector('.cm-content')?.textContent).toContain('fresh');
  });
});

describe('Phase 10 — nothing is imported into an archived folder', () => {
  it('importAsset refuses an archived destination folder, and one inside it, before touching any file', async () => {
    const old = buildFolder('old', `${ROOT}/Archive/Old`, 'archived');
    const inner = { ...buildFolder('inner', `${ROOT}/Archive/Old/Inner`, 'active'), parentId: 'old' } as Folder;
    const application = makeApplication([], [buildFolder('archive', `${ROOT}/Archive`, 'active'), old, inner]);

    await expect(application.importAsset('/tmp/photo.png', old.path)).rejects.toThrow(/archived folder/);
    await expect(application.importAsset('/tmp/photo.png', inner.path)).rejects.toThrow(/archived folder/);
  });
});
