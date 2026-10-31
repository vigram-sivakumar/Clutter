// @vitest-environment jsdom

// Dragging SEVERAL checked notes and folders together from a Collection View — through the real Application, the real
// Sidebar and the real page: every move is the domain's (PageOperations.move / FolderOperations.move), validated by
// its canMove twins on hover (for the whole drag) and again at the drop. Nothing is mocked but the browser's layout.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';

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
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const ROOT = '/vault';
let application: Application;
let fileSystem: InMemoryVaultFileSystem;
const ids: Record<string, string> = {};

/** Folders and notes made through the real operations (real ids, directories and files). */
async function build(folders: Array<[string, string | null]>, notes: Array<[string, string]> = []) {
  fileSystem = new InMemoryVaultFileSystem();
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  application = new Application(vault, fileSystem, new SelfWriteRegistry(), undefined, undefined, CollectionViewConfigStore.empty(fileSystem, ROOT));
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  for (const [name, parent] of folders) {
    ids[name] = await application.folderOperations.create(name, parent === null ? null : ids[parent]!);
  }
  for (const [title, folder] of notes) {
    ids[title] = await application.pageOperations.create({ folderId: ids[folder]!, title });
  }
}

async function show(folderName: string) {
  cleanup();
  render(<AppLayout application={application} />);
  fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
  await act(async () => {
    await application.folderOperations.open(ids[folderName]!);
  });
}

beforeEach(() => {
  // Sidebar rows (.entry) stack down the left from y=100; Collection View entries stack down the right.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const zero = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

    if (el.classList.contains('entry') && !el.closest('.drag-ghost')) {
      const rows = Array.from(document.querySelectorAll('.entry')).filter((row) => !row.closest('.drag-ghost'));
      return rect(12, 100 + Math.max(0, rows.indexOf(el)) * 28, 236, 28);
    }
    if (el.classList.contains('view--content')) {
      return rect(0, 100, 260, 600); // the sidebar's scrolling area (made scrollable by the tests that need it)
    }
    if (el.dataset?.dragInsideOnly === 'true') {
      const cards = Array.from(document.querySelectorAll('[data-drag-inside-only="true"]'));
      return rect(400, 100 + Math.max(0, cards.indexOf(el)) * 60, 300, 40);
    }
    return zero;
  });
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const feedback = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-drop-feedback]'));

/** A Collection View entry (a folder card or a note row) of the page. */
const card = (id: string) => document.querySelector<HTMLElement>(`[data-drag-inside-only="true"][data-drag-id="${id}"]`)!;
/** A sidebar tree row. */
const row = (id: string) => document.querySelector<HTMLElement>(`.entry[data-drag-id="${id}"]`)!;
const centre = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const parentOf = (name: string) => (application.vault.getFolder(ids[name]!) ?? application.vault.getPage(ids[name]!))?.parentId;

async function drag(source: HTMLElement, target: { x: number; y: number }, options: { release?: boolean } = {}) {
  const from = centre(source);
  fireEvent.pointerDown(source, { button: 0, pointerId: 1, isPrimary: true, clientX: from.x, clientY: from.y });
  act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: target.x, clientY: target.y }));
  if (options.release !== false) {
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: target.x, clientY: target.y }));
    await settle();
  }
}


const checkbox = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
const select = (...names: string[]) => names.forEach((name) => fireEvent.click(checkbox(name)));
const checkedNames = () =>
  screen
    .getAllByRole('checkbox', { hidden: true })
    .filter((box) => (box as HTMLInputElement).checked || box.getAttribute('aria-checked') === 'true')
    .map((box) => box.getAttribute('aria-label'));
const ghostBadge = () => document.querySelector('.drag-ghost-count')?.textContent ?? null;

