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
import type { Vault } from '@core/vault/models';
import type { Page } from '@core/vault/models/Page';

const noop = () => {};

// Minimal fakes — only the members renderTags actually calls. Every
// fixture below uses usageCount: 0 (or doesn't interact with
// expand/collapse), so isExpanded/toggleExpanded/activePageId and
// getPagesByTag/getPagesByFrontmatterTag are never exercised by these
// tests; they exist only to satisfy renderTags' required props.
const fakeWorkspace = {
  activePageId: null,
} as unknown as Workspace;

const fakeTagExpansionStore = {
  isExpanded: () => false,
  toggleExpanded: noop,
} as unknown as TagExpansionStore;

const fakeEffectivePageState = {
  getPagesByTag: () => [],
  getPagesByFrontmatterTag: () => [],
} as unknown as EffectivePageState;

const fakeVault = {
  getPage: () => undefined,
} as unknown as Vault;

const renderOptions = {
  onOpenTag: noop,
  onOpenNoteEntry: noop,
  onOpenContextEntry: noop,
  vault: fakeVault,
  tagExpansionStore: fakeTagExpansionStore,
  workspace: fakeWorkspace,
  effectivePageState: fakeEffectivePageState,
};

/** A minimal raw Page — only the fields getTagLineContexts actually reads (source.markdown, analysis.tags). */
function fakePage(overrides: {
  id?: string;
  markdown: string;
  tagOccurrences: readonly { name: string; startOffset: number; endOffset: number }[];
}): Page {
  return {
    id: overrides.id ?? 'p1',
    type: 'note',
    name: 'My Note',
    path: '/vault/My Note.md',
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: null,
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: overrides.markdown },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: overrides.tagOccurrences.map((occ) => ({ ...occ, sourcePageId: overrides.id ?? 'p1' })),
      links: [],
      embeds: [],
    },
  };
}

/**
 * A context entry's line renders through renderCompactMarkdown, which
 * splits special syntax (e.g. the tag itself) into nested spans — so the
 * full line text is never one single text node once it contains a
 * `#tag`, and `screen.getByText(fullLine)` can't match it. These query
 * by the wrapping `.tag-context-entry__text` span's own textContent
 * instead, which concatenates all of its descendants' text regardless
 * of how renderCompactMarkdown split them.
 */
function getContextEntryTexts(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.tag-context-entry__text')];
}

