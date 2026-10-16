// @vitest-environment jsdom

// Dragging notes and folders into folders ACROSS surfaces — Collection View ↔ Collection View, Collection View ↔
// Sidebar — through the real Application, the real Sidebar and the real page: the move is always the domain's
// (PageOperations.move / FolderOperations.move), validated by its canMove twins on hover and again at the drop.
// Nothing is mocked but the browser's layout, which jsdom lacks.
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
import { collectionViewKeyForFolder } from '@core/application/collection/collectionViewKey';

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

describe('Collection View → Collection View', () => {
  // Projects: folders Alpha (with Inner), Beta; note N1.   Gamma: a root folder.
  beforeEach(async () => {
    await build(
      [['Projects', null], ['Alpha', 'Projects'], ['Inner', 'Alpha'], ['Beta', 'Projects'], ['Gamma', null]],
      [['N1', 'Projects']]
    );
    await show('Projects');
  });

  it('cards and note rows carry the drag markers; nothing else does', () => {
    expect(card(ids.Alpha!)).toBeTruthy();
    expect(card(ids.N1!)).toBeTruthy();
    expect(document.querySelectorAll('[data-drag-inside-only="true"]').length).toBe(3);
  });

  it('a note dragged onto a folder card moves into that folder', async () => {
    await drag(card(ids.N1!), centre(card(ids.Alpha!)));
    expect(parentOf('N1')).toBe(ids.Alpha);
  });

  it('a folder dragged onto another folder card moves into it, with its whole subtree', async () => {
    await drag(card(ids.Alpha!), centre(card(ids.Beta!)));
    expect(parentOf('Alpha')).toBe(ids.Beta);
    expect(application.vault.getFolder(ids.Inner!)!.path).toBe(`${ROOT}/Projects/Beta/Alpha/Inner`);
    expect(parentOf('Inner')).toBe(ids.Alpha);
  });

  it('highlights the destination card while hovering, and only that one', async () => {
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    expect(feedback()).toHaveLength(1);
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'inside');
    expect(feedback()[0]!.style.top).toBe(`${card(ids.Alpha!).getBoundingClientRect().top}px`);
  });

  it('a nested folder is reached by opening it: the same drop works one level down', async () => {
    await application.folderOperations.move(ids.Beta!, ids.Alpha!); // Projects > Alpha > Beta, Inner
    await show('Alpha');
    await drag(card(ids.Beta!), centre(card(ids.Inner!)));
    expect(parentOf('Beta')).toBe(ids.Inner);
  });

  it('no target — and no move — for a note, a folder dropped on itself, the gap between cards, or empty space', async () => {
    await drag(card(ids.Alpha!), centre(card(ids.Alpha!)), { release: false }); // itself
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 550, clientY: centre(card(ids.Alpha!)).y + 30 })); // the gap below it
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 550, clientY: centre(card(ids.N1!)).y })); // a note
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 900, clientY: 700 })); // empty space
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 900, clientY: 700 }));
    await settle();

    expect(parentOf('Alpha')).toBe(ids.Projects);
    expect(parentOf('N1')).toBe(ids.Projects);
  });

  it('a drop onto the folder the item is already in changes nothing', async () => {
    // Open Alpha, whose Inner card shows; dragging Inner onto… Alpha's own page offers no card for Alpha, so
    // the no-op is the sidebar row of the parent: Alpha (Inner's parent).
    await show('Alpha');
    await drag(card(ids.Inner!), centre(row(ids.Alpha!)), { release: false });
    expect(feedback()).toHaveLength(0);
  });
});

