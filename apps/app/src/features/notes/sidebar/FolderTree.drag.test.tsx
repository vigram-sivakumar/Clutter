// @vitest-environment jsdom

// Phase 1 of folder drag-and-drop: the drag PRESENTATION only (threshold, ghost, cancellation). There are
// deliberately no drop targets, so every test here also pins that a drag changes nothing.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderTree, PageEntry, type SidebarRowActions } from './FolderTree';
import { DRAG_THRESHOLD_PX } from '@shared/interaction';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '@core/workspace/Workspace';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { stubReducedMotion } from '@components/drag-ghost/dragVisuals.testSupport';
// A drag's ghost eases onto the cursor and flies back when cancelled (dragVisuals.ts); these tests are about where
// it ends up, so they run with reduced motion, which places it there at once.
let restoreMotion: () => void;
beforeEach(() => {
  restoreMotion = stubReducedMotion(true);
});
afterEach(() => restoreMotion());


const ROOT = '/vault';

/** What the sidebar row measures as in a real layout (jsdom measures everything as 0). */
const ROW_RECT = { left: 12, top: 100, width: 236, height: 28 };

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: {
      defaultTemplateId: null,
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makePage(id: string, path: string, parentId: string | null): Page {
  return new PageBuilder().build({
    parentId,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function setup(folders: Folder[], pages: Page[] = [], resources: VaultResource[] = []) {
  const vault = new Vault(ROOT, pages, folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), resources);
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    documentRegistry,
    saveCoordinator,
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );
  const membershipSelector = new MembershipSelector(
    vault,
    query,
    new EffectivePageState(vault, query, pageOperations, workspace)
  );

  return {
    vault,
    query,
    workspace,
    membershipSelector,
    coordinator,
    fileSystem,
    pageOperations,
    folderOperations,
    enqueueSpy: vi.spyOn(coordinator, 'enqueue'),
    moveSpy: vi.spyOn(folderOperations, 'move'),
    renameSpy: vi.spyOn(folderOperations, 'rename'),
  };
}

function renderTree(env: ReturnType<typeof setup>, extra: { rowActions?: SidebarRowActions; enableDrag?: boolean } = {}) {
  const onFolderClick = vi.fn();
  const utils = render(
    <FolderTree
      query={env.query}
      membershipSelector={env.membershipSelector}
      workspace={env.workspace}
      parentId={null}
      level={0}
      onPageClick={vi.fn()}
      onDraftPageClick={vi.fn()}
      onFolderClick={onFolderClick}
      onCreateNote={vi.fn()}
      pendingNewFolder={null}
      onCommitNewFolder={vi.fn()}
      onCancelNewFolder={vi.fn()}
      enableDrag
      // Positions ("before/after this row") are only offered in a level ordered by hand.
      getFolderSort={() => ({ key: 'manual', direction: 'down' })}
      {...extra}
    />
  );
  return { ...utils, onFolderClick };
}

/** The real row for `title` — never the ghost's copy of it. */
function rowFor(title: string): HTMLElement {
  const rows = screen
    .getAllByText(title)
    .map((el) => el.closest('.entry') as HTMLElement)
    .filter((row) => !row.closest('.drag-ghost'));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

const ghost = () => document.body.querySelector<HTMLElement>('.drag-ghost');

/** Press on `target` at (x, y), then move the pointer by `dy` (and release, if asked). */
function press(target: Element, x = 40, y = 114) {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true, clientX: x, clientY: y });
}
function move(x: number, y: number) {
  act(() => {
    fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y });
  });
}
function release(x: number, y: number) {
  act(() => {
    fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y });
  });
}

let env: ReturnType<typeof setup>;

beforeEach(() => {
  env = setup([makeFolder('a', `${ROOT}/Alpha`, null), makeFolder('b', `${ROOT}/Beta`, null)]);
  // jsdom measures everything as 0. Rows are stacked top to bottom in document order, one ROW_RECT.height
  // apart from ROW_RECT.top; the ghost's copy of a row is placed by DragGhost itself, so its rect is moot.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!this.classList.contains('entry')) {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    }
    const rows = Array.from(document.querySelectorAll('.entry')).filter((row) => !row.closest('.drag-ghost'));
    const top = ROW_RECT.top + Math.max(0, rows.indexOf(this)) * ROW_RECT.height;
    return {
      left: ROW_RECT.left,
      top,
      width: ROW_RECT.width,
      height: ROW_RECT.height,
      right: ROW_RECT.left + ROW_RECT.width,
      bottom: top + ROW_RECT.height,
      x: ROW_RECT.left,
      y: top,
    } as DOMRect;
  });
});

afterEach(async () => {
  rules.allowFolderMoves = true;
  // A release arms a one-shot click swallower that disarms on the next task; let it, so it cannot eat the next test's click.
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
  document.body.removeAttribute('style');
});

describe('FolderTree drag: initiation', () => {
  it('starts a drag only after the pointer travels past the threshold', () => {
    renderTree(env);
    press(rowFor('Alpha'));

    move(40, 114 + DRAG_THRESHOLD_PX - 2);
    expect(ghost()).toBeNull();

    move(40, 114 + DRAG_THRESHOLD_PX + 2);
    expect(ghost()).not.toBeNull();
  });

  it('a plain click is not a drag: it still opens the folder and shows no ghost', () => {
    const { onFolderClick } = renderTree(env);
    const row = rowFor('Alpha');

    press(row);
    release(40, 114);
    fireEvent.click(row);

    expect(ghost()).toBeNull();
    expect(onFolderClick).toHaveBeenCalledTimes(1);
  });

  it('keyboard activation still works', () => {
    const { onFolderClick } = renderTree(env);
    fireEvent.keyDown(rowFor('Alpha'), { key: 'Enter' });
    expect(onFolderClick).toHaveBeenCalledTimes(1);
  });

  it('starts from the caret only once it is dragged — a click on the caret is still just the caret', () => {
    const { container } = renderTree(env);
    const caret = container.querySelector('.folder__caret .caret-slot')!;

    press(caret);
    move(40, 114 + DRAG_THRESHOLD_PX - 2);
    expect(ghost()).toBeNull();

    move(40, 160);
    expect(ghost()).not.toBeNull();
  });

  it('does not start from the row actions ("+")', () => {
    renderTree(env);
    const add = rowFor('Alpha').querySelector('.entry__actions button')!;
    press(add);
    move(40, 160);
    expect(ghost()).toBeNull();
  });

  it('does not start from a non-primary button', () => {
    renderTree(env);
    fireEvent.pointerDown(rowFor('Alpha'), { button: 2, pointerId: 1, isPrimary: true, clientX: 40, clientY: 114 });
    move(40, 160);
    expect(ghost()).toBeNull();
  });

  it('does not start while the folder is being renamed', () => {
    const rowActions = new Proxy(
      { editingId: 'a', openMenuId: null, noteMoveDestinations: [], resourceMoveDestinations: [], createFolderInZone: () => undefined },
      { get: (target, key) => (key in target ? (target as Record<PropertyKey, unknown>)[key] : vi.fn()) }
    ) as unknown as SidebarRowActions;
    renderTree(env, { rowActions });

    press(screen.getByRole('textbox'));
    move(40, 160);
    expect(ghost()).toBeNull();
  });
});