function getContextEntryByLine(container: HTMLElement, line: string): HTMLElement {
  const match = getContextEntryTexts(container).find((el) => el.textContent === line);
  if (!match) {
    throw new Error(`No context entry found for line: ${line}`);
  }
  return match;
}

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

  describe('expanded tag children — frontmatter note entry', () => {
    it('a collapsed tag renders no children even when it has notes', () => {
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
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

    it.each([
      ['directly opened', 'n1', true],
      ['opened via a context entry', null, false],
    ])('note entry highlight when %s', (_label, directlyOpenedNoteId, expected) => {
      const note = fakeNote();
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [note],
      } as unknown as EffectivePageState;
      const workspace = { activePageId: note.id } as unknown as Workspace;
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            {
              ...renderOptions,
              workspace,
              tagExpansionStore,
              effectivePageState,
              directlyOpenedNoteId: directlyOpenedNoteId === null ? null : note.id,
            }
          )}
        </>
      );

      expect(
        screen.getByTestId(`sidebar.noteItem.${note.id}`).classList.contains('entry-selected')
      ).toBe(expected);
    });

    it('a note whose only membership is frontmatter renders as a full note row, not a context entry', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState }
          )}
        </>
      );

      expect(screen.getByText('My Note')).toBeInTheDocument();
    });

    it('clicking it calls onOpenNoteEntry with the note id — no editor reveal, there is no body occurrence', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const onOpenNoteEntry = vi.fn();
      const onOpenContextEntry = vi.fn();
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, onOpenNoteEntry, onOpenContextEntry }
          )}
        </>
      );

      fireEvent.click(screen.getByText('My Note'));

      expect(onOpenNoteEntry).toHaveBeenCalledWith('p1');
      expect(onOpenContextEntry).not.toHaveBeenCalled();
    });

    it('offers the full note overflow menu (Rename, Archive) — the existing note-row behavior is preserved', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
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

    it("selecting Archive calls the same onArchiveNote PageOperations-backed handler the Notes sidebar uses", () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
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

    it('mid-rename does not also navigate (same edit-mode suppression as the Notes sidebar)', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const onOpenNoteEntry = vi.fn();
      const noteRowActions = fakeNoteRowActions({ editingId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, noteRowActions, onOpenNoteEntry }
          )}
        </>
      );

      fireEvent.click(screen.getByRole('textbox'));

      expect(onOpenNoteEntry).not.toHaveBeenCalled();
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

  describe('expanded tag children — "Reveal in Clutter" (frontmatter note entry only)', () => {
    function withFrontmatterNote() {
      return {
        tagExpansionStore: { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore,
        effectivePageState: {
          getPagesByTag: () => [],
          getPagesByFrontmatterTag: () => [fakeNote()],
        } as unknown as EffectivePageState,
      };
    }

    it('adds exactly one extra menu item, "Reveal in Clutter," when onRevealInNotesSidebar is provided', () => {
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, ...withFrontmatterNote(), noteRowActions, onRevealInNotesSidebar: noop }
          )}
        </>
      );

      expect(screen.getAllByText('Reveal in Clutter')).toHaveLength(1);
    });

    it('selecting it calls onRevealInNotesSidebar with the note id, and nothing else in the standard menu', () => {
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      const onRevealInNotesSidebar = vi.fn();
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, ...withFrontmatterNote(), noteRowActions, onRevealInNotesSidebar }
          )}
        </>
      );

      fireEvent.click(screen.getByText('Reveal in Clutter'));

      expect(onRevealInNotesSidebar).toHaveBeenCalledWith('p1');
    });

    it('is absent when onRevealInNotesSidebar is not provided — the Notes sidebar\'s own menu is unaffected', () => {
      const noteRowActions = fakeNoteRowActions({ openMenuId: 'p1' });
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, ...withFrontmatterNote(), noteRowActions }
          )}
        </>
      );

      expect(screen.queryByText('Reveal in Clutter')).toBeNull();
    });
  });

  describe('expanded tag children — inline tag-context entries', () => {
    it('one inline occurrence renders as a single context entry showing the containing line', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = 'We need to improve the #design system before release.';
      const page = fakePage({
        markdown,
        tagOccurrences: [{ name: 'design', startOffset: 24, endOffset: 31 }],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      expect(getContextEntryByLine(container, markdown)).toBeInTheDocument();
      // No note row — this note has no frontmatter membership.
      expect(screen.queryByText('My Note')).toBeNull();
    });

    it('two occurrences on two different lines render as two separate context entries', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const line1 = 'First discussion about #design.';
      const line2 = 'Later we revisited the #design direction.';
      const markdown = `${line1}\n${line2}`;
      const page = fakePage({
        markdown,
        tagOccurrences: [
          { name: 'design', startOffset: line1.indexOf('#design'), endOffset: line1.indexOf('#design') + 7 },
          {
            name: 'design',
            startOffset: markdown.indexOf(line2) + line2.indexOf('#design'),
            endOffset: markdown.indexOf(line2) + line2.indexOf('#design') + 7,
          },
        ],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      expect(getContextEntryByLine(container, line1)).toBeInTheDocument();
      expect(getContextEntryByLine(container, line2)).toBeInTheDocument();
    });

    it('two occurrences of the same tag on the same line collapse into one context entry, not two', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = '#design discussions reference #design again.';
      const firstHash = markdown.indexOf('#design');
      const secondHash = markdown.indexOf('#design', firstHash + 1);
      const page = fakePage({
        markdown,
        tagOccurrences: [
          { name: 'design', startOffset: firstHash, endOffset: firstHash + 7 },
          { name: 'design', startOffset: secondHash, endOffset: secondHash + 7 },
        ],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      expect(getContextEntryTexts(container).filter((el) => el.textContent === markdown)).toHaveLength(1);
    });

    it('clicking a context entry calls onOpenContextEntry with the note id and that line\'s exact ranges', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = 'We need to improve the #design system before release.';
      const page = fakePage({
        markdown,
        tagOccurrences: [{ name: 'design', startOffset: 24, endOffset: 31 }],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const onOpenContextEntry = vi.fn();
      const onOpenNoteEntry = vi.fn();
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault, onOpenContextEntry, onOpenNoteEntry }
          )}
        </>
      );

      fireEvent.click(getContextEntryByLine(container, markdown));

      expect(onOpenContextEntry).toHaveBeenCalledWith('p1', [{ from: 24, to: 31 }]);
      expect(onOpenNoteEntry).not.toHaveBeenCalled();
    });

    it('two identical lines at different offsets each reveal their own distinct occurrence, not the first text match', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const line = 'Check the #design spec.';
      const markdown = `${line}\nSomething else.\n${line}`;
      const firstHash = markdown.indexOf('#design');
      const secondLineStart = markdown.lastIndexOf(line);
      const secondHash = secondLineStart + line.indexOf('#design');
      const page = fakePage({
        markdown,
        tagOccurrences: [
          { name: 'design', startOffset: firstHash, endOffset: firstHash + 7 },
          { name: 'design', startOffset: secondHash, endOffset: secondHash + 7 },
        ],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const onOpenContextEntry = vi.fn();
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault, onOpenContextEntry }
          )}
        </>
      );

      const entries = getContextEntryTexts(container).filter((el) => el.textContent === line);
      expect(entries).toHaveLength(2);

      fireEvent.click(entries[0]!);
      expect(onOpenContextEntry).toHaveBeenLastCalledWith('p1', [{ from: firstHash, to: firstHash + 7 }]);

      fireEvent.click(entries[1]!);
      expect(onOpenContextEntry).toHaveBeenLastCalledWith('p1', [{ from: secondHash, to: secondHash + 7 }]);
    });

    it('never mutates the page object/Markdown source while rendering or clicking', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = 'We need to improve the #design system before release.';
      const page = fakePage({
        markdown,
        tagOccurrences: [{ name: 'design', startOffset: 24, endOffset: 31 }],
      });
      const snapshot = JSON.parse(JSON.stringify(page));
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );
      fireEvent.click(getContextEntryByLine(container, markdown));

      expect(page).toEqual(snapshot);
    });

    it('a context entry offers no note-action menu — navigation/reveal only', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = 'We need to improve the #design system before release.';
      const page = fakePage({
        markdown,
        tagOccurrences: [{ name: 'design', startOffset: 24, endOffset: 31 }],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
      expect(screen.queryByRole('menuitem')).toBeNull();
    });
  });

  describe('expanded tag children — frontmatter + inline combined', () => {
    it('a note with both frontmatter membership and inline occurrences shows both the note entry and the context entry, not deduplicated', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = 'We need to improve the #design system before release.';
      const page = fakePage({
        markdown,
        tagOccurrences: [{ name: 'design', startOffset: 24, endOffset: 31 }],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      expect(screen.getByText('My Note')).toBeInTheDocument();
      expect(getContextEntryByLine(container, markdown)).toBeInTheDocument();
    });

    it('renders the frontmatter note entry before its inline context entries', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      const markdown = 'We need to improve the #design system before release.';
      const page = fakePage({
        markdown,
        tagOccurrences: [{ name: 'design', startOffset: 24, endOffset: 31 }],
      });
      const effectivePageState = {
        getPagesByTag: () => [fakeNote()],
        getPagesByFrontmatterTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      const { container } = render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      const rows = [...container.querySelectorAll('.entry')].map((el) => el.textContent ?? '');
      const noteIndex = rows.findIndex((text) => text.includes('My Note'));
      const contextIndex = rows.findIndex((text) => text.includes(markdown));

      expect(noteIndex).toBeGreaterThanOrEqual(0);
      expect(contextIndex).toBeGreaterThan(noteIndex);
    });
  });

  describe('expanded tag children — a frontmatter-only tag (no inline occurrence for this note)', () => {
    it('shows only the note entry, no context entries, for a note whose tag membership is frontmatter-only', () => {
      const tagExpansionStore = { isExpanded: () => true, toggleExpanded: noop } as unknown as TagExpansionStore;
      // No inline occurrence anywhere in this note's body for "design".
      const page = fakePage({ markdown: 'Nothing inline here.', tagOccurrences: [] });
      const effectivePageState = {
        getPagesByTag: () => [],
        getPagesByFrontmatterTag: () => [fakeNote()],
      } as unknown as EffectivePageState;
      const vault = { getPage: () => page } as unknown as Vault;
      render(
        <>
          {renderTags(
            [{ name: 'design', favorite: false, usageCount: 1 }],
            { ...renderOptions, tagExpansionStore, effectivePageState, vault }
          )}
        </>
      );

      expect(screen.getByText('My Note')).toBeInTheDocument();
      expect(screen.queryByText(/Nothing inline here/)).toBeNull();
    });
  });
});