describe('dragging several checked items from a Collection View', () => {
  // Projects: folders Alpha (with Inner), Beta; notes N1, N2, N3.   Gamma: a root folder.
  beforeEach(async () => {
    await build(
      [['Projects', null], ['Alpha', 'Projects'], ['Inner', 'Alpha'], ['Beta', 'Projects'], ['Gamma', null]],
      [['N1', 'Projects'], ['N2', 'Projects'], ['N3', 'Projects']]
    );
    await show('Projects');
  });

  it('a single checked item is an ordinary single drag: no badge, its original hidden', async () => {
    select('N1');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });

    expect(ghostBadge()).toBeNull();
    expect(card(ids.N1!)).toHaveAttribute('data-drag-source', 'true');
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 400, clientY: 120 }));
    await settle();
    expect(parentOf('N1')).toBe(ids.Alpha);
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('dragging one of several checked notes moves all of them into the folder, each once', async () => {
    const move = vi.spyOn(application.pageOperations, 'move');
    select('N1', 'N2');

    await drag(card(ids.N2!), centre(card(ids.Alpha!))); // starts from the SECOND checked one

    expect(parentOf('N1')).toBe(ids.Alpha);
    expect(parentOf('N2')).toBe(ids.Alpha);
    expect(parentOf('N3')).toBe(ids.Projects);
    expect(move.mock.calls.map(([id]) => id).sort()).toEqual([ids.N1, ids.N2].sort());
  });

  it('a count badge shows on the ghost, the checked items stay in place and checked, and nothing is cleared at the start', async () => {
    select('N1', 'N2', 'Beta');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });

    expect(ghostBadge()).toBe('3');
    expect(checkedNames()).toEqual(['Select Beta', 'Select N1', 'Select N2']);
    // Several items dragged together are all still shown (only a single item's original is hidden).
    expect(document.querySelectorAll('[data-drag-source="true"]')).toHaveLength(0);
    expect(feedback()).toHaveLength(1);

    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 400, clientY: 120 }));
    await settle();
  });

  it('the ghost hides the selection checkbox (it belongs to the original)', () => {
    const css = readFileSync(join(__dirname, '../../../components/drag-ghost/DragGhost.css'), 'utf8');

    expect(css).toMatch(/\.drag-ghost \.collection-card__selection,\s*\.drag-ghost \.collection-entry__selection-checkbox\s*\{\s*visibility: hidden;/);
  });

  it('moves several checked folders', async () => {
    await build([['Projects', null], ['Alpha', 'Projects'], ['Beta', 'Projects'], ['Delta', 'Projects'], ['Gamma', null]]);
    await show('Projects');
    select('Alpha', 'Beta');

    await drag(card(ids.Alpha!), centre(card(ids.Delta!)));

    expect(parentOf('Alpha')).toBe(ids.Delta);
    expect(parentOf('Beta')).toBe(ids.Delta);
  });

  it('moves a mixed selection of notes and folders', async () => {
    select('N1', 'Beta', 'N3');

    await drag(card(ids.Beta!), centre(card(ids.Alpha!)));

    expect(parentOf('N1')).toBe(ids.Alpha);
    expect(parentOf('Beta')).toBe(ids.Alpha);
    expect(parentOf('N3')).toBe(ids.Alpha);
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('into a sidebar folder too', async () => {
    select('N1', 'N2');

    await drag(card(ids.N1!), centre(row(ids.Gamma!)));

    expect(parentOf('N1')).toBe(ids.Gamma);
    expect(parentOf('N2')).toBe(ids.Gamma);
  });

  it('starting from an item that is not checked drags that item alone, and leaves the selection as it was', async () => {
    select('N1', 'N2');

    await drag(card(ids.N3!), centre(card(ids.Alpha!)), { release: false });
    expect(ghostBadge()).toBeNull();
    expect(checkedNames()).toEqual(['Select N1', 'Select N2']);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 400, clientY: 120 }));
    await settle();

    expect(parentOf('N3')).toBe(ids.Alpha);
    expect(parentOf('N1')).toBe(ids.Projects);
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('a folder in the drag cannot go into itself: no highlight, nothing moves', async () => {
    select('Alpha', 'Beta');

    await drag(card(ids.Beta!), centre(card(ids.Alpha!)), { release: false });
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 400, clientY: 120 }));
    await settle();

    expect(parentOf('Alpha')).toBe(ids.Projects);
    expect(parentOf('Beta')).toBe(ids.Projects);
  });

  it('a selected folder cannot be moved into a descendant of another selected folder: the whole drop is refused', async () => {
    select('Alpha', 'Beta', 'N1');

    await drag(card(ids.Beta!), centre(row(ids.Inner!)), { release: false }); // Inner is Alpha's child
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: centre(row(ids.Inner!)).y }));
    await settle();

    expect(parentOf('Alpha')).toBe(ids.Projects);
    expect(parentOf('Beta')).toBe(ids.Projects);
    expect(parentOf('N1')).toBe(ids.Projects);
  });

  it('dropping onto the folder the items are already in is a no-op: no highlight, nothing moves', async () => {
    const move = vi.spyOn(application.pageOperations, 'move');
    select('N1', 'N2');

    await drag(card(ids.N1!), centre(row(ids.Projects!)), { release: false });
    expect(feedback().map((f) => f.dataset.dropFeedback)).not.toContain('inside');
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: centre(row(ids.Projects!)).y }));
    await settle();

    expect(move).not.toHaveBeenCalled();
  });

  it('a note whose name is taken in the destination still moves — the domain gives it a free name — with no toast', async () => {
    await application.pageOperations.create({ folderId: ids.Alpha!, title: 'N2' }); // a different note, same name
    await show('Projects');
    select('N1', 'N2', 'N3');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await drag(card(ids.N1!), centre(card(ids.Alpha!)));

    expect(parentOf('N1')).toBe(ids.Alpha);
    expect(parentOf('N3')).toBe(ids.Alpha);
    expect(screen.queryByText(/couldn.t move/i)).toBeNull();
    warn.mockRestore();
  });

  it('a move that throws midway is skipped silently and the rest still move', async () => {
    const real = application.pageOperations.move.bind(application.pageOperations);
    vi.spyOn(application.pageOperations, 'move').mockImplementation(async (id, destination) => {
      if (id === ids.N2) throw new Error('boom');
      return real(id, destination);
    });
    select('N1', 'N2', 'N3');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await drag(card(ids.N1!), centre(card(ids.Alpha!)));

    expect(parentOf('N1')).toBe(ids.Alpha);
    expect(parentOf('N2')).toBe(ids.Projects);
    expect(parentOf('N3')).toBe(ids.Alpha);
    expect(screen.queryByText(/couldn.t move/i)).toBeNull();
    warn.mockRestore();
  });
});

