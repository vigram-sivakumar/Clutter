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

function setup(folders: Folder[], pages: Page[] = []) {
  const vault = new Vault(ROOT, pages, folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
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
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return (this.classList.contains('entry')
      ? { ...ROW_RECT, right: ROW_RECT.left + ROW_RECT.width, bottom: ROW_RECT.top + ROW_RECT.height, x: ROW_RECT.left, y: ROW_RECT.top }
      : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 }) as DOMRect;
  });
});

afterEach(async () => {
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

  it('does not start from the caret', () => {
    const { container } = renderTree(env);
    press(container.querySelector('.folder__caret .caret-slot')!);
    move(40, 160);
    expect(ghost()).toBeNull();
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
  it("matches the row's width, height and left edge, and leaves the original row in place", () => {
    renderTree(env);
    const rowsBefore = document.querySelectorAll('.entry').length;
    const row = rowFor('Alpha');
    press(row, 40, 114);
    move(40, 140);

    const g = ghost()!;
    expect(g.style.width).toBe(`${ROW_RECT.width}px`);
    expect(g.style.height).toBe(`${ROW_RECT.height}px`);
    expect(g.style.left).toBe(`${ROW_RECT.left}px`);
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
    expect(g.parentElement).toBe(document.body);
  });

  it('keeps its grip on the row and follows the pointer vertically', () => {
    renderTree(env);
    // Pressed 14px below the row's top (114 - 100).
    press(rowFor('Alpha'), 40, 114);
    move(40, 140);
    expect(ghost()!.style.transform).toBe('translate3d(0, 126px, 0)');

    move(90, 200);
    expect(ghost()!.style.transform).toBe('translate3d(0, 186px, 0)');
    // Horizontal pointer movement never shifts it off the sidebar's content area.
    expect(ghost()!.style.left).toBe(`${ROW_RECT.left}px`);
  });

  it('re-measures the row, so it tracks a resized sidebar', () => {
    renderTree(env);
    press(rowFor('Alpha'));
    move(40, 140);
    expect(ghost()!.style.width).toBe('236px');

    ROW_RECT.width = 300;
    try {
      move(40, 150);
      expect(ghost()!.style.width).toBe('300px');
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