describe('the ghost of a Collection View folder card', () => {
  beforeEach(async () => {
    await build([['Projects', null], ['Alpha', 'Projects'], ['Gamma', null]], [['N1', 'Projects']]);
    await show('Projects');
  });

  it('keeps the card\'s own size, centred on the cursor — over the sidebar too', async () => {
    const source = card(ids.Alpha!);
    const size = source.getBoundingClientRect(); // 300 × 40
    await drag(source, { x: 120, y: 300 }, { release: false });
    const ghost = document.body.querySelector<HTMLElement>('.drag-ghost')!;
    expect(ghost.style.width).toBe(`${size.width}px`);
    expect(ghost.style.height).toBe(`${size.height}px`);
    expect(ghost.style.transform).toBe(`translate3d(${120 - size.width / 2}px, ${300 - size.height / 2}px, 0)`);
  });

  it('a note row dragged from the page gets the compact ghost', async () => {
    await drag(card(ids.N1!), { x: 120, y: 300 }, { release: false });
    expect(document.body.querySelector<HTMLElement>('.drag-ghost')!.style.width).toBe('256px');
  });

  it('a note CARD (Card layout) keeps its own width, unlike a table or list row', async () => {
    application.collectionViewConfigStore.update(collectionViewKeyForFolder(ids.Projects!), { layout: 'card' });
    await show('Projects');
    const source = card(ids.N1!);
    await drag(source, { x: 120, y: 300 }, { release: false });
    expect(source.hasAttribute('data-drag-ghost-size')).toBe(false);
    expect(document.body.querySelector<HTMLElement>('.drag-ghost')!.style.width).toBe(`${source.getBoundingClientRect().width}px`);
  });

  it('a sidebar row dragged out keeps the sidebar row\'s own width', async () => {
    const source = row(ids.Gamma!);
    await drag(source, { x: 500, y: 300 }, { release: false });
    expect(document.body.querySelector<HTMLElement>('.drag-ghost')!.style.width).toBe(`${source.getBoundingClientRect().width}px`);
  });
});

describe('Collection View → Sidebar', () => {
  beforeEach(async () => {
    await build(
      [['Projects', null], ['Alpha', 'Projects'], ['Inner', 'Alpha'], ['Beta', 'Projects'], ['Gamma', null]],
      [['N1', 'Projects']]
    );
    await show('Projects');
  });

  it('a note dragged onto a sidebar folder moves into it', async () => {
    await drag(card(ids.N1!), centre(row(ids.Gamma!)));
    expect(parentOf('N1')).toBe(ids.Gamma);
  });

  it('a folder dragged onto a sidebar folder moves into it', async () => {
    await drag(card(ids.Beta!), centre(row(ids.Gamma!)));
    expect(parentOf('Beta')).toBe(ids.Gamma);
  });

  it('works into a nested sidebar folder too', async () => {
    await drag(card(ids.N1!), centre(row(ids.Inner!)));
    expect(parentOf('N1')).toBe(ids.Inner);
    await show('Projects');
    await drag(card(ids.Beta!), centre(row(ids.Inner!)));
    expect(parentOf('Beta')).toBe(ids.Inner);
  });

  it('the middle of a sidebar row is "into"; its edge is a position — exactly as for a sidebar drag', async () => {
    await drag(card(ids.Beta!), centre(row(ids.Gamma!)), { release: false });
    expect(feedback().map((f) => f.dataset.dropFeedback)).toEqual(['inside']);
    const edge = row(ids.Gamma!).getBoundingClientRect().top + 1;
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: edge }));
    expect(feedback().map((f) => f.dataset.dropFeedback)).not.toContain('inside');
    expect(feedback().length).toBeGreaterThan(0);
  });

  it('a folder cannot be dropped into itself or into a descendant', async () => {
    await drag(card(ids.Alpha!), centre(row(ids.Inner!)), { release: false }); // its own child
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, ...{ clientX: centre(row(ids.Alpha!)).x, clientY: centre(row(ids.Alpha!)).y } })); // itself
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: centre(row(ids.Alpha!)).y }));
    await settle();
    expect(parentOf('Alpha')).toBe(ids.Projects);
  });

  it('a plain drop into a folder does not touch any sort or manual order', async () => {
    const before = JSON.stringify(application.collectionViewConfigStore.get(`folder:${ids.Projects}`));
    await drag(card(ids.Beta!), centre(row(ids.Gamma!)));
    expect(JSON.stringify(application.collectionViewConfigStore.get(`folder:${ids.Projects}`))).toBe(before);
    expect(JSON.stringify(application.collectionViewConfigStore.get(`folder:${ids.Gamma}`) ?? null)).toBe('null');
  });
});

