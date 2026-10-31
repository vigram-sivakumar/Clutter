// @vitest-environment jsdom

// The convergence of the other checked items onto the pressed one while several are dragged from a Collection View —
// in every layout, through the real Application and page. Nothing is mocked but the browser's layout and
// `Element.animate` (which jsdom lacks, so a recording stand-in plays its part).
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFrameClock, stubReducedMotion } from './body/dragConvergence.testSupport';
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

let clock: ReturnType<typeof installFrameClock>;
beforeEach(() => {
  clock = installFrameClock();
});
afterEach(() => {
  clock.uninstall();
});

/** An item's drawn offset from where it started (the convergence's own transform). */
const offsetOf = (id: string) => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(card(id).style.transform);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
};
const isClean = (id: string) => card(id).style.transform === '' && card(id).style.opacity === '';
const flying = (id: string) => card(id).style.transform !== '' || card(id).style.opacity !== '';
const FULL = 400;
const CONVERGENCE_HALF = 110;
const advance = (ms: number) => act(() => clock.step(ms));
const movePointer = (x: number, y: number) => act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y }));
const release = (x = 0, y = 0) => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y }));

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

describe.each(['list', 'table', 'card'] as const)('the convergence in the %s layout', (layout) => {
  beforeEach(() => setUp(layout));

  it('flies the other checked items — contiguous or not — toward the CURSOR, and never the pressed one', async () => {
    select('N1', 'N2', 'N4');
    await drag(card(ids.N2!), { x: 820, y: 650 }, { release: false });
    advance(FULL);

    // Each drawn centre is the pointer's: from + offset = pointer.
    for (const name of ['N1', 'N4']) {
      const from = centre(card(ids[name]!)); // (the mocked layout does not move with the transform)
      expect({ x: from.x + offsetOf(ids[name]!).x, y: from.y + offsetOf(ids[name]!).y }).toEqual({ x: 820, y: 650 });
    }
    expect(offsetOf(ids.N2!)).toEqual({ x: 0, y: 0 }); // the pressed one is the ghost's, not animated
    release();
    advance(FULL);
  });

  it('a pointer that keeps moving is followed — the destination is never a stale coordinate', async () => {
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), { x: 450, y: 300 }, { release: false });
    advance(80); // mid-flight
    movePointer(900, 120);
    advance(FULL);

    const from = centre(card(ids.N3!));
    expect({ x: from.x + offsetOf(ids.N3!).x, y: from.y + offsetOf(ids.N3!).y }).toEqual({ x: 900, y: 120 });
    release();
    advance(FULL);
  });

  it('Escape returns each item to its own original place, from wherever it had got to', async () => {
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), { x: 450, y: 300 }, { release: false });
    advance(FULL);
    movePointer(800, 600);
    advance(32);
    const away = offsetOf(ids.N3!);
    expect(away).not.toEqual({ x: 0, y: 0 });

    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    advance(CONVERGENCE_HALF);
    expect(offsetOf(ids.N3!).x).toBeLessThan(away.x); // on its way back from where it was…
    advance(FULL);

    expect(isClean(ids.N2!)).toBe(true); // …each to ITS OWN place: nothing is left on any of them
    expect(isClean(ids.N3!)).toBe(true);
    release();
    await settle();
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('releasing over an invalid destination returns them from where they are', async () => {
    select('N1', 'N2');
    await drag(card(ids.N1!), { x: 900, y: 700 }, { release: false });
    advance(FULL);
    expect(flying(ids.N2!)).toBe(true);

    release(900, 700);
    await settle();
    advance(CONVERGENCE_HALF);
    expect(flying(ids.N2!)).toBe(true); // flying back, not snapped
    advance(FULL);

    expect(isClean(ids.N2!)).toBe(true);
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('a refused drop returns them as well', async () => {
    vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('no'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    select('N1', 'N2');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    advance(FULL);

    release(centre(card(ids.Alpha!)).x, centre(card(ids.Alpha!)).y);
    await settle();
    advance(CONVERGENCE_HALF);
    expect(flying(ids.N2!)).toBe(true);
    advance(FULL);

    expect(isClean(ids.N2!)).toBe(true);
    expect(parentOf('N2')).toBe(ids.Projects);
    warn.mockRestore();
  });

  it('a successful move does not snap them back: they stay where the cursor left them until the update has rendered', async () => {
    select('N1', 'N2');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    advance(FULL);

    release(centre(card(ids.Alpha!)).x, centre(card(ids.Alpha!)).y);
    await settle();

    expect(parentOf('N2')).toBe(ids.Alpha);
    const stillThere = document.querySelector<HTMLElement>(`[data-drag-inside-only="true"][data-drag-id="${ids.N2}"]`);
    if (stillThere) {
      // (the page may already have dropped it) — if it is still mounted it has not been sent back
      expect(stillThere.style.transform).not.toBe('');
    }
    advance(FULL);
    expect(document.querySelector(`[data-drag-inside-only="true"][data-drag-id="${ids.N2}"]`)?.getAttribute('style') ?? '').not.toMatch(/translate/);
  });

  it('repeated drags leave no stale state: each starts clean', async () => {
    select('N3', 'N4');
    await drag(card(ids.N3!), { x: 900, y: 700 });
    advance(FULL / 4); // the return is still under way when the next drag starts

    await drag(card(ids.N4!), { x: 700, y: 650 }, { release: false });
    advance(FULL);
    const from = centre(card(ids.N3!));
    expect({ x: from.x + offsetOf(ids.N3!).x, y: from.y + offsetOf(ids.N3!).y }).toEqual({ x: 700, y: 650 });
    expect(offsetOf(ids.N4!)).toEqual({ x: 0, y: 0 });
    release(700, 650);
    await settle();
    advance(FULL);
    expect(isClean(ids.N3!)).toBe(true);
  });

  it('a single item drags as before: nothing animates', async () => {
    select('N1');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    advance(FULL);

    for (const name of ['N2', 'N3', 'N4']) expect(isClean(ids[name]!)).toBe(true);
    release();
    advance(FULL);
  });

  it('an unchecked item is dragged alone, with no convergence of the others', async () => {
    select('N1', 'N2');
    await drag(card(ids.N4!), centre(card(ids.Alpha!)), { release: false });
    advance(FULL);

    expect(isClean(ids.N1!)).toBe(true);
    expect(isClean(ids.N2!)).toBe(true);
    release();
    advance(FULL);
  });

  it('with reduced motion they only fade — nothing travels', async () => {
    stubReducedMotion(true);
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    advance(FULL);

    expect(card(ids.N2!).style.opacity).toBe('0');
    expect(card(ids.N2!).style.transform).toBe('');
    release();
    advance(FULL);
  });
});

describe('the convergence and reordering', () => {
  beforeEach(() => setUp('list'));

  it('a reorder keeps the items\' new places and does not fly them back', async () => {
    select('N3', 'N4');

    await drag(card(ids.N3!), { x: 500, y: card(ids.N1!).getBoundingClientRect().top + 2 });
    await settle();
    advance(FULL);

    const notes = (application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarOrder ?? []).filter((id) => id.startsWith('n:'));
    expect(notes).toEqual(['N3', 'N4', 'N1', 'N2'].map((name) => `n:${ids[name]}`));
    expect(isClean(ids.N4!)).toBe(true);
  });
});
