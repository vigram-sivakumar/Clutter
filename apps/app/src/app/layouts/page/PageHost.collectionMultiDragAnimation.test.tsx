// @vitest-environment jsdom

// The convergence of the other checked items onto the pressed one while several are dragged from a Collection View —
// in every layout, through the real Application and page. Nothing is mocked but the browser's layout and
// `Element.animate` (which jsdom lacks, so a recording stand-in plays its part).
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeAnimate, stubReducedMotion } from './body/dragConvergence.testSupport';
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

let fake: ReturnType<typeof installFakeAnimate>;
beforeEach(() => {
  fake = installFakeAnimate();
});
afterEach(() => {
  fake.uninstall();
  vi.unstubAllGlobals();
});

const animatedIds = () => fake.animations.map((a) => (a.element as HTMLElement).dataset.dragId);
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120)); // past the two frames a commit waits for
  });
};

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

  it('flies the other checked items — contiguous or not — and never the pressed one', async () => {
    select('N1', 'N2', 'N4');
    await drag(card(ids.N2!), centre(card(ids.Alpha!)), { release: false });

    expect(animatedIds().sort()).toEqual([ids.N1, ids.N4].sort());
    expect(animatedIds()).not.toContain(ids.N2);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 0, clientY: 0 }));
    await flush();
  });

  it('a mixed selection of folders and notes flies too', async () => {
    select('N1', 'Beta', 'Alpha');
    await drag(card(ids.N1!), centre(card(ids.Gamma ? ids.Alpha! : ids.Alpha!)), { release: false });

    expect(animatedIds().sort()).toEqual([ids.Alpha, ids.Beta].sort());
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 0, clientY: 0 }));
    await flush();
  });

  it('Escape flies them back, and nothing moves', async () => {
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });
    expect(fake.animations.every((a) => a.reversed === 0)).toBe(true);

    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

    expect(fake.animations.every((a) => a.reversed === 1)).toBe(true);
    fake.animations.forEach((a) => a.complete());
    await flush();
    expect(fake.animations.every((a) => a.cancelled)).toBe(true);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 0, clientY: 0 }));
    await settle();
    expect(parentOf('N1')).toBe(ids.Projects);
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('releasing with no valid drop flies them back', async () => {
    select('N1', 'N2');
    await drag(card(ids.N1!), { x: 900, y: 700 }); // empty space

    expect(fake.animations.every((a) => a.reversed === 1)).toBe(true);
    expect(parentOf('N2')).toBe(ids.Projects);
  });

  it('a refused drop flies them back (every item refused)', async () => {
    vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('no'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    select('N1', 'N2');

    await drag(card(ids.N1!), centre(card(ids.Alpha!)));

    expect(fake.animations.every((a) => a.reversed === 1)).toBe(true);
    expect(parentOf('N2')).toBe(ids.Projects);
    warn.mockRestore();
  });

  it('a successful move does not fly them back: the collection\'s update decides where they are', async () => {
    select('N1', 'N2');

    await drag(card(ids.N1!), centre(card(ids.Alpha!)));
    await flush();

    expect(parentOf('N2')).toBe(ids.Alpha);
    expect(fake.animations.every((a) => a.reversed === 0)).toBe(true);
    expect(fake.animations.every((a) => a.cancelled)).toBe(true); // nothing left on any element
  });

  it('repeated drags leave no stale animation: each starts clean', async () => {
    select('N3', 'N4');
    await drag(card(ids.N3!), { x: 900, y: 700 });
    fake.animations.forEach((a) => a.complete());
    await flush();
    const first = fake.animations.length;

    await drag(card(ids.N4!), { x: 900, y: 700 }, { release: false });
    // The second drag animates the other one (N3) afresh, and the first drag's animations are all cleared.
    expect(fake.animations.slice(first).map((a) => (a.element as HTMLElement).dataset.dragId)).toEqual([ids.N3]);
    expect(fake.animations.slice(0, first).every((a) => a.cancelled)).toBe(true);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 900, clientY: 700 }));
    await flush();
  });

  it('a single item drags as before: no convergence', async () => {
    select('N1');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });

    expect(fake.animations).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 0, clientY: 0 }));
    await flush();
  });

  it('an unchecked item is dragged alone, with no convergence of the others', async () => {
    select('N1', 'N2');
    await drag(card(ids.N4!), centre(card(ids.Alpha!)), { release: false });

    expect(fake.animations).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 0, clientY: 0 }));
    await flush();
  });

  it('with reduced motion they only fade — nothing travels', async () => {
    stubReducedMotion(true);
    select('N1', 'N2', 'N3');
    await drag(card(ids.N1!), centre(card(ids.Alpha!)), { release: false });

    expect(fake.animations.length).toBe(2);
    for (const animation of fake.animations) {
      expect(JSON.stringify(animation.keyframes)).not.toMatch(/transform/);
    }
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 0, clientY: 0 }));
    await flush();
  });
});

describe('the convergence and reordering', () => {
  beforeEach(() => setUp('list'));

  it('a reorder keeps the items\' new places and does not fly them back', async () => {
    select('N3', 'N4');

    await drag(card(ids.N3!), { x: 500, y: card(ids.N1!).getBoundingClientRect().top + 2 });
    await flush();

    const notes = (application.collectionViewConfigStore.get(`folder:${ids.Projects}`)?.sidebarOrder ?? []).filter((id) => id.startsWith('n:'));
    expect(notes).toEqual(['N3', 'N4', 'N1', 'N2'].map((name) => `n:${ids[name]}`));
    expect(fake.animations.every((a) => a.reversed === 0 && a.cancelled)).toBe(true);
  });
});