/** The same drop, started from a sidebar row and from a Collection View entry, must end identically. */
describe('Collection View → Sidebar is the same as Sidebar → Sidebar', () => {
  type Source = 'sidebar' | 'collection';
  const pick = (source: Source, id: string) => (source === 'sidebar' ? row(id) : card(id));
  const edgeOf = (el: HTMLElement, edge: 'top' | 'bottom') => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: edge === 'top' ? r.top + 1 : r.bottom - 1 };
  };
  const outcome = (levelKey: string) => ({
    sort: application.collectionViewConfigStore.get(levelKey)?.sidebarSort ?? null,
    order: application.collectionViewConfigStore.get(levelKey)?.sidebarOrder ?? [],
  });
  const nameOf = (id: string | null | undefined) => (id ? (Object.keys(ids).find((k) => ids[k] === id) ?? id) : id);
  const names = (list: readonly string[]) => list.map((entry) => `${entry.slice(0, 2)}${nameOf(entry.slice(2))}`);

  const scenarios: Array<{
    name: string;
    dragged: string;
    on: string;
    at: 'top' | 'bottom' | 'middle';
    level: () => string;
  }> = [
    { name: 'a folder before a root folder', dragged: 'Beta', on: 'Gamma', at: 'top', level: () => 'sidebar:root' },
    { name: 'a folder after a root folder', dragged: 'Beta', on: 'Gamma', at: 'bottom', level: () => 'sidebar:root' },
    { name: 'a folder before a root folder (first position)', dragged: 'Alpha', on: 'Projects', at: 'top', level: () => 'sidebar:root' },
    { name: 'a note before a folder inside a folder (cross-parent)', dragged: 'N1', on: 'Inner', at: 'top', level: () => `folder:${ids.Alpha}` },
    { name: 'a folder into a folder', dragged: 'Beta', on: 'Gamma', at: 'middle', level: () => `folder:${ids.Gamma}` },
    { name: 'a note into a folder', dragged: 'N1', on: 'Inner', at: 'middle', level: () => `folder:${ids.Inner}` },
  ];

  for (const scenario of scenarios) {
    it(`${scenario.name}: same destination, order, sort and tree from either source`, async () => {
      const results: Record<Source, unknown> = {} as never;
      for (const source of ['sidebar', 'collection'] as const) {
        await build(
          [['Projects', null], ['Alpha', 'Projects'], ['Inner', 'Alpha'], ['Beta', 'Projects'], ['Gamma', null]],
          [['N1', 'Projects']]
        );
        await show('Projects');
        const target = row(ids[scenario.on]!);
        const point = scenario.at === 'middle' ? centre(target) : edgeOf(target, scenario.at);
        const sourceLevel = `folder:${ids.Projects}`;
        const sourceBefore = JSON.stringify(application.collectionViewConfigStore.get(sourceLevel) ?? null);
        await drag(pick(source, ids[scenario.dragged]!), point);

        results[source] = {
          parent: nameOf(parentOf(scenario.dragged)),
          destinationSort: outcome(scenario.level()).sort,
          destinationOrder: names(outcome(scenario.level()).order),
          sourceUnchanged: JSON.stringify(application.collectionViewConfigStore.get(sourceLevel) ?? null) === sourceBefore,
          subtree: nameOf(application.vault.getFolder(ids.Inner!)?.parentId),
        };
      }
      expect(results.collection).toEqual(results.sidebar);
    });
  }

  it('a positional drop switches only the destination level to Manual', async () => {
    await build(
      [['Projects', null], ['Alpha', 'Projects'], ['Beta', 'Projects'], ['Gamma', null]],
      [['N1', 'Projects']]
    );
    await show('Projects');
    await drag(card(ids.Beta!), edgeOf(row(ids.Gamma!), 'top'));
    expect(parentOf('Beta')).toBeNull();
    expect(outcome('sidebar:root').sort).toMatchObject({ key: 'manual' });
    expect(application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarSort ?? null).toBeNull();
  });

  for (const source of ['sidebar', 'collection'] as const) {
    it(`${source}: a cancelled drag and a drop on nothing leave tree, order and sort unchanged`, async () => {
      await build([['Projects', null], ['Beta', 'Projects'], ['Gamma', null]], [['N1', 'Projects']]);
      await show('Projects');
      const before = JSON.stringify([application.collectionViewConfigStore.get('sidebar:root') ?? null, parentOf('Beta')]);
      await drag(pick(source, ids.Beta!), edgeOf(row(ids.Gamma!), 'top'), { release: false });
      act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
      await settle();
      expect(feedback()).toHaveLength(0);
      await drag(pick(source, ids.Beta!), { x: 900, y: 900 });
      expect(JSON.stringify([application.collectionViewConfigStore.get('sidebar:root') ?? null, parentOf('Beta')])).toBe(before);
    });
  }
});

