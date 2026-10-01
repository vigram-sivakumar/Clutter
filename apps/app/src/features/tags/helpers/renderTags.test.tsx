// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderTags, type TagRowActions } from './renderTags';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import type { NoteRowActions } from '@features/notes/sidebar/FolderTree';
import type { EffectivePage } from '@core/application/page/EffectivePageState';

const noop = () => {};

// Minimal fakes — only the members renderTags actually calls. Every
// fixture below uses usageCount: 0 (or doesn't interact with
// expand/collapse), so isExpanded/toggleExpanded/activePageId and
// getPagesByTag are never exercised by these tests; they exist only to
// satisfy renderTags' required props.
const fakeWorkspace = {
  activePageId: null,
} as unknown as Workspace;

const fakeTagExpansionStore = {
  isExpanded: () => false,
  toggleExpanded: noop,
} as unknown as TagExpansionStore;

const fakeEffectivePageState = {
  getPagesByTag: () => [],
} as unknown as EffectivePageState;

const renderOptions = {
  onOpenTag: noop,
  onOpenNote: noop,
  tagExpansionStore: fakeTagExpansionStore,
  workspace: fakeWorkspace,
  effectivePageState: fakeEffectivePageState,
};

function fakeNote(overrides: Partial<EffectivePage> = {}): EffectivePage {
  return {
    id: 'p1',
    type: 'note',
    folderId: null,
    isDraft: false,
    name: 'My Note',
    description: null,
    markdown: '',
    icon: null,
    favorite: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function fakeNoteRowActions(overrides: Partial<NoteRowActions> = {}): NoteRowActions {
  return {
    openMenuId: null,
    onOpenMenu: noop,
    onCloseMenu: noop,
    editingId: null,
    onStartRename: noop,
    onRenameEnd: noop,
    onNoteTitleEdit: noop,
    onNoteTitleFlush: noop,
    onNoteTitleCancel: noop,
    onNoteTitleCommit: noop,
    onDraftTitleCommit: noop,
    onArchiveNote: noop,
    onDuplicateNote: noop,
    onToggleFavoriteNote: noop,
    onChangeNoteIcon: noop,
    noteMoveDestinations: [],
    onMoveNote: noop,
    onCreateFolder: () => Promise.resolve('new-folder-id'),
    onRevealPageInFinder: noop,
    onCopyPagePath: noop,
    ...overrides,
  };
}

function fakeRowActions(overrides: Partial<TagRowActions> = {}): TagRowActions {
  return {
    openMenuId: null,
    onOpenMenu: noop,
    onCloseMenu: noop,
    onChangeTagIcon: noop,
    editingId: null,
    onStartRename: noop,
    onRenameEnd: noop,
    onCommitRename: noop,
    ...overrides,
  };
}

// Only needed once a test renders a row with its overflow menu already
// open (Overlay's positioning effect) — same stub Tag.test.tsx uses.
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

afterEach(() => {
  cleanup();
});

describe('renderTags', () => {
  it('renders the assigned icon for a tag that has one', () => {
    const { container } = render(
      <>{renderTags([{ name: 'project', icon: '📦', favorite: false, usageCount: 0 }], renderOptions)}</>
    );

    expect(screen.getAllByText('📦').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.emoji-icon').length).toBeGreaterThan(0);
  });

  it('falls back to the default tag icon when icon is absent', () => {
    const { container } = render(
      <>{renderTags([{ name: 'design', favorite: false, usageCount: 0 }], renderOptions)}</>
    );

    // No emoji span rendered anywhere for this tag — AppIcon falls back to
    // the default "tag" system icon, unchanged from today's behavior.
    expect(container.querySelectorAll('.emoji-icon').length).toBe(0);
    expect(screen.getAllByText('design').length).toBeGreaterThan(0);
  });

  it('displays usageCount as the trailing value', () => {
    render(
      <>{renderTags([{ name: 'project', favorite: false, usageCount: 3 }], renderOptions)}</>
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('a tag with favorite: false renders only in the remaining section, never in Favorites', () => {
    render(<>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], renderOptions)}</>);

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('a tag with favorite: true renders only in Favorites, never in the remaining section', () => {
    render(<>{renderTags([{ name: 'project', favorite: true, usageCount: 0 }], renderOptions)}</>);

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('omits the Favorites section entirely when no tag is favorited', () => {
    render(
      <>
        {renderTags([
          { name: 'project', favorite: false, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], renderOptions)}
      </>
    );

    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('renders the remaining section without a header when it is the only visible section', () => {
    const { container } = render(
      <>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], renderOptions)}</>
    );

    expect(container.querySelectorAll('.section-header')).toHaveLength(0);
  });

  it('renders a header for the remaining section once Favorites is also visible', () => {
    const { container } = render(
      <>
        {renderTags([
          { name: 'project', favorite: true, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], renderOptions)}
      </>
    );

    // One header for Favorites, one for the remaining section.
    expect(container.querySelectorAll('.section-header')).toHaveLength(2);
  });

  it('never renders the same tag in both groups', () => {
    render(
      <>
        {renderTags([
          { name: 'project', favorite: true, usageCount: 0 },
          { name: 'design', favorite: false, usageCount: 0 },
        ], renderOptions)}
      </>
    );

    expect(screen.getAllByText('project')).toHaveLength(1);
    expect(screen.getAllByText('design')).toHaveLength(1);
  });

  it('invokes onOpenTag with the tag name when a row is clicked', () => {
    const onOpenTag = vi.fn();
    render(<>{renderTags([{ name: 'Project', favorite: false, usageCount: 0 }], { ...renderOptions, onOpenTag })}</>);

    fireEvent.click(screen.getByText('Project'));

    expect(onOpenTag).toHaveBeenCalledWith('Project');
  });

  describe('display formatting (formatTagDisplayLabel) vs. raw identity', () => {
    it('a hyphen-separated tag name displays with the separator rendered as a space', () => {
      render(
        <>{renderTags([{ name: 'Product-design', favorite: false, usageCount: 0 }], renderOptions)}</>
      );

      expect(screen.getByText('Product design')).toBeInTheDocument();
      expect(screen.queryByText('Product-design')).toBeNull();
    });

    it('an underscore-separated tag name displays with the separator rendered as a space', () => {
      render(
        <>{renderTags([{ name: 'Product_design', favorite: false, usageCount: 0 }], renderOptions)}</>
      );

      expect(screen.getByText('Product design')).toBeInTheDocument();
      expect(screen.queryByText('Product_design')).toBeNull();
    });

    it('clicking a hyphen-separated tag\'s row still calls onOpenTag with the raw stored name, not the display label', () => {
      const onOpenTag = vi.fn();
      render(
        <>{renderTags([{ name: 'Product-design', favorite: false, usageCount: 0 }], { ...renderOptions, onOpenTag })}</>
      );

      fireEvent.click(screen.getByText('Product design'));

      expect(onOpenTag).toHaveBeenCalledWith('Product-design');
    });

    it('clicking an underscore-separated tag\'s row still calls onOpenTag with the raw stored name, not the display label', () => {
      const onOpenTag = vi.fn();
      render(
        <>{renderTags([{ name: 'Product_design', favorite: false, usageCount: 0 }], { ...renderOptions, onOpenTag })}</>
      );

      fireEvent.click(screen.getByText('Product design'));

      expect(onOpenTag).toHaveBeenCalledWith('Product_design');
    });

    it('a tag name with no separator displays unchanged, exactly as before', () => {
      render(
        <>{renderTags([{ name: 'project', favorite: false, usageCount: 0 }], renderOptions)}</>
      );

      expect(screen.getByText('project')).toBeInTheDocument();
    });
  });

  describe('Rename', () => {
    it("selecting 'Rename' from the overflow menu calls onStartRename with the raw tag name", () => {
      const onStartRename = vi.fn();
      // openMenuId set directly, rather than simulating the click-to-open
      // interaction: rowActions is a static fixture here, not React
      // state, so a click handled by a no-op onOpenMenu stub would never
      // actually re-render the menu open — that "click opens the menu"
      // behavior is already covered generically (Tag.test.tsx), this
      // test is only about what selecting the item does.
      const rowActions = fakeRowActions({ openMenuId: 'Product-design', onStartRename });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { ...renderOptions, rowActions }
          )}
        </>
      );

      fireEvent.click(screen.getByText('Rename'));

      expect(onStartRename).toHaveBeenCalledWith('Product-design');
    });

    it('the row whose raw name matches editingId enters inline edit mode, pre-filled with the display value', () => {
      const rowActions = fakeRowActions({ editingId: 'Product-design' });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { ...renderOptions, rowActions }
          )}
        </>
      );

      const field = screen.getByRole('textbox');
      expect(field.textContent).toBe('Product design');
    });

    it('a row NOT matching editingId is unaffected, still a static, clickable row', () => {
      const onOpenTag = vi.fn();
      const rowActions = fakeRowActions({ editingId: 'design' });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { ...renderOptions, onOpenTag, rowActions }
          )}
        </>
      );

      expect(screen.queryByRole('textbox')).toBeNull();
      fireEvent.click(screen.getByText('Product design'));
      expect(onOpenTag).toHaveBeenCalledWith('Product-design');
    });

    it('committing the edit calls onCommitRename with the raw old name and the typed value', () => {
      const onCommitRename = vi.fn();
      const rowActions = fakeRowActions({ editingId: 'Product-design', onCommitRename });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { ...renderOptions, rowActions }
          )}
        </>
      );

      const field = screen.getByRole('textbox');
      field.textContent = 'UX design';
      fireEvent.input(field);
      fireEvent.keyDown(field, { key: 'Enter' });

      expect(onCommitRename).toHaveBeenCalledWith('Product-design', 'UX design');
    });

    it('Escape ends the rename session without committing — onRenameEnd fires, onCommitRename does not', () => {
      const onCommitRename = vi.fn();
      const onRenameEnd = vi.fn();
      const rowActions = fakeRowActions({
        editingId: 'Product-design',
        onCommitRename,
        onRenameEnd,
      });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { ...renderOptions, rowActions }
          )}
        </>
      );

      const field = screen.getByRole('textbox');
      field.textContent = 'UX design';
      fireEvent.input(field);
      fireEvent.keyDown(field, { key: 'Escape' });

      expect(onCommitRename).not.toHaveBeenCalled();
      expect(onRenameEnd).toHaveBeenCalledTimes(1);
    });

    it('clicking a row mid-rename does not also navigate (edit mode suppresses the click-to-open handler)', () => {
      const onOpenTag = vi.fn();
      const rowActions = fakeRowActions({ editingId: 'Product-design' });
      render(
        <>
          {renderTags(
            [{ name: 'Product-design', favorite: false, usageCount: 0 }],
            { ...renderOptions, onOpenTag, rowActions }
          )}
        </>
      );

      fireEvent.click(screen.getByRole('textbox'));

      expect(onOpenTag).not.toHaveBeenCalled();
    });
  });

  describe('expanded tag note list — full note-row parity', () => {
    it('a collapsed tag renders no note rows even when it has notes', () => {
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, effectivePageState }
          )}
        </>
      );

      expect(screen.queryByText('My Note')).toBeNull();
    });

    it('an expanded tag renders a note row for every note the tag->notes index returns', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote({ id: 'p1', name: 'First' }), fakeNote({ id: 'p2', name: 'Second' })],
      } as unknown as EffectivePageState;
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 2 }],
            { ...renderOptions, tagExpansionStore, effectivePageState }
          )}
        </>
      );

      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });

    it('clicking an expanded note row calls onOpenNote with the note id and the tag name', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const onOpenNote = vi.fn();
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, onOpenNote }
          )}
        </>
      );

      fireEvent.click(screen.getByText('My Note'));

      expect(onOpenNote).toHaveBeenCalledWith('p1', 'design');
    });

    it('an expanded note row offers the full note overflow menu (Rename, Archive) — not a reduced action set', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      // openMenuId set directly, rather than simulating the click-to-open
      // interaction: rowActions is a static fixture here, not React
      // state, so a click handled by a no-op onOpenMenu stub would never
      // actually re-render the menu open — same reasoning as this file's
      // own tag-row Rename tests above.
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, noteRowActions }
          )}
        </>
      );

      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    it("selecting Archive from an expanded note row's menu calls the same onArchiveNote PageOperations-backed handler the Notes sidebar uses", () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const onArchiveNote = vi.fn();
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1', onArchiveNote });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, noteRowActions }
          )}
        </>
      );

      fireEvent.click(screen.getByText('Archive'));

      expect(onArchiveNote).toHaveBeenCalledWith('p1');
    });

    it('a note row mid-rename does not also navigate (same edit-mode suppression as the Notes sidebar)', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const onOpenNote = vi.fn();
      const noteRowActions = fakeNoteRowActions({ editingId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, noteRowActions, onOpenNote }
          )}
        </>
      );

      fireEvent.click(screen.getByRole('textbox'));

      expect(onOpenNote).not.toHaveBeenCalled();
    });

    it('a tag with zero occurrences renders its caret disabled — same as an empty folder — since there is nothing to expand', () => {
      const toggleExpanded = vi.fn();
      const tagExpansionStore = { isExpanded: () => false, toggleExpanded } as unknown as TagExpansionStore;
      render(
        <>{renderTags([{ name: 'empty-tag', favorite: false, usageCount: 0 }], { ...renderOptions, tagExpansionStore })}</>
      );

      // Two elements match role "button" here — the row's own
      // Entry (a clickable div, role="button" for keyboard activation)
      // and the caret itself; only the caret is expected to be disabled.
      const caret = screen.getAllByRole('button').find((el) => el.classList.contains('caret-slot'));
      expect(caret).toBeDisabled();
    });
  });

  describe('expanded tag note list — "Reveal in Clutter"', () => {
    it('appends exactly one extra menu item, "Reveal in Clutter," when onRevealInNotesSidebar is provided', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            {
              ...renderOptions,
              tagExpansionStore,
              effectivePageState,
              noteRowActions,
              onRevealInNotesSidebar: noop,
            }
          )}
        </>
      );

      expect(screen.getAllByText('Reveal in Clutter')).toHaveLength(1);
    });

    it('selecting it calls onRevealInNotesSidebar with the note id, and nothing else in the standard menu', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      const onRevealInNotesSidebar = vi.fn();
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            {
              ...renderOptions,
              tagExpansionStore,
              effectivePageState,
              noteRowActions,
              onRevealInNotesSidebar,
            }
          )}
        </>
      );

      fireEvent.click(screen.getByText('Reveal in Clutter'));

      expect(onRevealInNotesSidebar).toHaveBeenCalledWith('p1');
    });

    it('is absent when onRevealInNotesSidebar is not provided — the Notes sidebar\'s own menu is unaffected', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, noteRowActions }
          )}
        </>
      );

      expect(screen.queryByText('Reveal in Clutter')).toBeNull();
    });
  });
});