describe('FolderTree drag: ghost', () => {
  it("is the row's own width and height, and leaves the original row in place", () => {
    renderTree(env);
    const rowsBefore = document.querySelectorAll('.entry').length;
    const row = rowFor('Alpha');
    press(row, 40, 114);
    move(40, 140);

    const g = ghost()!;
    expect(g.style.width).toBe(`${ROW_RECT.width}px`);
    expect(g.style.height).toBe(`${ROW_RECT.height}px`);
    expect(g).toHaveTextContent('Alpha');

    // Original row: same node, same place, subdued; no rows added to the tree (the ghost is portaled out).
    expect(rowFor('Alpha')).toBe(row);
    expect(row).toHaveClass('entry--drag-source');
    expect(rowFor('Beta')).not.toHaveClass('entry--drag-source');
    expect(document.querySelectorAll('.entry').length).toBe(rowsBefore + 1);
    expect(g.closest('.sidebar, [data-testid]')).toBeNull();
  });

  it('is an inert picture: no pointer events, hidden from assistive tech, no duplicated ids or roles', () => {
    renderTree(env);
    press(rowFor('Alpha'));
    move(40, 140);

    const g = ghost()!;
    expect(g).toHaveAttribute('aria-hidden', 'true');
    expect(g).toHaveAttribute('inert');
    expect(g.querySelector('[role], [tabindex], [id]')).toBeNull();
    expect(g.closest('.drag-visuals')!.parentElement).toBe(document.body);
  });

  it('is centred under the cursor on both axes, wherever the row is and however the pointer moves', () => {
    renderTree(env);
    // The ghost is the row's own 236px wide and 28px tall: its centre is (118, 14).
    press(rowFor('Alpha'), 40, 114);
    move(40, 140);
    expect(ghost()!.style.transform).toBe('translate3d(-78px, 126px, 0)'); // 40 − 118, 140 − 14

    move(90, 200);
    expect(ghost()!.style.transform).toBe('translate3d(-28px, 186px, 0)');

    move(700, 650); // far outside the sidebar, over the page: still centred on the cursor
    expect(ghost()!.style.transform).toBe('translate3d(582px, 636px, 0)');
    expect(ghost()!.style.width).toBe(`${ROW_RECT.width}px`); 
  });

  it('is centred regardless of where in the row it was grabbed', () => {
    renderTree(env);
    press(rowFor('Alpha'), 20, 102); // near the row's top-left corner
    move(300, 400);
    expect(ghost()!.style.transform).toBe('translate3d(182px, 386px, 0)'); // 300 − 118, 400 − 14
  });

  it('is as wide as the row, whatever width the sidebar has been resized to', () => {
    renderTree(env);
    press(rowFor('Alpha'));
    move(40, 140);
    expect(ghost()!.style.width).toBe(`${ROW_RECT.width}px`);

    ROW_RECT.width = 300;
    try {
      move(40, 150);
      expect(ghost()!.style.width).toBe(`${ROW_RECT.width}px`);
    } finally {
      ROW_RECT.width = 236;
    }
  });

  it('locks text selection for the drag and restores it afterwards', () => {
    renderTree(env);
    press(rowFor('Alpha'));
    move(40, 140);
    expect(document.body.style.userSelect).toBe('none');

    release(40, 140);
    expect(document.body.style.userSelect).toBe('');
  });
});

describe('FolderTree drag: the original row is invisible but keeps its space', () => {
  // Stylesheets are not loaded in jsdom (see Folder.css.test.ts), so the rule is read from source.
  const entryCss = readFileSync(resolve(process.cwd(), 'src/components/entry/Entry.css'), 'utf-8');
  const rule = entryCss.match(/\.entry--drag-source\s*{([^}]*)}/)?.[1] ?? '';

  it('the drag-source rule is opacity: 0 and never removes the row from layout', () => {
    expect(rule).toMatch(/opacity:\s*0\s*;/);
    expect(rule).not.toMatch(/visibility|display/);
  });

  it('only the original row carries it; the ghost, a separate element, does not', () => {
    renderTree(env);
    const row = rowFor('Alpha');
    press(row);
    move(40, 160);

    expect(row).toHaveClass('entry--drag-source');
    expect(ghost()!.classList.contains('entry--drag-source')).toBe(false);
    expect(ghost()!.querySelector('.entry--drag-source')).toBeNull();
    expect(ghost()!.closest('.entry--drag-source')).toBeNull();
  });

  it.each([
    ['release', () => release(40, 160)],
    ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ['pointercancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
  ])('is restored immediately on %s', (_name, end) => {
    renderTree(env);
    const row = rowFor('Alpha');
    press(row);
    move(40, 160);
    expect(row).toHaveClass('entry--drag-source');

    end();
    expect(row).not.toHaveClass('entry--drag-source');
  });
});

