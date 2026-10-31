// @vitest-environment jsdom

// The shared drag visuals (components/drag-ghost/dragVisuals.ts) as a Collection View uses them — in every layout,
// for one item and for several, through the real Application and page. Nothing is mocked but the browser's layout.
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

/** A Collection View entry (a folder card or a note row) of the page. */
const card = (id: string) => document.querySelector<HTMLElement>(`[data-drag-inside-only="true"][data-drag-id="${id}"]`)!;
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

const movePointer = (x: number, y: number) => act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y }));
const release = (x = 0, y = 0) => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y }));
const escape = () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

const overlay = () => document.querySelector<HTMLElement>('.drag-visuals');
const ghosts = () => [...document.querySelectorAll<HTMLElement>('.drag-visuals .drag-ghost:not(.drag-ghost--piece)')];
const pieces = () => [...document.querySelectorAll<HTMLElement>('.drag-snapshot .drag-ghost--piece')];
const snapshot = () => document.querySelector<HTMLElement>('.drag-snapshot');
const hidden = () => [...document.querySelectorAll<HTMLElement>('[data-drag-source="true"]')];
const boxOf = (el: HTMLElement) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), width: parseFloat(el.style.width), height: parseFloat(el.style.height) };
};
const centreOf = (el: HTMLElement) => {
  const b = boxOf(el);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** The page's own entries (never the sidebar's rows, never a clone). */
const entries = () => [...document.querySelectorAll<HTMLElement>('[data-drag-inside-only="true"]')];
const looksUntouched = (el: HTMLElement) => !el.hasAttribute('data-drag-source') && el.style.opacity === '' && el.style.transform === '' && el.style.visibility === '';

async function setUp(layout: 'list' | 'table' | 'card') {
  // Projects: folders Alpha, Beta; notes N1..N4 (Manual order, so a reorder is possible in the one-column layouts).
  await build([['Projects', null], ['Alpha', 'Projects'], ['Beta', 'Projects'], ['Gamma', null]], [['N1', 'Projects'], ['N2', 'Projects'], ['N3', 'Projects'], ['N4', 'Projects']]);
  application.collectionViewConfigStore.update(`folder:${ids.Projects}`, {
    layout,
    sidebarSort: { key: 'manual', direction: 'down' },
    sidebarOrder: ['N1', 'N2', 'N3', 'N4'].map((name) => `n:${ids[name]}`),
  });
  await show('Projects');
}