describe('Sidebar → Collection View', () => {
  beforeEach(async () => {
    await build(
      [['Projects', null], ['Alpha', 'Projects'], ['Gamma', null], ['Delta', null]],
      [['N1', 'Projects'], ['Loose', 'Gamma']]
    );
    await show('Projects');
  });

  it('a sidebar folder dragged onto a card moves into that folder', async () => {
    await drag(row(ids.Delta!), centre(card(ids.Alpha!)));
    expect(parentOf('Delta')).toBe(ids.Alpha);
  });

  it('the ghost travels out of the sidebar to the card: not clipped, not held to the sidebar\'s width', async () => {
    await drag(row(ids.Delta!), centre(card(ids.Alpha!)), { release: false });
    const ghost = document.body.querySelector<HTMLElement>('.drag-ghost')!;
    expect(ghost.parentElement).toBe(document.body);
    expect(ghost.style.transform).toMatch(/^translate3d\([1-9]\d*(\.\d+)?px, /); // moved right of the sidebar's edge
  });

  it('dragging across the Collection View selects no text — not the page title, not a card — and selection returns after the drop', async () => {
    const selectStart = (target: Element) => {
      const event = new Event('selectstart', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const title = document.querySelector<HTMLElement>('h1, .page__title, [class*="title"]')!;

    expect(selectStart(title)).toBe(false); // ordinary: nothing is blocked
    await drag(row(ids.Delta!), centre(card(ids.Alpha!)), { release: false });
    expect(selectStart(title)).toBe(true);
    expect(selectStart(card(ids.N1!))).toBe(true);
    expect(selectStart(document.body)).toBe(true);

    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 550, clientY: centre(card(ids.Alpha!)).y }));
    await settle();
    expect(selectStart(title)).toBe(false);
  });

  it('selection comes back after a cancelled drag and after a failed drop too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(application.folderOperations, 'move').mockRejectedValue(new Error('Cannot move'));
    const title = document.querySelector<HTMLElement>('h1, .page__title, [class*="title"]')!;
    const blocked = () => {
      const event = new Event('selectstart', { bubbles: true, cancelable: true });
      title.dispatchEvent(event);
      return event.defaultPrevented;
    };

    await drag(row(ids.Delta!), centre(card(ids.Alpha!)), { release: false });
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 550, clientY: 120 }));
    expect(blocked()).toBe(false);

    await drag(row(ids.Delta!), centre(card(ids.Alpha!))); // released over Alpha: the (mocked) move fails
    expect(blocked()).toBe(false);
    expect(document.body.style.userSelect).toBe('');
  });

  it('the ghost is centred under the cursor over the sidebar and over the page alike', async () => {
    await drag(row(ids.Delta!), { x: 100, y: 300 }, { release: false });
    const ghost = () => document.body.querySelector<HTMLElement>('.drag-ghost')!;
    const half = { w: parseFloat(ghost().style.width) / 2, h: parseFloat(ghost().style.height) / 2 };
    expect(ghost().style.transform).toBe(`translate3d(${100 - half.w}px, ${300 - half.h}px, 0)`);

    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 550, clientY: 140 })); // over a card in the page
    expect(ghost().style.transform).toBe(`translate3d(${550 - half.w}px, ${140 - half.h}px, 0)`);
  });

  it('a sidebar note dragged onto a card moves into that folder', async () => {
    await drag(row(ids.Loose!), centre(card(ids.Alpha!)));
    expect(parentOf('Loose')).toBe(ids.Alpha);
  });

  it('a note row in the page is not a destination', async () => {
    await drag(row(ids.Delta!), centre(card(ids.N1!)), { release: false });
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 550, clientY: centre(card(ids.N1!)).y }));
    await settle();
    expect(parentOf('Delta')).toBeNull();
  });

  it('Escape cancels: nothing moves and nothing stays highlighted', async () => {
    await drag(row(ids.Delta!), centre(card(ids.Alpha!)), { release: false });
    expect(feedback()).toHaveLength(1);
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 550, clientY: centre(card(ids.Alpha!)).y }));
    await settle();
    expect(parentOf('Delta')).toBeNull();
  });
});