describe('several checked items and Inbox', () => {
  const nav = (zone: 'templates' | 'inbox') => document.querySelector<HTMLElement>(`[data-drop-zone="${zone}"]`)!;

  beforeEach(async () => {
    await build([['Projects', null], ['Pack', 'Projects']], [['N1', 'Projects'], ['N2', 'Projects']]);
    await application.folderOperations.ensureReservedFolder('templates');
    await application.folderOperations.ensureReservedFolder('inbox');
    await show('Projects');
    nav('templates').getBoundingClientRect = () => ({ left: 12, top: 40, width: 236, height: 28, right: 248, bottom: 68, x: 12, y: 40, toJSON: () => ({}) }) as DOMRect;
    nav('inbox').getBoundingClientRect = () => ({ left: 12, top: 70, width: 236, height: 28, right: 248, bottom: 98, x: 12, y: 70, toJSON: () => ({}) }) as DOMRect;
  });

  it('Inbox takes a selection of notes', async () => {
    select('N1', 'N2');

    await drag(card(ids.N1!), { x: 60, y: 84 });

    expect(application.vault.getPage(ids.N1!)!.path).toBe(`${ROOT}/Inbox/N1.md`);
    expect(application.vault.getPage(ids.N2!)!.path).toBe(`${ROOT}/Inbox/N2.md`);
  });

  it('a mixed selection is refused by Inbox as a whole: no highlight, and not even its notes move', async () => {
    select('N1', 'Pack');

    await drag(card(ids.N1!), { x: 60, y: 84 }, { release: false });
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: 84 }));
    await settle();

    expect(parentOf('N1')).toBe(ids.Projects);
    expect(parentOf('Pack')).toBe(ids.Projects);
  });

  it('Templates takes the same mixed selection', async () => {
    select('N1', 'Pack');

    await drag(card(ids.N1!), { x: 60, y: 54 });

    expect(application.vault.getPage(ids.N1!)!.path).toBe(`${ROOT}/Templates/N1.md`);
    expect(application.vault.getFolder(ids.Pack!)!.path).toBe(`${ROOT}/Templates/Pack`);
  });
});