describe('FolderTree drag: ending', () => {
  it('release removes the ghost and the dimming, and swallows the click so the folder does not open or toggle', () => {
    const { onFolderClick } = renderTree(env);
    const row = rowFor('Alpha');
    press(row);
    move(40, 160);
    release(40, 160);

    expect(ghost()).toBeNull();
    expect(row).not.toHaveClass('entry--drag-source');

    fireEvent.click(row);
    expect(onFolderClick).not.toHaveBeenCalled();
    // …but only that one click: the next real click works.
    fireEvent.click(row);
    expect(onFolderClick).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels immediately, restores the row, and the release afterwards still does not click', () => {
    const { onFolderClick } = renderTree(env);
    const row = rowFor('Alpha');
    press(row);
    move(40, 160);
    expect(ghost()).not.toBeNull();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(ghost()).toBeNull();
    expect(row).not.toHaveClass('entry--drag-source');
    expect(document.body.style.userSelect).toBe('');

    // Moving on after Escape does not bring it back.
    move(40, 200);
    expect(ghost()).toBeNull();

    release(40, 200);
    fireEvent.click(row);
    expect(onFolderClick).not.toHaveBeenCalled();
  });

  it('pointercancel ends the drag', () => {
    renderTree(env);
    press(rowFor('Alpha'));
    move(40, 160);
    act(() => {
      fireEvent.pointerCancel(document, { pointerId: 1 });
    });
    expect(ghost()).toBeNull();
  });

  it('unmounting mid-drag removes the ghost, the listeners and the body lock', () => {
    const { unmount } = renderTree(env);
    press(rowFor('Alpha'));
    move(40, 160);
    expect(ghost()).not.toBeNull();

    unmount();
    expect(ghost()).toBeNull();
    expect(document.body.style.userSelect).toBe('');
    // A stray move after unmount is a no-op.
    expect(() => move(40, 300)).not.toThrow();
    expect(ghost()).toBeNull();
  });

  it('changes nothing: no folder operation, no persistence, no parent or order change', () => {
    renderTree(env);
    const before = JSON.stringify(Array.from(env.vault.folders()));
    const orderBefore = screen.getAllByText(/Alpha|Beta/).map((el) => el.textContent);

    press(rowFor('Alpha'));
    move(40, 200); // well past Beta's row
    release(40, 200);

    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.renameSpy).not.toHaveBeenCalled();
    expect(env.enqueueSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(Array.from(env.vault.folders()))).toBe(before);
    expect(screen.getAllByText(/Alpha|Beta/).map((el) => el.textContent)).toEqual(orderBefore);
  });
});