describe('failed drops, selection and navigation', () => {
  beforeEach(async () => {
    await build([['Projects', null], ['Alpha', 'Projects'], ['Gamma', null]], [['N1', 'Projects']]);
    await show('Projects');
  });

  it('a move the operation rejects leaves everything where it was and the UI clean', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('Cannot move'));
    await drag(card(ids.N1!), centre(card(ids.Alpha!)));

    expect(parentOf('N1')).toBe(ids.Projects);
    expect(feedback()).toHaveLength(0);
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(card(ids.N1!)).not.toHaveAttribute('data-drag-source');
  });

  it('a successful drop does not open or select the moved item (the click after a drag is swallowed)', async () => {
    const before = application.workspace.activeFolderId;
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 550, clientY: centre(card(ids.Alpha!)).y }));
    fireEvent.click(card(ids.Alpha!)); // the click the browser fires after the release
    await settle();

    expect(parentOf('N1')).toBe(ids.Alpha);
    expect(application.workspace.activeFolderId).toBe(before);
    expect(application.workspace.activePageId).toBeFalsy();
  });

  it('an ordinary click on a card still opens it', async () => {
    fireEvent.pointerDown(card(ids.Alpha!), { button: 0, pointerId: 1, isPrimary: true, clientX: 410, clientY: 120 });
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 410, clientY: 120 }));
    fireEvent.click(card(ids.Alpha!));
    await settle();
    expect(application.workspace.activeFolderId).toBe(ids.Alpha);
  });
});

describe('Templates and Inbox destinations, from the Collection View', () => {
  const nav = (zone: 'templates' | 'inbox') => document.querySelector<HTMLElement>(`[data-drop-zone="${zone}"]`)!;

  beforeEach(async () => {
    await build([['Projects', null], ['Pack', 'Projects']], [['N1', 'Projects'], ['Inside', 'Pack']]);
    await application.folderOperations.ensureReservedFolder('templates');
    await application.folderOperations.ensureReservedFolder('inbox');
    // The nav entries are marked once their folders exist; drive the sidebar to draw them with the new state.
    await show('Projects');
    nav('templates').getBoundingClientRect = () => ({ left: 12, top: 40, width: 236, height: 28, right: 248, bottom: 68, x: 12, y: 40, toJSON: () => ({}) }) as DOMRect;
    nav('inbox').getBoundingClientRect = () => ({ left: 12, top: 70, width: 236, height: 28, right: 248, bottom: 98, x: 12, y: 70, toJSON: () => ({}) }) as DOMRect;
  });

  it('a note dropped on Templates moves in and becomes a template (the marker is written)', async () => {
    await drag(card(ids.N1!), { x: 60, y: 54 });
    expect(application.vault.getPage(ids.N1!)!.path).toBe(`${ROOT}/Templates/N1.md`);
    expect(await fileSystem.readFile(`${ROOT}/Templates/N1.md`)).toContain('kind: template');
  });

  it('a folder dropped on Templates moves in, and its notes are reclassified as templates', async () => {
    await drag(card(ids.Pack!), { x: 60, y: 54 });
    expect(application.vault.getFolder(ids.Pack!)!.path).toBe(`${ROOT}/Templates/Pack`);
    expect(await fileSystem.readFile(`${ROOT}/Templates/Pack/Inside.md`)).toContain('kind: template');
  });

  it('Inbox takes a note, and the same drag from here moves it there', async () => {
    await drag(card(ids.N1!), { x: 60, y: 84 });
    expect(application.vault.getPage(ids.N1!)!.path).toBe(`${ROOT}/Inbox/N1.md`);
  });

  it('Inbox rejects a folder: no highlight, no move', async () => {
    await drag(card(ids.Pack!), { x: 60, y: 84 }, { release: false });
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: 84 }));
    await settle();
    expect(parentOf('Pack')).toBe(ids.Projects);
  });
});

