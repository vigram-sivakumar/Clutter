// @vitest-environment jsdom

// The shared drag visuals (components/drag-ghost/dragVisuals.ts) as a Collection View uses them — in every layout,
// for one item and for several, through the real Application and page. Nothing is mocked but the browser's layout
// and the animation clock (a manual one, so a flight can be inspected at any moment).
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFrameClock, stubReducedMotion } from '@components/drag-ghost/dragVisuals.testSupport';
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
let restoreMotion: (() => void) | undefined;
beforeEach(() => {
  clock = installFrameClock();
});
afterEach(() => {
  restoreMotion?.();
  restoreMotion = undefined;
  clock.uninstall();
});

const FULL = 600;
const advance = (ms: number) => act(() => clock.step(ms));
const movePointer = (x: number, y: number) => act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y }));
const release = (x = 0, y = 0) => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y }));
const escape = () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

const overlay = () => document.querySelector<HTMLElement>('.drag-visuals');
const clones = () => [...document.querySelectorAll<HTMLElement>('.drag-visuals .drag-ghost')];
const badge = () => document.querySelector('.drag-ghost-count')?.textContent ?? null;
const hidden = () => [...document.querySelectorAll<HTMLElement>('[data-drag-source="true"]')];
const centreOf = (el: HTMLElement) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.style.transform)!;
  return { x: Number(m[1]) + parseFloat(el.style.width) / 2, y: Number(m[2]) + parseFloat(el.style.height) / 2 };
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
    it('hides the original while its clone is dragged, and restores it if the drag is cancelled', async () => {
      await drag(card(ids.N2!), { x: 820, y: 650 }, { release: false });

      expect(hidden()).toEqual([card(ids.N2!)]);
      expect(clones()).toHaveLength(1);
      expect(badge()).toBeNull();
      expect(card(ids.N2!).isConnected).toBe(true); // hidden, never removed

      escape();
      advance(FULL);

      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);
      release();
    });

    it('a successful drop leaves the clone to go with the collection\'s update, and does not fly it back', async () => {
      await drag(card(ids.N2!), centre(card(ids.Alpha!)), { release: false });
      advance(FULL);

      release(centre(card(ids.Alpha!)).x, centre(card(ids.Alpha!)).y);
      await settle();
      expect(parentOf('N2')).toBe(ids.Alpha);
      advance(FULL);

      expect(overlay()).toBeNull();
      expect(hidden()).toHaveLength(0);
    });

    it('the ghost starts on the original, then sits centred on the cursor and follows it', async () => {
      const original = card(ids.N3!).getBoundingClientRect();
      await drag(card(ids.N3!), { x: 820, y: 650 }, { release: false });
      const [ghost] = clones() as [HTMLElement];
      expect(Math.round(centreOf(ghost).x)).toBe(Math.round(original.left + original.width / 2)); // no jump

      advance(FULL);
      expect(centreOf(ghost)).toEqual({ x: 820, y: 650 });
      movePointer(300, 500);
      expect(centreOf(ghost)).toEqual({ x: 300, y: 500 });
      release();
      advance(FULL);
    });
  });

  describe('several items', () => {
    it('keeps EVERY original visible and untouched, from the first frame to the end — contiguous or not', async () => {
      select('N1', 'N2', 'N4');
      await drag(card(ids.N2!), { x: 820, y: 650 }, { release: false });

      expect(entries().every(looksUntouched)).toBe(true);
      expect(clones()).toHaveLength(3);
      expect(badge()).toBe('3');
      advance(FULL);
      expect(entries().every(looksUntouched)).toBe(true);

      escape();
      advance(110);
      expect(entries().every(looksUntouched)).toBe(true);
      advance(FULL);
      expect(entries().every(looksUntouched)).toBe(true);
      expect(overlay()).toBeNull();
      expect(document.querySelectorAll('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked').length).toBeGreaterThan(0); // still selected
      release();
    });

    it('the other clones converge on the ghost, which is on the cursor — and follow it when it moves', async () => {
      select('N1', 'N2', 'N3');
      await drag(card(ids.N1!), { x: 450, y: 300 }, { release: false });
      advance(80);
      movePointer(900, 120);
      advance(FULL);

      const [lead, ...others] = clones();
      expect(centreOf(lead!)).toEqual({ x: 900, y: 120 });
      for (const other of others) expect(centreOf(other)).toEqual({ x: 900, y: 120 });
      release();
      advance(FULL);
    });

    it('only the background fill fades: 100% → 50% on the way out, back to 100% on the way back — never the clone or its contents', async () => {
      const fill = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('--drag-ghost-fill-opacity'));
      const noOpacity = () => [...document.querySelectorAll<HTMLElement>('.drag-visuals .drag-ghost, .drag-visuals .drag-ghost *')].every((el) => el.style.opacity === '');
      select('N1', 'N2', 'N3');
      await drag(card(ids.N1!), { x: 820, y: 650 }, { release: false });
      const [lead, other] = clones() as [HTMLElement, HTMLElement];
      expect(fill(other)).toBe(100);
      advance(70);
      expect(fill(other)).toBeLessThan(100);
      expect(fill(other)).toBeGreaterThan(50);
      advance(FULL);
      expect(fill(other)).toBe(50);
      expect(fill(lead)).toBe(50);
      expect(noOpacity()).toBe(true);

      escape();
      advance(100);
      expect(fill(other)).toBeGreaterThan(50); // rising back…
      expect(fill(other)).toBeLessThan(100);
      expect(noOpacity()).toBe(true);
      expect(overlay()).not.toBeNull(); // …and nothing removed before it has arrived
      advance(FULL);
      expect(overlay()).toBeNull();
      release();
    });

    it('a successful drop leaves the clones where they are — no return, no fade — until the update has rendered', async () => {
      select('N1', 'N2');
      await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
      advance(FULL);
      const lead = clones()[0]!;
      const where = centreOf(lead);

      release(centre(card(ids.Alpha!)).x, centre(card(ids.Alpha!)).y);
      await settle();
      advance(16);

      if (lead.isConnected) {
        expect(centreOf(lead)).toEqual(where);
        expect(lead.style.opacity).toBe('');
        expect(parseFloat(lead.style.getPropertyValue('--drag-ghost-fill-opacity'))).toBe(50);
      }
      advance(FULL);
      expect(overlay()).toBeNull();
    });

    it('Escape flies the clones back, then removes them; nothing moved', async () => {
      select('N1', 'N2', 'N3');
      await drag(card(ids.N1!), { x: 450, y: 300 }, { release: false });
      advance(FULL);

      escape();
      expect(overlay()).not.toBeNull(); // on its way back
      advance(FULL);

      expect(overlay()).toBeNull();
      release();
      await settle();
      expect(['N1', 'N2', 'N3'].map(parentOf)).toEqual([ids.Projects, ids.Projects, ids.Projects]);
    });

    it('a release over an invalid destination, and a refused drop, fly the clones back too', async () => {
      select('N1', 'N2');
      await drag(card(ids.N1!), { x: 900, y: 700 });
      await settle();
      expect(overlay()).not.toBeNull();
      advance(FULL);
      expect(overlay()).toBeNull();

      vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('no'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await drag(card(ids.N1!), centre(card(ids.Alpha!)));
      await settle();
      expect(overlay()).not.toBeNull();
      advance(FULL);
      expect(overlay()).toBeNull();
      expect(parentOf('N2')).toBe(ids.Projects);
      warn.mockRestore();
    });

    it('a successful move does not fly them back: the clones stay where the cursor left them until the update has rendered', async () => {
      select('N1', 'N2');
      await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
      advance(FULL);
      const [lead] = clones();
      const where = centreOf(lead!);

      release(centre(card(ids.Alpha!)).x, centre(card(ids.Alpha!)).y);
      await settle();

      expect(parentOf('N1')).toBe(ids.Alpha);
      expect(parentOf('N2')).toBe(ids.Alpha);
      if (lead!.isConnected) expect(centreOf(lead!)).toEqual(where); // held, not sent back
      advance(FULL);
      expect(overlay()).toBeNull();
    });

    it('an unchecked item is dragged alone: a single-item drag with its own original hidden', async () => {
      select('N1', 'N2');
      await drag(card(ids.N4!), centre(card(ids.Alpha!)), { release: false });

      expect(clones()).toHaveLength(1);
      expect(hidden()).toEqual([card(ids.N4!)]);
      release();
      advance(FULL);
    });
  });

  describe('every way a drag ends, repeatedly, leaves nothing behind', () => {
    it.each([
      ['Escape', async () => escape()],
      ['a pointer cancel', async () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
      ['losing the window', async () => act(() => void fireEvent.blur(window))],
      ['a release over empty space', async () => release(900, 700)],
    ] as const)('%s — with the next drag starting before the last has finished flying back', async (_name, end) => {
      select('N1', 'N2', 'N4');
      for (let round = 0; round < 3; round += 1) {
        await drag(card(ids.N1!), { x: 800 + round, y: 600 }, { release: false });
        advance(40);
        await end();
        await settle();
        advance(30);
        // Always exactly one overlay, never two.
        expect(document.querySelectorAll('.drag-visuals').length).toBeLessThanOrEqual(1);
      }
      release();
      await settle();
      advance(FULL);

      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);
      expect(clock.pending()).toBe(0);
    });

    it('several successful moves in a row', async () => {
      for (const [from, to] of [[['N1', 'N2'], 'Alpha'], [['N3'], 'Beta']] as const) {
        select(...from);
        await drag(card(ids[from[0]]!), centre(card(ids[to]!)));
        await settle();
        advance(FULL);
      }

      expect(parentOf('N1')).toBe(ids.Alpha);
      expect(parentOf('N3')).toBe(ids.Beta);
      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);
    });

    it('the page going away mid-drag', async () => {
      select('N1', 'N2', 'N3');
      await drag(card(ids.N1!), { x: 800, y: 600 }, { release: false });
      advance(60);

      cleanup();
      advance(FULL);

      expect(overlay()).toBeNull();
      expect(clock.pending()).toBe(0);
    });
  });

  it('with reduced motion: originals untouched, the ghost on the cursor at once, no convergence, an instant end', async () => {
    restoreMotion = stubReducedMotion(true);
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), { x: 820, y: 650 }, { release: false });

    expect(clones()).toHaveLength(1);
    expect(centreOf(clones()[0]!)).toEqual({ x: 820, y: 650 });
    expect(entries().every(looksUntouched)).toBe(true);
    escape();
    expect(overlay()).toBeNull();
    release();
  });
});