describe.each(['list', 'table', 'card'] as const)('the shared drag visuals in the %s layout', (layout) => {
  beforeEach(() => setUp(layout));

  describe('one item', () => {
    it('draws one ghost, hides the original (kept in the DOM) and follows the pointer directly', async () => {
      await drag(card(ids.N2!), { x: 820, y: 650 }, { release: false });

      expect(ghosts()).toHaveLength(1);
      expect(pieces()).toHaveLength(0);
      expect(hidden()).toEqual([card(ids.N2!)]);
      expect(card(ids.N2!).isConnected).toBe(true);
      expect(centreOf(ghosts()[0]!)).toEqual({ x: 820, y: 650 }); // on the cursor at once

      movePointer(300, 500);
      expect(centreOf(ghosts()[0]!)).toEqual({ x: 300, y: 500 }); // and exactly, on every move
      release();
    });

    it.each([
      ['Escape', async () => escape()],
      ['a pointer cancel', async () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
      ['losing the window', async () => act(() => void fireEvent.blur(window))],
      ['a release over empty space', async () => release(900, 700)],
    ] as const)('%s ends it at once: the ghost is gone and the original is back', async (_name, end) => {
      await drag(card(ids.N2!), { x: 820, y: 650 }, { release: false });

      await end();

      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);
      release();
    });

    it('a successful drop ends it at once and the move happens', async () => {
      await drag(card(ids.N2!), centre(card(ids.Alpha!)));
      await settle();

      expect(parentOf('N2')).toBe(ids.Alpha);
      expect(overlay()).toBeNull();
      expect(hidden()).toHaveLength(0);
    });
  });

  describe('several items', () => {
    it('draws ONE snapshot — a piece for each selected item at its own place and size — and keeps EVERY original visible and untouched throughout', async () => {
      select('N1', 'N2', 'N4');
      const before = entries().map((el) => el.outerHTML);
      await drag(card(ids.N2!), { x: 820, y: 650 }, { release: false });

      expect(snapshot()).not.toBeNull();
      expect(ghosts()).toHaveLength(0);
      expect(pieces()).toHaveLength(3);
      expect(entries().map((el) => el.outerHTML)).toEqual(before); // nothing hidden, restyled or marked

      const box = boxOf(snapshot()!);
      movePointer(300, 500);
      const moved = boxOf(snapshot()!);
      expect({ dx: moved.x - box.x, dy: moved.y - box.y }).toEqual({ dx: 300 - 820, dy: 500 - 650 }); // one unit, following directly
      expect(entries().map((el) => el.outerHTML)).toEqual(before);

      escape();
      expect(overlay()).toBeNull();
      expect(entries().map((el) => el.outerHTML)).toEqual(before);
      release();
    });

    it('mirrors the originals: each piece has its original\'s size and its distance from the others', async () => {
      select('N1', 'N2', 'N3');
      const rects = ['N1', 'N2', 'N3'].map((name) => card(ids[name]!).getBoundingClientRect());
      await drag(card(ids.N1!), { x: 820, y: 650 }, { release: false });

      const origin = { x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)) };
      const drawn = pieces().map((p) => ({ left: parseFloat(p.style.left), top: parseFloat(p.style.top), width: parseFloat(p.style.width), height: parseFloat(p.style.height) }));
      expect(drawn).toEqual(rects.map((r) => ({ left: r.left - origin.x, top: r.top - origin.y, width: r.width, height: r.height })));
      release();
    });

    it.each([
      ['Escape', async () => escape()],
      ['a pointer cancel', async () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
      ['losing the window', async () => act(() => void fireEvent.blur(window))],
      ['a release over empty space', async () => release(900, 700)],
    ] as const)('%s ends it at once, and nothing moved', async (_name, end) => {
      select('N1', 'N2');
      await drag(card(ids.N1!), { x: 820, y: 650 }, { release: false });

      await end();
      await settle();

      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);
      expect(['N1', 'N2'].map(parentOf)).toEqual([ids.Projects, ids.Projects]);
      release();
    });

    it('a refused drop ends it at once and leaves the items where they were', async () => {
      vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('no'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      select('N1', 'N2');

      await drag(card(ids.N1!), centre(card(ids.Alpha!)));
      await settle();

      expect(overlay()).toBeNull();
      expect(parentOf('N2')).toBe(ids.Projects);
      warn.mockRestore();
    });

    it('a successful move ends it at once and moves every selected item', async () => {
      select('N1', 'N2');

      await drag(card(ids.N1!), centre(card(ids.Alpha!)));
      await settle();

      expect(overlay()).toBeNull();
      expect(parentOf('N1')).toBe(ids.Alpha);
      expect(parentOf('N2')).toBe(ids.Alpha);
    });

    it('an unchecked item is dragged alone: a single-item ghost with its own original hidden', async () => {
      select('N1', 'N2');
      await drag(card(ids.N4!), centre(card(ids.Alpha!)), { release: false });

      expect(pieces()).toHaveLength(0);
      expect(hidden()).toEqual([card(ids.N4!)]);
      release();
    });
  });

  it('repeated drags — every way of ending — leave nothing behind, and always at most one overlay', async () => {
    select('N1', 'N2', 'N4');
    for (const end of [escape, () => release(900, 700), () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))]) {
      await drag(card(ids.N1!), { x: 800, y: 600 }, { release: false });
      expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
      end();
      await settle();
      expect(overlay()).toBeNull();
    }
    release();
    expect(entries().every(looksUntouched)).toBe(true);
  });

  it('the page going away mid-drag leaves no ghost behind', async () => {
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), { x: 800, y: 600 }, { release: false });

    cleanup();

    expect(overlay()).toBeNull();
  });
});