describe('the empty space below the sidebar\'s last row — from either source', () => {
  const sources = ['sidebar', 'collection'] as const;
  const pick = (source: (typeof sources)[number], id: string) => (source === 'sidebar' ? row(id) : card(id));
  const emptySpace = () => {
    const rows = Array.from(document.querySelectorAll('.entry')).filter((r) => !r.closest('.drag-ghost'));
    return { x: 130, y: 100 + rows.length * 28 + 120 };
  };
  const rootOrder = () => (application.collectionViewConfigStore.get('sidebar:root')?.sidebarOrder ?? []).map((e) => e.replace(/^[fn]:/, ''));
  const nameOf = (id: string) => Object.keys(ids).find((k) => ids[k] === id) ?? id;

  async function open(folders: Parameters<typeof build>[0], notes: Parameters<typeof build>[1], page = 'Projects') {
    await build(folders, notes);
    await show(page);
    (document.querySelector('.view--content') as HTMLElement).style.overflowY = 'auto';
  }

  for (const source of sources) {
    describe(source, () => {
      it('a folder dropped there lands last at the root, the root switches to Manual and the order is saved', async () => {
        await open([['Projects', null], ['Beta', 'Projects'], ['Gamma', null]], [['N1', 'Projects']]);
        await drag(pick(source, ids.Beta!), emptySpace(), { release: false });
        expect(feedback().map((f) => f.dataset.dropFeedback)).toEqual(['insert']);
        act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: emptySpace().x, clientY: emptySpace().y }));
        await settle();

        expect(parentOf('Beta')).toBeNull();
        expect(application.collectionViewConfigStore.get('sidebar:root')?.sidebarSort).toMatchObject({ key: 'manual' });
        expect(rootOrder().map(nameOf).slice(-1)).toEqual(['Beta']);
        // The source level keeps its own sort.
        expect(application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarSort ?? null).toBeNull();
      });

      it('below the last child of an expanded folder it is a root-level position, not a move into that folder', async () => {
        await open(
          [['Projects', null], ['Alpha', 'Projects'], ['Inner', 'Alpha'], ['Beta', 'Projects']],
          [['N1', 'Projects']]
        );
        await drag(pick(source, ids.Beta!), emptySpace());
        expect(parentOf('Beta')).toBeNull(); // not Projects' child, not Alpha's
        expect(rootOrder().map(nameOf)).toContain('Beta');
        expect(application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarSort ?? null).toBeNull();
      });

      it('a note is refused (the root holds no notes): no indicator, nothing changes', async () => {
        await open([['Projects', null], ['Gamma', null]], [['N1', 'Projects']]);
        const before = JSON.stringify(application.collectionViewConfigStore.get('sidebar:root') ?? null);
        await drag(pick(source, ids.N1!), emptySpace(), { release: false });
        expect(feedback()).toHaveLength(0);
        act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: emptySpace().x, clientY: emptySpace().y }));
        await settle();
        expect(parentOf('N1')).toBe(ids.Projects);
        expect(JSON.stringify(application.collectionViewConfigStore.get('sidebar:root') ?? null)).toBe(before);
      });

      it('Escape leaves the tree, the order and the sort untouched and clears the indicator', async () => {
        await open([['Projects', null], ['Beta', 'Projects'], ['Gamma', null]], [['N1', 'Projects']]);
        const before = JSON.stringify([application.collectionViewConfigStore.get('sidebar:root') ?? null, parentOf('Beta')]);
        await drag(pick(source, ids.Beta!), emptySpace(), { release: false });
        expect(feedback()).toHaveLength(1);
        act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
        await settle();
        expect(feedback()).toHaveLength(0);
        expect(JSON.stringify([application.collectionViewConfigStore.get('sidebar:root') ?? null, parentOf('Beta')])).toBe(before);
      });

      it('a folder cannot be sent below itself: the last root folder dragged there is no move', async () => {
        await open([['Projects', null], ['Zulu', null]], [['N1', 'Projects']], 'Projects');
        const before = JSON.stringify(application.collectionViewConfigStore.get('sidebar:root') ?? null);
        await drag(row(ids.Zulu!), emptySpace(), { release: false });
        expect(feedback()).toHaveLength(0);
        act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: emptySpace().x, clientY: emptySpace().y }));
        await settle();
        expect(JSON.stringify(application.collectionViewConfigStore.get('sidebar:root') ?? null)).toBe(before);
      });
    });
  }
});