describe('FolderTree drag: existing behavior is preserved', () => {
  it('the caret still toggles expansion and does not open the folder', () => {
    const child = makeFolder('c', `${ROOT}/Alpha/Child`, 'a');
    env = setup([makeFolder('a', `${ROOT}/Alpha`, null), child]);
    const { container, onFolderClick } = renderTree(env);
    const caret = container.querySelector('.folder__caret .caret-slot') as HTMLElement;

    press(caret);
    release(40, 114);
    fireEvent.click(caret);

    expect(env.workspace.isFolderExpanded('a')).toBe(false);
    expect(onFolderClick).not.toHaveBeenCalled();
  });

  it('clicking the "+" still creates a note and does not open the folder', () => {
    const onCreateNote = vi.fn();
    const onFolderClick = vi.fn();
    render(
      <FolderTree
        query={env.query}
        membershipSelector={env.membershipSelector}
        workspace={env.workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={onFolderClick}
        onCreateNote={onCreateNote}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );
    const add = rowFor('Alpha').querySelector('.entry__actions button')!;
    press(add);
    release(40, 114);
    fireEvent.click(add);

    expect(onCreateNote).toHaveBeenCalledWith('a');
    expect(onFolderClick).not.toHaveBeenCalled();
  });
});

describe('FolderTree drag: notes', () => {
  beforeEach(() => {
    env = setup([makeFolder('a', `${ROOT}/Alpha`, null)], [makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a')]);
  });

  it('a note drags with the same ghost, dimmed source and cleanup as a folder', () => {
    renderTree(env);
    const row = rowFor('Note One');
    press(row);

    move(40, 114 + DRAG_THRESHOLD_PX - 2);
    expect(ghost()).toBeNull();

    move(40, 150);
    expect(ghost()).toHaveTextContent('Note One');
    expect(ghost()!.style.width).toBe(`${ROW_RECT.width}px`);
    expect(ghost()!.style.height).toBe(`${ROW_RECT.height}px`);
    expect(row).toHaveClass('entry--drag-source');
    expect(rowFor('Alpha')).not.toHaveClass('entry--drag-source');
    // Exactly one ghost.
    expect(document.body.querySelectorAll('.drag-ghost')).toHaveLength(1);
  });

  it('a note and a folder with the same id are not confused', () => {
    env = setup([makeFolder('same', `${ROOT}/Alpha`, null)], [makePage('same', `${ROOT}/Alpha/Note One.md`, 'same')]);
    renderTree(env);
    press(rowFor('Note One'));
    move(40, 150);
    expect(rowFor('Note One')).toHaveClass('entry--drag-source');
    expect(rowFor('Alpha')).not.toHaveClass('entry--drag-source');
  });

  it('a normal click still opens the note and shows no ghost', () => {
    const onPageClick = vi.fn();
    render(
      <FolderTree
        query={env.query}
        membershipSelector={env.membershipSelector}
        workspace={env.workspace}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
        enableDrag
      />
    );
    const row = rowFor('Note One');
    press(row);
    release(40, 114);
    fireEvent.click(row);

    expect(ghost()).toBeNull();
    expect(onPageClick).toHaveBeenCalledExactlyOnceWith('n1');
  });

  it('release swallows the click (the note does not open) and changes nothing', () => {
    const onPageClick = vi.fn();
    render(
      <FolderTree
        query={env.query}
        membershipSelector={env.membershipSelector}
        workspace={env.workspace}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
        enableDrag
      />
    );
    const row = rowFor('Note One');
    press(row);
    move(40, 200);
    release(40, 200);

    expect(ghost()).toBeNull();
    expect(row).not.toHaveClass('entry--drag-source');
    fireEvent.click(row);
    expect(onPageClick).not.toHaveBeenCalled();
    expect(env.enqueueSpy).not.toHaveBeenCalled();
    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.vault.getPage('n1')!.path).toBe(`${ROOT}/Alpha/Note One.md`);
  });

  it.each([
    ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ['pointercancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
  ])('%s restores the note row', (_name, end) => {
    renderTree(env);
    const row = rowFor('Note One');
    press(row);
    move(40, 150);
    end();

    expect(ghost()).toBeNull();
    expect(row).not.toHaveClass('entry--drag-source');
  });
});

describe('FolderTree drag: scope is the Notes section only', () => {
  beforeEach(() => {
    env = setup([makeFolder('a', `${ROOT}/Alpha`, null)], [makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a')]);
  });

  it('without enableDrag, neither folders nor notes drag (the default for any other reuse of FolderTree)', () => {
    renderTree(env, { enableDrag: false });
    press(rowFor('Alpha'));
    move(40, 160);
    expect(ghost()).toBeNull();
    release(40, 160);

    press(rowFor('Note One'));
    move(40, 160);
    expect(ghost()).toBeNull();
  });

  it('PageEntry used outside the Notes tree (Tasks, Tags, Daily Notes, Favorites…) is not draggable by default', () => {
    const page = env.membershipSelector.getNotesChildPages('a')[0]!;
    render(
      <PageEntry
        entry={page}
        level={0}
        workspace={env.workspace}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
      />
    );
    press(rowFor('Note One'));
    move(40, 160);
    expect(ghost()).toBeNull();
  });

  it('only the Notes section turns drag on: enableDrag is passed by Sidebar.Notes and by nothing else', () => {
    const files = execFileSync('grep', ['-rlE', '--include=*.tsx', '--exclude=*.test.tsx', 'enableDrag', 'src'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean)
      .sort();

    expect(files).toEqual([
      'src/features/notes/sidebar/FolderTree.tsx',
      'src/features/notes/sidebar/Sidebar.Notes.tsx',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Drop-target feedback: which region of which row the pointer is over, and the one indicator it shows.
// Rows (28px tall, from y=100): Alpha 100, Note One 128, Child 156, Beta 184, Gamma 212 — Alpha is expanded.
// ---------------------------------------------------------------------------------------------------------

const feedback = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-drop-feedback]'));
const only = () => {
  const found = feedback();
  expect(found.length).toBeLessThanOrEqual(1);
  return found[0] ?? null;
};

/** The drop tree on an in-memory disk too, so a drop that really moves things can run end to end. */
async function setupDropTreeOnDisk() {
  const e = setupDropTree();
  for (const folder of e.vault.folders()) {
    await e.fileSystem.createDirectory(folder.path);
  }
  const page = e.vault.getPage('n1')!;
  e.fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  return e;
}

function setupDropTree() {
  const folders = [
    makeFolder('a', `${ROOT}/Alpha`, null),
    makeFolder('c', `${ROOT}/Alpha/Child`, 'a'),
    makeFolder('b', `${ROOT}/Beta`, null),
    makeFolder('g', `${ROOT}/Gamma`, null),
  ];
  return setup(folders, [makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a')]);
}

/** Lets a test flip the move rules between the moment a target is shown and the release. */
const rules = { allowFolderMoves: true };

function dropActions(e: ReturnType<typeof setup>): SidebarRowActions {
  return new Proxy(
    {
      // The Move picker's own handlers, wired to the real operations.
      onMoveNote: (pageId: string, destinationId: string | null) => e.pageOperations.move(pageId, destinationId),
      onMoveFolder: (folderId: string, destinationId: string | null) => e.folderOperations.move(folderId, destinationId),
      editingId: null,
      openMenuId: null,
      noteMoveDestinations: [],
      resourceMoveDestinations: [],
      createFolderInZone: () => undefined,
      canMoveNoteInto: (pageId: string, destinationId: string | null) => e.pageOperations.canMove(pageId, destinationId),
      canMoveFolderInto: (folderId: string, destinationId: string | null) =>
        rules.allowFolderMoves && e.folderOperations.canMove(folderId, destinationId),
    },
    { get: (target, key) => (key in target ? (target as Record<PropertyKey, unknown>)[key] : vi.fn()) }
  ) as unknown as SidebarRowActions;
}

/** Press on `title`'s row, then move to `y` (x inside the sidebar). */
function dragOver(title: string, y: number, x = 60) {
  press(rowFor(title), 40, rowFor(title).getBoundingClientRect().top + 14);
  move(x, y);
}

describe('FolderTree drop target: folder rows', () => {
  beforeEach(() => {
    env = setupDropTree();
    renderTree(env, { rowActions: dropActions(env) });
  });

  it('top edge → an insertion line before the folder, with no row highlight', () => {
    dragOver('Gamma', 102); // Alpha: 100–128, ratio ≈ 0.07
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('100px');
  });

  it('central region → the whole folder row is highlighted as the destination, with no line', () => {
    dragOver('Gamma', 114);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    expect(only()!.style.top).toBe('100px');
    expect(only()!.style.height).toBe('28px');
    expect(only()!.style.width).toBe(`${ROW_RECT.width}px`);
  });

  it('an EXPANDED folder has no "after" on its header: its after position is the end of its whole subtree', () => {
    dragOver('Gamma', 126); // the bottom edge of Alpha's header
    expect(only()).toBeNull();

    move(60, 182); // the bottom edge of the last row of Alpha's subtree (Child, 156–184)
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('184px');
  });

  it('an empty folder is a destination too', () => {
    dragOver('Gamma', 198); // Beta: 184–212, centre
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    expect(only()!.style.top).toBe('184px');
  });

  it('the first and last rows of the root list get edge positions', () => {
    dragOver('Beta', 102);
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert'); // before Alpha, the first
    move(60, 238); // Gamma: 212–240, bottom edge — but Gamma is the last row and not the dragged one
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('240px');
  });

  it('a position beside the dragged row itself is a no-op, so nothing is shown', () => {
    dragOver('Gamma', 210); // bottom edge of Beta, directly above Gamma
    expect(only()).toBeNull();
    move(60, 214); // top edge of Gamma itself
    expect(only()).toBeNull();
  });

  it('never targets the dragged row itself', () => {
    dragOver('Beta', 198);
    expect(only()).toBeNull();
  });
});

describe('FolderTree drop target: note rows', () => {
  beforeEach(() => {
    env = setupDropTree();
    renderTree(env, { rowActions: dropActions(env) });
  });

  it('a note\'s middle is never a folder destination; against another note it is an insertion position', () => {
    cleanup();
    env = setup([makeFolder('a', `${ROOT}/Alpha`, null)], [
      makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a'),
      makePage('n2', `${ROOT}/Alpha/Note Two.md`, 'a'),
    ]);
    renderTree(env, { rowActions: dropActions(env) });
    // Alpha 100, Note One 128, Note Two 156.
    dragOver('Note One', 170); // the middle of Note Two (156–184)
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('184px');
    move(60, 160); // its upper half: directly beside Note One itself, so the item would not move
    expect(only()).toBeNull();
  });

  it('a folder can be placed beside a note: notes and folders share one sibling sequence', () => {
    // Alpha's children are one sequence by name: Child (128), Note One (156).
    dragOver('Gamma', 170); // Note One (156–184), the middle → after it
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('184px');
    move(60, 158); // its top edge → before it
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('156px');
  });

  it('a note is a drag source: over a folder it can go inside, and the folder it already lives in is not offered', () => {
    dragOver('Note One', 198); // into Beta
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');

    move(60, 114); // the middle of its own parent, Alpha: a no-op, so not a destination…
    expect(only()).toBeNull(); // …and the positions beside Alpha are in the root list, which a note can't join
  });
});

describe('FolderTree drop target: invalid folder destinations', () => {
  beforeEach(() => {
    env = setupDropTree();
    renderTree(env, { rowActions: dropActions(env) });
  });

  it('a folder over itself shows nothing', () => {
    dragOver('Alpha', 114);
    expect(only()).toBeNull();
  });

  it('a folder over its own descendants shows nothing: not inside, and no position within them either', () => {
    dragOver('Alpha', 170); // Child, centre
    expect(only()).toBeNull();
    move(60, 140); // Note One, inside Alpha
    expect(only()).toBeNull();
  });

  it('a nested folder can be positioned next to its parent (moving out to the root) but not dropped "into" it', () => {
    dragOver('Child', 114); // Alpha, centre — Child already lives there: not a destination, and Alpha's header has no "after"
    expect(only()).toBeNull();
    move(60, 102); // before Alpha: a position at the root
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
  });

  it('asks the move rules instead of restating them: with no answer available a folder gets no destination', () => {
    cleanup();
    env = setupDropTree();
    renderTree(env); // no rowActions → no canMoveFolderInto
    dragOver('Gamma', 198);
    expect(only()).toBeNull();
  });
});

describe('FolderTree drop target: transitions and clearing', () => {
  beforeEach(() => {
    env = setupDropTree();
    renderTree(env, { rowActions: dropActions(env) });
  });

  it('crossing regions swaps the one indicator — never two, never stale', () => {
    dragOver('Gamma', 102);
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    move(60, 114);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    move(60, 126); // the bottom of an expanded folder's header: nothing
    expect(only()).toBeNull();
    move(60, 198); // a different row entirely
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    expect(only()!.style.top).toBe('184px');
  });

  it('leaving the rows (over the page, or past the last row) clears it, and coming back restores it', () => {
    dragOver('Gamma', 114);
    expect(only()).not.toBeNull();
    move(500, 114);
    expect(only()).toBeNull();
    move(60, 114);
    expect(only()).not.toBeNull();
    move(60, 400);
    expect(only()).toBeNull();
  });

  it.each([
    ['release', () => release(60, 114)],
    ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ['pointercancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
  ])('%s clears the indicator', (_name, end) => {
    dragOver('Gamma', 114);
    expect(only()).not.toBeNull();
    end();
    expect(feedback()).toHaveLength(0);
  });

  it('unmounting mid-drag removes the indicator', () => {
    cleanup();
    env = setupDropTree();
    const { unmount } = renderTree(env, { rowActions: dropActions(env) });
    dragOver('Gamma', 114);
    unmount();
    expect(feedback()).toHaveLength(0);
  });

  it('is not shown before the drag begins (a press under the threshold)', () => {
    press(rowFor('Gamma'), 40, 226);
    move(60, 227);
    expect(feedback()).toHaveLength(0);
  });

  it('the ghost is never mistaken for a row, and releasing on an insertion position moves, reorders and persists nothing', () => {
    dragOver('Gamma', 186); // Beta's top edge: an insertion position, not a destination
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(ghost()!.querySelector('[data-drag-id]')).toBeNull();
    release(60, 186);

    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.renameSpy).not.toHaveBeenCalled();
    expect(env.enqueueSpy).not.toHaveBeenCalled();
    expect(env.vault.getFolder('g')!.parentId).toBeNull();
    expect(env.vault.getPage('n1')!.path).toBe(`${ROOT}/Alpha/Note One.md`);
  });
});

describe('FolderTree drop target: capped lists and scope', () => {
  it('after the last visible row of a capped list is not offered — the real position is among hidden rows', () => {
    const folders = Array.from({ length: 12 }, (_, i) => makeFolder(`f${i}`, `${ROOT}/F${String(i).padStart(2, '0')}`, null));
    env = setup(folders);
    renderTree(env, { rowActions: dropActions(env) });

    // 10 rows are shown; F09 is the last visible. Drag F00 over it.
    dragOver('F00', ROW_RECT.top + 9 * 28 + 26); // F09's bottom edge
    expect(only()).toBeNull();

    move(60, ROW_RECT.top + 9 * 28 + 2); // its top edge is a precise position
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    move(60, ROW_RECT.top + 9 * 28 + 14); // and its middle is a destination
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it('without enableDrag, rows carry no drop markers and nothing is ever shown', () => {
    env = setupDropTree();
    renderTree(env, { rowActions: dropActions(env), enableDrag: false });
    expect(document.querySelector('[data-drag-id]')).toBeNull();
    press(rowFor('Gamma'));
    move(60, 114);
    expect(feedback()).toHaveLength(0);
  });
});

describe('FolderTree drop target: root-level restrictions', () => {
  // Rows from y=100: Alpha, Note One, Child, Beta, Gamma (root folders: Alpha, Beta, Gamma; Alpha expanded).
  beforeEach(() => {
    env = setupDropTree();
    renderTree(env, { rowActions: dropActions(env) });
  });

  it('a note over root-level folders never gets an insertion target — top, bottom or the expanded folder\'s tail', () => {
    press(rowFor('Note One'), 40, 142);
    for (const y of [102, 126, 186, 210, 214, 238]) {
      move(60, y); // edge bands of Alpha, Beta and Gamma
      expect(feedback().filter((f) => f.dataset.dropFeedback === 'insert')).toHaveLength(0);
    }
  });

  it('a note over a root folder\'s middle is still a valid folder destination (the one way to move it)', () => {
    press(rowFor('Note One'), 40, 142);
    move(60, 198); // Beta
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    move(60, 226); // Gamma
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it('a note that sits at the root cannot be placed among the root rows either', () => {
    cleanup();
    env = setup([makeFolder('b', `${ROOT}/Beta`, null), makeFolder('g', `${ROOT}/Gamma`, null)], [
      makePage('r1', `${ROOT}/Loose.md`, null),
    ]);
    renderTree(env, { rowActions: dropActions(env) });
    // Rows: Beta 100, Gamma 128, Loose 156.
    press(rowFor('Loose'), 40, 170);
    move(60, 130); // Gamma's top edge
    expect(only()).toBeNull();
    move(60, 102); // Beta's top edge
    expect(only()).toBeNull();
    move(60, 114); // Beta's middle → into Beta
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it('a folder over root-level folders gets before and after positions', () => {
    press(rowFor('Gamma'), 40, 226);
    move(60, 186); // Beta's top edge
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('184px');
    move(60, 102); // Alpha's top edge — first in the root list
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    move(60, 126); // Alpha's header bottom edge: expanded, so nothing
    expect(only()).toBeNull();
    move(60, 182); // the end of Alpha's subtree
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('184px');
  });

  it('a folder dragged out of a folder can be positioned at the root', () => {
    press(rowFor('Child'), 40, 170);
    move(60, 188); // Beta's top edge
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
  });

  it('a note can be reordered among its siblings inside its own parent folder', () => {
    cleanup();
    env = setup([makeFolder('a', `${ROOT}/Alpha`, null)], [
      makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a'),
      makePage('n2', `${ROOT}/Alpha/Note Two.md`, 'a'),
      makePage('n3', `${ROOT}/Alpha/Note Three.md`, 'a'),
    ]);
    renderTree(env, { rowActions: dropActions(env) });
    // Alpha 100, then its notes by name: Note One 128, Note Three 156, Note Two 184.
    press(rowFor('Note One'), 40, 142);
    move(60, 186); // Note Two's top edge: between Note Three and Note Two
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    expect(only()!.style.top).toBe('184px');
    move(60, 210); // Note Two's bottom edge: after the last note
    expect(only()).toHaveAttribute('data-drop-feedback', 'insert');
    move(60, 158); // directly beside itself (before Note Three) → no-op
    expect(only()).toBeNull();
  });

  it('a note can be moved into another valid folder', () => {
    press(rowFor('Note One'), 40, 142);
    move(60, 198);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    expect(only()!.style.top).toBe('184px');
  });

  it('an invalid target shows nothing at all — no highlight, no line', () => {
    press(rowFor('Alpha'), 40, 114);
    for (const y of [114, 140, 170]) {
      move(60, y); // itself, its note, its child folder
      expect(feedback()).toHaveLength(0);
    }
    move(500, 114);
    expect(feedback()).toHaveLength(0);
  });

});

// ---------------------------------------------------------------------------------------------------------
// Phase 3a: releasing on a folder destination runs the existing Move, for the target that was shown.
// ---------------------------------------------------------------------------------------------------------

/** Lets the (async) move that a release started finish. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('FolderTree drop: moving into a folder', () => {
  let pageMove: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    env = await setupDropTreeOnDisk();
    pageMove = vi.spyOn(env.pageOperations, 'move');
    renderTree(env, { rowActions: dropActions(env) });
  });

  it('a note dropped on a folder is moved there by PageOperations.move — once, keeping its id', async () => {
    press(rowFor('Note One'), 40, 142);
    move(60, 198); // Beta
    release(60, 198);
    await settle();

    expect(pageMove).toHaveBeenCalledExactlyOnceWith('n1', 'b');
    const moved = env.vault.getPage('n1')!;
    expect(moved.parentId).toBe('b');
    expect(moved.path).toBe(`${ROOT}/Beta/Note One.md`);
  });

  it('a folder dropped on a folder is moved there by FolderOperations.move, with its descendants and ids', async () => {
    press(rowFor('Alpha'), 40, 114);
    move(60, 198); // Beta
    release(60, 198);
    await settle();

    expect(env.moveSpy).toHaveBeenCalledExactlyOnceWith('a', 'b');
    expect(env.vault.getFolder('a')!.parentId).toBe('b');
    expect(env.vault.getFolder('a')!.path).toBe(`${ROOT}/Beta/Alpha`);
    expect(env.vault.getFolder('c')!.path).toBe(`${ROOT}/Beta/Alpha/Child`);
    expect(env.vault.getPage('n1')!.path).toBe(`${ROOT}/Beta/Alpha/Note One.md`);
  });

  it('the move is for the target that was SHOWN, not for wherever the pointer is when it is released', async () => {
    press(rowFor('Note One'), 40, 142);
    move(60, 198); // Beta is highlighted…
    release(60, 226); // …and the button comes up over Gamma
    await settle();

    expect(pageMove).toHaveBeenCalledExactlyOnceWith('n1', 'b');
  });

  it('the displayed highlight, the ghost and the dimming are gone straight after the release', async () => {
    const row = rowFor('Note One');
    press(row, 40, 142);
    move(60, 198);
    release(60, 198);

    expect(feedback()).toHaveLength(0);
    expect(ghost()).toBeNull();
    await settle();
    expect(document.querySelector('.entry--drag-source')).toBeNull();
  });

  it('re-checks the move rules at release: a destination no longer allowed is not moved to', async () => {
    press(rowFor('Gamma'), 40, 226);
    move(60, 198); // Beta highlighted
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');

    rules.allowFolderMoves = false;
    release(60, 198);
    await settle();

    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.vault.getFolder('g')!.parentId).toBeNull();
  });

  it('a move the operation rejects leaves everything where it was and the drag state clean', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    pageMove.mockRejectedValueOnce(new Error('Cannot move'));

    const row = rowFor('Note One');
    press(row, 40, 142);
    move(60, 198);
    release(60, 198);
    await settle();

    expect(warn).toHaveBeenCalled();
    expect(env.vault.getPage('n1')!.parentId).toBe('a');
    expect(feedback()).toHaveLength(0);
    expect(ghost()).toBeNull();
    expect(row).not.toHaveClass('entry--drag-source');
    expect(document.body.style.userSelect).toBe('');

    // And the next drag works.
    press(row, 40, 142);
    move(60, 198);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it('keeps an open note open: same id, same session, now in its new folder', async () => {
    await env.pageOperations.open('n1');
    expect(env.workspace.activePageId).toBe('n1');

    press(rowFor('Note One'), 40, 142);
    move(60, 198);
    release(60, 198);
    await settle();

    expect(env.workspace.activePageId).toBe('n1');
    expect(env.vault.getPage('n1')!.parentId).toBe('b');
  });

  it('keeps a note open when the folder containing it is moved', async () => {
    await env.pageOperations.open('n1');

    press(rowFor('Alpha'), 40, 114);
    move(60, 198);
    release(60, 198);
    await settle();

    expect(env.workspace.activePageId).toBe('n1');
    expect(env.vault.getPage('n1')!.path).toBe(`${ROOT}/Beta/Alpha/Note One.md`);
  });
});

describe('FolderTree drop: nothing else ever moves anything', () => {
  beforeEach(async () => {
    env = await setupDropTreeOnDisk();
    vi.spyOn(env.pageOperations, 'move');
    renderTree(env, { rowActions: dropActions(env) });
  });

  const nothingMoved = async () => {
    await settle();
    expect(env.pageOperations.move).not.toHaveBeenCalled();
    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.enqueueSpy).not.toHaveBeenCalled();
    expect(env.vault.getPage('n1')!.parentId).toBe('a');
    expect(env.vault.getFolder('g')!.parentId).toBeNull();
  };

  it('releasing with no target performs no operation', async () => {
    press(rowFor('Gamma'), 40, 226);
    move(500, 226);
    release(500, 226);
    await nothingMoved();
  });

  it('releasing on a destination that is not valid performs no operation', async () => {
    press(rowFor('Alpha'), 40, 114);
    move(60, 170); // its own child folder
    expect(feedback()).toHaveLength(0);
    release(60, 170);
    await nothingMoved();
  });

  it.each([
    ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ['pointercancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
  ])('%s after a destination was shown never moves anything, even if the button is released over it', async (_name, cancel) => {
    press(rowFor('Gamma'), 40, 226);
    move(60, 198);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    cancel();
    release(60, 198);
    await nothingMoved();
  });

  it('a plain click on a row moves nothing and still opens it', async () => {
    const { onFolderClick } = (() => {
      cleanup();
      return renderTree(env, { rowActions: dropActions(env) });
    })();
    const row = rowFor('Beta');
    press(row);
    release(40, 114);
    fireEvent.click(row);
    expect(onFolderClick).toHaveBeenCalledTimes(1);
    await nothingMoved();
  });

  it('is exclusive to the Notes tree: without enableDrag a release over a folder moves nothing', async () => {
    cleanup();
    renderTree(env, { rowActions: dropActions(env), enableDrag: false });
    press(rowFor('Gamma'), 40, 226);
    move(60, 198);
    release(60, 198);
    await nothingMoved();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Templates as a drop destination: the sidebar's Templates entry sits outside the tree (a reserved folder the
// tree never lists) and is marked `data-drop-folder-id`. It resolves to the same "into this folder" target a
// folder row does — same highlight, same Move — and is never part of a manual order.
// ---------------------------------------------------------------------------------------------------------

describe('FolderTree drop: the Templates entry is a destination', () => {
  // Stacked rows: Alpha 100, Note One 128, Child 156, Deep 184, Beta 212, Gamma 240, then the Templates entry at 268.
  const TEMPLATES_Y = 282;

  async function setupWithTemplates() {
    const e = setup(
      [
        makeFolder('a', `${ROOT}/Alpha`, null),
        makeFolder('c', `${ROOT}/Alpha/Child`, 'a'),
        makeFolder('b', `${ROOT}/Beta`, null),
        makeFolder('g', `${ROOT}/Gamma`, null),
        makeFolder('t', `${ROOT}/Templates`, null),
      ],
      [makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a'), makePage('n2', `${ROOT}/Alpha/Child/Deep.md`, 'c')]
    );
    for (const folder of e.vault.folders()) {
      await e.fileSystem.createDirectory(folder.path);
    }
    for (const id of ['n1', 'n2']) {
      const page = e.vault.getPage(id)!;
      e.fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
    }
    return e;
  }

  /** The sidebar's Templates entry, rendered after the tree like it is in the real sidebar. */
  function addTemplatesEntry() {
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.dataset.dropFolderId = 't';
    entry.dataset.dropZone = 'templates';
    document.body.appendChild(entry);
    return entry;
  }

  beforeEach(async () => {
    env = await setupWithTemplates();
    renderTree(env, { rowActions: dropActions(env) });
    addTemplatesEntry();
  });

  afterEach(() => {
    document.querySelectorAll('[data-drop-folder-id]').forEach((element) => element.remove());
  });

  it('hovering it with a note highlights the whole Templates entry — no insertion line', () => {
    press(rowFor('Note One'), 40, 142);
    move(60, TEMPLATES_Y);

    const indicator = only();
    expect(indicator).toHaveAttribute('data-drop-feedback', 'inside');
    expect(indicator!.style.top).toBe('268px');
  });

  it('dropping a note on it moves the note into Templates — same id — and it is then a template with the marker on disk', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    press(rowFor('Note One'), 40, 142);
    move(60, TEMPLATES_Y);
    release(60, TEMPLATES_Y);
    await settle();

    expect(pageMove).toHaveBeenCalledExactlyOnceWith('n1', 't');
    const moved = env.vault.getPage('n1')!;
    expect(moved.path).toBe(`${ROOT}/Templates/Note One.md`);
    expect(env.membershipSelector.isInTemplatesFolder(moved.parentId)).toBe(true);
    expect(await env.fileSystem.readFile(moved.path)).toContain('kind: template');
  });

  it('dropping a folder on it moves the folder and its whole subtree; every descendant note is a template, persisted at once', async () => {
    press(rowFor('Alpha'), 40, 114);
    move(60, TEMPLATES_Y);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    release(60, TEMPLATES_Y);
    await settle();

    expect(env.moveSpy).toHaveBeenCalledExactlyOnceWith('a', 't');
    expect(env.vault.getFolder('a')!.path).toBe(`${ROOT}/Templates/Alpha`);
    expect(env.vault.getFolder('c')!.path).toBe(`${ROOT}/Templates/Alpha/Child`);
    for (const id of ['n1', 'n2']) {
      const page = env.vault.getPage(id)!;
      expect(env.membershipSelector.isInTemplatesFolder(page.parentId), id).toBe(true);
      expect(await env.fileSystem.readFile(page.path), id).toContain('kind: template');
    }
  });

  it('releasing anywhere else, or cancelling with Escape, moves nothing', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    press(rowFor('Note One'), 40, 142);
    move(60, TEMPLATES_Y);
    move(60, 900); // away from every row and from Templates
    expect(only()).toBeNull();
    release(60, 900);
    await settle();

    press(rowFor('Note One'), 40, 142);
    move(60, TEMPLATES_Y);
    fireEvent.keyDown(document, { key: 'Escape' });
    release(60, TEMPLATES_Y);
    await settle();

    expect(pageMove).not.toHaveBeenCalled();
    expect(env.vault.getPage('n1')!.parentId).toBe('a');
  });

  it('a folder the move rules refuse gets no highlight and is not moved', async () => {
    rules.allowFolderMoves = false;
    press(rowFor('Gamma'), 40, 254);
    move(60, TEMPLATES_Y);
    expect(only()).toBeNull();
    release(60, TEMPLATES_Y);
    await settle();

    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.vault.getFolder('g')!.parentId).toBeNull();
  });

  it('ordinary drops are unchanged: a note dropped on Beta still moves into Beta', async () => {
    press(rowFor('Note One'), 40, 142);
    move(60, 226); // Beta
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    release(60, 226);
    await settle();

    expect(env.vault.getPage('n1')!.parentId).toBe('b');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Inbox takes notes only; Assets takes assets only. Eligibility is decided on hover (no highlight for an
// ineligible item) and again at the drop (a target is never trusted to have been valid).
// ---------------------------------------------------------------------------------------------------------

describe('FolderTree drop: the Inbox and Assets entries', () => {
  // Stacked rows: Alpha 100, Note One 128, pic 156, Beta 184, then the Inbox entry 212, the Assets entry 240 and
  // the Templates entry 268 (appended in that order).
  const INBOX_Y = 226;
  const ASSETS_Y = 254;
  const TEMPLATES_Y = 282;
  let onMoveResource: ReturnType<typeof vi.fn>;

  async function setupWithZones() {
    const e = setup(
      [
        makeFolder('a', `${ROOT}/Alpha`, null),
        makeFolder('b', `${ROOT}/Beta`, null),
        makeFolder('i', `${ROOT}/Inbox`, null),
        makeFolder('as', `${ROOT}/Assets`, null),
        makeFolder('t', `${ROOT}/Templates`, null),
      ],
      [makePage('n1', `${ROOT}/Alpha/Note One.md`, 'a')],
      [{ id: 'r1', kind: 'image', name: 'pic.png', path: `${ROOT}/Alpha/pic.png`, parentId: 'a' }]
    );
    for (const folder of e.vault.folders()) {
      await e.fileSystem.createDirectory(folder.path);
    }
    const page = e.vault.getPage('n1')!;
    e.fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
    return e;
  }

  const addEntry = (zone: string, folderId: string) => {
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.dataset.dropFolderId = folderId;
    entry.dataset.dropZone = zone;
    document.body.appendChild(entry);
  };

  const assetRow = () => rowFor('pic');

  beforeEach(async () => {
    env = await setupWithZones();
    onMoveResource = vi.fn();
    // Assigned onto the actions object itself (not wrapped) so it survives executeDrop's spread of them.
    const actions = dropActions(env) as unknown as Record<string, unknown>;
    actions.onMoveResource = onMoveResource;
    renderTree(env, { rowActions: actions as unknown as SidebarRowActions });
    addEntry('inbox', 'i');
    addEntry('assets', 'as');
    addEntry('templates', 't');
  });

  afterEach(() => {
    document.querySelectorAll('[data-drop-folder-id]').forEach((element) => element.remove());
  });

  it('a note over Inbox highlights it; released there it is moved into Inbox by PageOperations.move, keeping its id', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    press(rowFor('Note One'), 40, 142);
    move(60, INBOX_Y);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    expect(only()!.style.top).toBe('212px');
    release(60, INBOX_Y);
    await settle();

    expect(pageMove).toHaveBeenCalledExactlyOnceWith('n1', 'i');
    expect(env.vault.getPage('n1')!.path).toBe(`${ROOT}/Inbox/Note One.md`);
    expect(onMoveResource).not.toHaveBeenCalled();
  });

  it('a folder over Inbox gets no highlight, and released there nothing moves', async () => {
    press(rowFor('Alpha'), 40, 114);
    move(60, INBOX_Y);
    expect(only()).toBeNull();
    release(60, INBOX_Y);
    await settle();

    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(env.vault.getFolder('a')!.path).toBe(`${ROOT}/Alpha`);
  });

  it('an asset over Assets highlights it; released there it is moved by the existing asset move, once', async () => {
    press(assetRow(), 40, 170);
    move(60, ASSETS_Y);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    expect(only()!.style.top).toBe('240px');
    release(60, ASSETS_Y);
    await settle();

    expect(onMoveResource).toHaveBeenCalledExactlyOnceWith('r1', 'as');
  });

  it('a note or a folder over Assets gets no highlight, and released there nothing moves', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    press(rowFor('Note One'), 40, 142);
    move(60, ASSETS_Y);
    expect(only()).toBeNull();
    release(60, ASSETS_Y);
    await settle();

    press(rowFor('Alpha'), 40, 114);
    move(60, ASSETS_Y);
    expect(only()).toBeNull();
    release(60, ASSETS_Y);
    await settle();

    expect(pageMove).not.toHaveBeenCalled();
    expect(env.moveSpy).not.toHaveBeenCalled();
    expect(onMoveResource).not.toHaveBeenCalled();
    expect(env.vault.getPage('n1')!.parentId).toBe('a');
  });

  it('an asset goes nowhere else: no highlight over Inbox, Templates or a folder row, and nothing moves', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    press(assetRow(), 40, 170);
    for (const y of [INBOX_Y, TEMPLATES_Y, 114 /* Alpha's middle */, 102 /* Alpha's top edge */]) {
      move(60, y);
      expect(only(), `y=${y}`).toBeNull();
    }
    release(60, TEMPLATES_Y);
    await settle();

    expect(onMoveResource).not.toHaveBeenCalled();
    expect(pageMove).not.toHaveBeenCalled();
    expect(env.moveSpy).not.toHaveBeenCalled();
  });

  it('a note over Templates still highlights and moves there; Templates is unaffected by the new destinations', async () => {
    press(rowFor('Note One'), 40, 142);
    move(60, TEMPLATES_Y);
    expect(only()).toHaveAttribute('data-drop-feedback', 'inside');
    release(60, TEMPLATES_Y);
    await settle();

    expect(env.vault.getPage('n1')!.path).toBe(`${ROOT}/Templates/Note One.md`);
  });

  it('eligibility is checked again at the drop: an ineligible target is rejected even if one were shown', async () => {
    const { executeDrop } = await import('./executeDrop');
    const actions = { onMoveNote: vi.fn(), onMoveFolder: vi.fn(), onMoveResource: vi.fn(), canMoveFolderInto: () => true };
    const inside = (zone: 'inbox' | 'assets' | 'templates', folderId: string) =>
      ({ kind: 'inside', folderId, zone, rect: { top: 0, left: 0, width: 1, height: 1 } }) as const;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await executeDrop({ kind: 'folder', id: 'a', parentId: null }, inside('inbox', 'i'), actions)).toBe('rejected');
    expect(await executeDrop({ kind: 'note', id: 'n1', parentId: 'a' }, inside('assets', 'as'), actions)).toBe('rejected');
    expect(await executeDrop({ kind: 'asset', id: 'r1', parentId: 'a' }, inside('inbox', 'i'), actions)).toBe('rejected');
    expect(await executeDrop({ kind: 'asset', id: 'r1', parentId: 'a' }, { kind: 'inside', folderId: 'b', rect: { top: 0, left: 0, width: 1, height: 1 } }, actions)).toBe('rejected');
    expect(actions.onMoveNote).not.toHaveBeenCalled();
    expect(actions.onMoveFolder).not.toHaveBeenCalled();
    expect(actions.onMoveResource).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    expect(await executeDrop({ kind: 'asset', id: 'r1', parentId: 'a' }, inside('assets', 'as'), actions)).toBe('moved');
    expect(actions.onMoveResource).toHaveBeenCalledExactlyOnceWith('r1', 'as');
  });
});