describe('reordering', () => {
  beforeEach(() => setUp('list'));

  it('several items reorder together, with one grid ghost that is gone at once on the drop', async () => {
    select('N3', 'N4');
    await drag(card(ids.N3!), { x: 500, y: card(ids.N1!).getBoundingClientRect().top + 2 }, { release: false });
    expect(pieces()).toHaveLength(2);
    release(500, card(ids.N1!).getBoundingClientRect().top + 2);
    await settle();

    const notes = (application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarOrder ?? []).filter((id) => id.startsWith('n:'));
    expect(notes).toEqual(['N3', 'N4', 'N1', 'N2'].map((name) => `n:${ids[name]}`));
    expect(overlay()).toBeNull();
    expect(entries().every(looksUntouched)).toBe(true);
  });

  it('a single item reorders too', async () => {
    await drag(card(ids.N4!), { x: 500, y: card(ids.N1!).getBoundingClientRect().top + 2 });
    await settle();

    const notes = (application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarOrder ?? []).filter((id) => id.startsWith('n:'));
    expect(notes).toEqual(['N4', 'N1', 'N2', 'N3'].map((name) => `n:${ids[name]}`));
    expect(overlay()).toBeNull();
  });
});

describe('reordering in the card layout — the same ordering, validation and write as list and table, along a grid\'s rows', () => {
  // Four note cards in a 2-column grid with a 16px gap (220 × 300 each); the folder cards keep the harness's own boxes.
  const GRID = (index: number) => ({ left: 400 + (index % 2) * 236, top: 100 + Math.floor(index / 2) * 316, width: 220, height: 300 });
  const indicator = () => document.querySelector<HTMLElement>('[data-drop-feedback="insert"]');
  const storedNotes = () => (application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarOrder ?? []).filter((id) => id.startsWith('n:')).map((id) => Object.keys(ids).find((name) => ids[name] === id.slice(2)));
  /** The page's note cards (and list rows) in the order they are drawn. */
  const drawn = () => [...document.querySelectorAll<HTMLElement>('[data-drag-inside-only="true"][data-drag-kind="note"]')].map((el) => Object.keys(ids).find((name) => ids[name] === el.dataset.dragId));

  beforeEach(async () => {
    await setUp('card');
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const base = spy.getMockImplementation()!;
    spy.mockImplementation(function (this: Element) {
      const el = this as HTMLElement;
      if (el.dataset?.dragReorder === 'grid') {
        const index = [...document.querySelectorAll('[data-drag-reorder="grid"]')].indexOf(el);
        const r = GRID(index);
        return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect;
      }
      return base.call(this);
    });
  });

  it('every note card is a reorder position in a Manual folder; folder cards stay places to move into', () => {
    expect(document.querySelectorAll('[data-drag-reorder="grid"]')).toHaveLength(4);
    expect(card(ids.Alpha!)).not.toHaveAttribute('data-drag-reorder');
    expect(card(ids.Beta!)).not.toHaveAttribute('data-drag-reorder');
  });

  it('shows a vertical line — the list\'s own indicator, turned — centred in the gap before a card, as tall as the card, and not over any card', async () => {
    await drag(card(ids.N3!), { x: 410, y: 250 }, { release: false }); // the left half of N1

    const line = indicator()!;
    expect(line).toHaveClass('drop-feedback--insert');
    expect(line).toHaveClass('drop-feedback--insert-vertical');
    expect(line.style.left).toBe(`${400 - 8}px`); // half the grid's 16px gap before N1's left edge
    expect(line.style.top).toBe('100px');
    expect(line.style.height).toBe('300px');
    release();
  });

  it('follows the pointer across a grid: after a card in its row, and in the gap between two cards', async () => {
    await drag(card(ids.N4!), { x: 560, y: 250 }, { release: false }); // the right half of N1
    expect(indicator()!.style.left).toBe(`${620 + 8}px`);

    movePointer(628, 250); // in the gap between N1 and N2: it belongs to the nearest card, so the line holds the gap
    expect(indicator()!.style.left).toBe(`${620 + 8}px`);

    movePointer(800, 250); // the right half of N2: the end of the row
    expect(indicator()!.style.left).toBe(`${856 + 8}px`);

    movePointer(410, 560); // the second row
    expect(indicator()!.style.top).toBe('416px');
    release();
  });

  it('removes the line at once: on Escape, a pointer cancel, a release, and when the pointer leaves any valid position', async () => {
    await drag(card(ids.N3!), { x: 410, y: 250 }, { release: false });
    expect(indicator()).not.toBeNull();

    movePointer(1100, 700); // empty space, well beyond any gap: no valid position
    expect(indicator()).toBeNull();
    movePointer(410, 250);
    expect(indicator()).not.toBeNull();
    escape();
    expect(indicator()).toBeNull();
    release();
    await settle();
    expect(storedNotes()).toEqual(['N1', 'N2', 'N3', 'N4']); // unchanged
  });

  it.each([
    ['before the first card', 'N4', { x: 410, y: 250 }, ['N4', 'N1', 'N2', 'N3']],
    ['in the middle (before a later card)', 'N1', { x: 410, y: 560 }, ['N2', 'N1', 'N3', 'N4']],
    ['after a card (the middle of the order)', 'N1', { x: 800, y: 250 }, ['N2', 'N1', 'N3', 'N4']],
    ['after the last card', 'N1', { x: 800, y: 560 }, ['N2', 'N3', 'N4', 'N1']],
    ['before a card that was after it', 'N2', { x: 410, y: 560 }, ['N1', 'N2', 'N3', 'N4']],
  ] as const)('dragging a card %s reorders it, and nothing is moved into a folder', async (_name, from, at, expected) => {
    const move = vi.spyOn(application.pageOperations, 'move');

    await drag(card(ids[from]!), at);
    await settle();

    expect(storedNotes()).toEqual(expected);
    expect(move).not.toHaveBeenCalled();
    expect(parentOf(from)).toBe(ids.Projects);
    expect(indicator()).toBeNull();
    expect(overlay()).toBeNull();
  });

  it('a card dropped on a folder card is still moved into it — and the order is left alone', async () => {
    await drag(card(ids.N2!), centre(card(ids.Alpha!)));
    await settle();

    expect(parentOf('N2')).toBe(ids.Alpha);
    expect(storedNotes()).toEqual(['N1', 'N3', 'N4']); // (only the sidebar's own forgetting of a moved-out item)
  });

  it('reorders a selected group together — contiguous or not — keeping its relative order, and the line marks the group\'s one position', async () => {
    select('N1', 'N3');
    await drag(card(ids.N3!), { x: 800, y: 560 }, { release: false }); // after N4
    expect(document.querySelectorAll('[data-drop-feedback="insert"]')).toHaveLength(1);
    expect(snapshot()).not.toBeNull(); // the group is one snapshot of the grid
    release(800, 560);
    await settle();

    expect(storedNotes()).toEqual(['N2', 'N4', 'N1', 'N3']);
  });

  it('a contiguous group moves up in front of an unselected card', async () => {
    select('N3', 'N4');
    await drag(card(ids.N4!), { x: 410, y: 250 });
    await settle();

    expect(storedNotes()).toEqual(['N3', 'N4', 'N1', 'N2']);
  });

  it('is not offered in an automatic sort: no reorder attributes, no line, nothing written', async () => {
    application.collectionViewConfigStore.update(`folder:${ids.Projects}`, { sidebarSort: { key: 'name', direction: 'down' } });
    await show('Projects');
    const before = JSON.stringify(application.collectionViewConfigStore.get(`folder:${ids.Projects}`));

    expect(document.querySelectorAll('[data-drag-reorder]')).toHaveLength(0);
    await drag(card(ids.N3!), { x: 410, y: 250 }, { release: false });
    expect(indicator()).toBeNull();
    release();
    await settle();

    expect(JSON.stringify(application.collectionViewConfigStore.get(`folder:${ids.Projects}`))).toBe(before);
  });

  it('the new order persists and the list and table show it too — one order for every layout', async () => {
    await drag(card(ids.N4!), { x: 410, y: 250 });
    await settle();
    expect(drawn()).toEqual(['N4', 'N1', 'N2', 'N3']);

    for (const layout of ['list', 'table'] as const) {
      application.collectionViewConfigStore.update(`folder:${ids.Projects}`, { layout });
      await show('Projects');
      expect(drawn()).toEqual(['N4', 'N1', 'N2', 'N3']);
    }
  });
});