describe('text selection during every drag — one guard, whatever the source, destination or exit', () => {
  const locked = () => document.documentElement.hasAttribute('data-pointer-drag');
  const title = () => document.querySelector<HTMLElement>('h1, .page__title, [class*="title"]')!;
  /** What the browser does while a press is held and the pointer travels: puts a selection on the page title. */
  const selectTitle = () => {
    const range = document.createRange();
    range.selectNodeContents(title());
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  };

  beforeEach(async () => {
    await build(
      [['Projects', null], ['Alpha', 'Projects'], ['Gamma', null], ['Delta', null]],
      [['N1', 'Projects']]
    );
    await show('Projects');
    document.getSelection()?.removeAllRanges();
  });

  // [name, the thing pressed, where it is taken]
  const sources: Array<[string, () => HTMLElement, () => { x: number; y: number }]> = [
    ['Sidebar folder row → Collection View card', () => row(ids.Delta!), () => centre(card(ids.Alpha!))],
    ['Sidebar note row → Collection View card', () => row(ids.N1!), () => centre(card(ids.Alpha!))],
    ['Sidebar folder grabbed by its caret → Collection View card', () => row(ids.Gamma!).querySelector<HTMLElement>('.caret-slot')!, () => centre(card(ids.Alpha!))],
    ['Collection View card → Sidebar row', () => card(ids.Alpha!), () => centre(row(ids.Gamma!))],
    ['Collection View note row → Sidebar row', () => card(ids.N1!), () => centre(row(ids.Gamma!))],
    ['Sidebar row → Sidebar row', () => row(ids.Delta!), () => centre(row(ids.Gamma!))],
  ];

  describe.each(sources)('%s', (_name, pressed, destination) => {
    /** `drag` presses at the centre of the thing; a caret is a child, so press on it directly. */
    const start = async () => {
      const el = pressed();
      const from = centre(el.closest<HTMLElement>('[data-drag-id]')!);
      fireEvent.pointerDown(el, { button: 0, pointerId: 1, isPrimary: true, clientX: from.x, clientY: from.y });
      act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: destination().x, clientY: destination().y }));
    };

    it('selection is suppressed for the whole drag — a selection the browser makes under the pointer is dropped', async () => {
      expect(locked()).toBe(false);
      await start();
      expect(locked()).toBe(true);
      expect(document.body.style.userSelect).toBe('none');

      selectTitle();
      expect(document.getSelection()!.rangeCount).toBe(0);
    });

    it.each([
      ['a successful drop', () => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 550, clientY: 120 }))],
      ['a drop outside the application window', () => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: -50, clientY: -50 }))],
      ['a drop on nothing', () => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 900, clientY: 900 }))],
      ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
      ['pointer cancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
      ['the window losing focus', () => act(() => void fireEvent.blur(window))],
    ])('selection works again after %s', async (_exit, end) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await start();
      end();
      await settle();

      expect(locked()).toBe(false);
      expect(document.body.style.userSelect).toBe('');
      selectTitle();
      expect(document.getSelection()!.rangeCount).toBe(1); // ordinary again: nothing removes it
    });

    it('selection works again after a drop the operation rejects', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(application.folderOperations, 'move').mockRejectedValue(new Error('Cannot move'));
      vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('Cannot move'));
      await start();
      act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: destination().x, clientY: destination().y }));
      await settle();

      expect(locked()).toBe(false);
      selectTitle();
      expect(document.getSelection()!.rangeCount).toBe(1);
    });
  });

  it('ordinary selection outside a drag is untouched, and a bare click on a row never takes the guard', () => {
    selectTitle();
    expect(document.getSelection()!.rangeCount).toBe(1);

    const el = row(ids.Delta!);
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 120 });
    expect(locked()).toBe(false);
    fireEvent.pointerUp(document, { pointerId: 1 });
    expect(locked()).toBe(false);
    expect(document.getSelection()!.rangeCount).toBe(1);
  });
});