describe('where no animation frames run', () => {
  beforeEach(() => setUp('list'));

  it('a cancelled and a committed drag still end, on their safety timers', async () => {
    // Frames are accepted and never run (a window that is not painted); only the real timers can end anything.
    clock.uninstall();
    window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
    const wait = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
    try {
      select('N1', 'N2');
      await drag(card(ids.N1!), { x: 900, y: 700 }); // invalid: a cancel
      await wait(700);
      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);

      await drag(card(ids.N1!), centre(card(ids.Alpha!))); // a move: a commit
      await wait(500);
      expect(overlay()).toBeNull();
      expect(entries().every(looksUntouched)).toBe(true);
    } finally {
      clock = installFrameClock();
    }
  });
});

describe('reordering', () => {
  beforeEach(() => setUp('list'));

  it('several items reorder together and the clones go with the update; none fly back', async () => {
    select('N3', 'N4');

    await drag(card(ids.N3!), { x: 500, y: card(ids.N1!).getBoundingClientRect().top + 2 });
    await settle();
    advance(FULL);

    const notes = (application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarOrder ?? []).filter((id) => id.startsWith('n:'));
    expect(notes).toEqual(['N3', 'N4', 'N1', 'N2'].map((name) => `n:${ids[name]}`));
    expect(overlay()).toBeNull();
    expect(entries().every(looksUntouched)).toBe(true);
  });
});
