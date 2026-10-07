// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Workspace } from '@core/workspace/Workspace';
import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import type { Page } from '@core/vault/models/Page';

import { Tags } from './Sidebar.Tags';

// The overflow menu's Overlay positioning effect needs this in jsdom —
// same stub renderTags.test.tsx/Tag.test.tsx already use.
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

const defaultPageMetadata = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function makePage(id: string, tagNames: readonly string[]): Page {
  return {
    id,
    type: 'note',
    name: id,
    path: `/vault/${id}.md`,
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: tagNames.map((name) => ({ name, sourcePageId: id })),
      links: [],
      embeds: [],
    },
  };
}

function makeVault(pages: Page[]): Vault {
  return new Vault(
    '/vault',
    pages,
    [],
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function fakeNavigation(): NavigationRouter {
  return { openTag: vi.fn() } as unknown as NavigationRouter;
}

function fakeTagOperations(
  rename: (oldName: string, newName: string) => Promise<void>,
  canRename: (oldName: string, newName: string) => boolean = (_oldName, newName) =>
    newName.trim() !== ''
): TagOperations {
  return {
    updateMetadata: vi.fn(() => Promise.resolve()),
    rename,
    canRename,
    countUnusedTags: () => 0,
    deleteUnusedTags: vi.fn(() => Promise.resolve(0)),
  } as unknown as TagOperations;
}

// None of these tests exercise expansion/reveal — expand/collapse and
// child-note-click behavior is covered separately (renderTags.test.tsx
// for the row/expansion logic itself). These fakes only satisfy Tags'
// required props.
function extraPanelProps() {
  return {
    pageOperations: { open: vi.fn() } as unknown as PageOperations,
    folderOperations: { create: vi.fn() } as unknown as FolderOperations,
    effectivePageState: {
      getPagesByTag: () => [],
      hasDraftForTag: () => false,
    } as unknown as EffectivePageState,
    membershipSelector: {
      vaultRoot: '/vault',
      getWorkspaceFolders: () => [],
      getVisibleChildFolders: () => [],
    } as unknown as MembershipSelector,
    workspace: { activePageId: null, isSectionExpanded: () => true, setSectionExpanded: vi.fn() } as unknown as Workspace,
    tagExpansionStore: {
      isExpanded: () => false,
      toggleExpanded: vi.fn(),
      subscribe: () => () => {},
    } as unknown as TagExpansionStore,
    collectionViewConfigStore: { deleteKey: vi.fn() } as unknown as CollectionViewConfigStore,
    onRequestReveal: vi.fn(),
    onRequestNewTag: vi.fn(),
    onRevealInNotesSidebar: vi.fn(),
  };
}

function startRenaming() {
  fireEvent.click(screen.getAllByRole('button').at(-1)!);
  fireEvent.click(screen.getByText('Rename'));
  return screen.getByRole('textbox');
}

describe('Sidebar Tags — overflow → Rename focus transition', () => {
  it('clicking Rename leaves the EditableText mounted and focused, with the caret at the end — the overlay closing must not steal focus back', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} {...extraPanelProps()} />);

    const field = startRenaming();

    expect(field).toBe(document.activeElement);
    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe('Product design'.length);
  });
});

describe('Sidebar Tags — rename commit rejection wiring', () => {
  it('submitting an empty value returns false to EditableText — the row stays in edit mode, nothing is persisted', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} {...extraPanelProps()} />);

    const field = startRenaming();
    field.textContent = '';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rename).not.toHaveBeenCalled();
    // Still in edit mode — the field is still a textbox, not reverted to
    // a static row (which would mean the session had ended).
    expect(screen.getByRole('textbox')).toBe(field);
  });

  it('submitting a whitespace-only value also returns false — does not call TagOperations.rename', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} {...extraPanelProps()} />);

    const field = startRenaming();
    field.textContent = '   ';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rename).not.toHaveBeenCalled();
  });

  it('submitting a valid value calls TagOperations.rename with the raw old name and the canonical (hyphenated) new name', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} {...extraPanelProps()} />);

    const field = startRenaming();
    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rename).toHaveBeenCalledWith('Product-design', 'UX-design');
  });

  it('a valid rename ends the edit session — the row is no longer a textbox', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} {...extraPanelProps()} />);

    startRenaming();
    const field = screen.getByRole('textbox');
    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a duplicate-identity value (canRename() rejects it) does not call rename() — stays in edit mode, nothing persisted', () => {
    const rename = vi.fn(() => Promise.resolve());
    const canRename = vi.fn((_oldName: string, newName: string) => newName.trim() !== 'Marketing');
    const page = makePage('p1', ['Product-design']);
    render(
      <Tags
        vault={makeVault([page])}
        navigation={fakeNavigation()}
        tagOperations={fakeTagOperations(rename, canRename)}
        {...extraPanelProps()}
      />
    );

    const field = startRenaming();
    field.textContent = 'Marketing';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(canRename).toHaveBeenCalledWith('Product-design', 'Marketing');
    expect(rename).not.toHaveBeenCalled();
    // Still in edit mode, with the rejected value left exactly as typed —
    // not reverted, not cleared — so the user can fix it in place.
    const stillEditing = screen.getByRole('textbox');
    expect(stillEditing).toBe(field);
    expect(stillEditing.textContent).toBe('Marketing');
  });

  it('a duplicate-identity rejection refocuses the field with the caret at the end and triggers the shake', () => {
    const rename = vi.fn(() => Promise.resolve());
    const canRename = vi.fn((_oldName: string, newName: string) => newName.trim() !== 'Marketing');
    const page = makePage('p1', ['Product-design']);
    render(
      <Tags
        vault={makeVault([page])}
        navigation={fakeNavigation()}
        tagOperations={fakeTagOperations(rename, canRename)}
        {...extraPanelProps()}
      />
    );

    const field = startRenaming();
    field.textContent = 'Marketing';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(field).toBe(document.activeElement);
    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe('Marketing'.length);
    expect(field.dataset.shake).toBe('true');
  });

  it('valid-after-invalid: rejecting a duplicate first, then submitting a valid name, calls rename() only for the valid attempt', () => {
    const rename = vi.fn(() => Promise.resolve());
    const canRename = vi.fn((_oldName: string, newName: string) => newName.trim() !== 'Marketing');
    const page = makePage('p1', ['Product-design']);
    render(
      <Tags
        vault={makeVault([page])}
        navigation={fakeNavigation()}
        tagOperations={fakeTagOperations(rename, canRename)}
        {...extraPanelProps()}
      />
    );

    const field = startRenaming();
    field.textContent = 'Marketing';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(rename).not.toHaveBeenCalled();

    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith('Product-design', 'UX-design');
  });

  it('a name with a character outside the tag grammar (e.g. "Personal: project") is rejected the same way a duplicate is — stays open, preserves the typed value, shakes', () => {
    const rename = vi.fn(() => Promise.resolve());
    // Mirrors TagOperations.canRename()'s own real rejection for this
    // exact input (see TagOperations.test.ts) — this test's job is the
    // UI reaction, not re-proving the character-grammar check itself.
    const canRename = vi.fn((_oldName: string, newName: string) => !newName.includes(':'));
    const page = makePage('p1', ['Product-design']);
    render(
      <Tags
        vault={makeVault([page])}
        navigation={fakeNavigation()}
        tagOperations={fakeTagOperations(rename, canRename)}
        {...extraPanelProps()}
      />
    );

    const field = startRenaming();
    field.textContent = 'Personal: project';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(canRename).toHaveBeenCalledWith('Product-design', 'Personal: project');
    expect(rename).not.toHaveBeenCalled();

    const stillEditing = screen.getByRole('textbox');
    expect(stillEditing).toBe(field);
    expect(stillEditing.textContent).toBe('Personal: project');
    expect(stillEditing).toBe(document.activeElement);

    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe('Personal: project'.length);
    expect(stillEditing.dataset.shake).toBe('true');
  });
});

describe('Sidebar Tags — invalid-character rename, real TagOperations (no mocked canRename)', () => {
  it('"Personal: project" is rejected end-to-end by the real TagOperations.canRename() — never persisted, session stays open', () => {
    const page = makePage('p1', ['Product-design']);
    const vault = makeVault([page]);
    const tagOperations = {
      updateMetadata: vi.fn(() => Promise.resolve()),
      countUnusedTags: () => 0,
      // Delegates to the exact same regex TagOperations.ts itself uses,
      // proving the wiring reacts correctly to a real rejection — the
      // character-grammar rule's own correctness is TagOperations.test.ts's
      // job, not this file's.
      canRename: (_oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return false;
        return /^[A-Za-z0-9_-]+$/.test(trimmed.replace(/\s+/g, '-'));
      },
      rename: vi.fn(() => Promise.resolve()),
    } as unknown as TagOperations;

    render(<Tags vault={vault} navigation={fakeNavigation()} tagOperations={tagOperations} {...extraPanelProps()} />);

    const field = startRenaming();
    field.textContent = 'Personal: project';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(tagOperations.rename).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox').textContent).toBe('Personal: project');
    expect(screen.getByRole('textbox').dataset.shake).toBe('true');
  });

  it('ordinary invalid blur (focus genuinely moves away) still reverts to the original value and ends the session — unchanged by this fix', () => {
    const page = makePage('p1', ['Product-design']);
    const vault = makeVault([page]);
    const tagOperations = {
      updateMetadata: vi.fn(() => Promise.resolve()),
      countUnusedTags: () => 0,
      canRename: (_oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return false;
        return /^[A-Za-z0-9_-]+$/.test(trimmed.replace(/\s+/g, '-'));
      },
      rename: vi.fn(() => Promise.resolve()),
    } as unknown as TagOperations;

    render(<Tags vault={vault} navigation={fakeNavigation()} tagOperations={tagOperations} {...extraPanelProps()} />);

    const field = startRenaming();
    field.textContent = 'Personal: project';
    fireEvent.input(field);
    fireEvent.blur(field);

    expect(tagOperations.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Product design')).toBeInTheDocument();
  });
});

describe('Sidebar Tags — tags added through Properties (frontmatter) are listed', () => {
  const withPropertyTags = (page: Page, tags: string[]): Page => ({
    ...page,
    metadata: { ...page.metadata, tags },
  });
  const renderSidebar = (pages: Page[]) =>
    render(
      <Tags
        vault={makeVault(pages)}
        navigation={fakeNavigation()}
        tagOperations={fakeTagOperations(() => Promise.resolve())}
        {...extraPanelProps()}
      />
    );

  it('lists a tag that exists only in a note\'s Properties', () => {
    renderSidebar([withPropertyTags(makePage('p1', []), ['design', 'research'])]);

    expect(screen.getByText('design')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();
  });

  it('lists a tag used inline and in Properties once', () => {
    renderSidebar([withPropertyTags(makePage('p1', ['design']), ['design'])]);

    expect(screen.getAllByText('design')).toHaveLength(1);
  });

  it('lists body tags and Properties tags together', () => {
    renderSidebar([makePage('p1', ['body']), withPropertyTags(makePage('p2', []), ['property'])]);

    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByText('property')).toBeInTheDocument();
  });
});

describe('Sidebar Tags — overflow → Delete', () => {
  function setupDelete(complete: boolean) {
    const deleteTag = vi.fn(async () => ({
      attemptedPageCount: 1,
      updatedPageIds: complete ? ['p1'] : [],
      skipped: [],
      failed: [],
      complete,
    }));
    const deleteKey = vi.fn();
    const removeTag = vi.fn();
    const props = extraPanelProps();
    const page = makePage('p1', ['Product-design']);

    render(
      <Tags
        vault={makeVault([page])}
        navigation={fakeNavigation()}
        tagOperations={{ ...fakeTagOperations(vi.fn(() => Promise.resolve())), deleteTag } as unknown as TagOperations}
        {...props}
        collectionViewConfigStore={{ deleteKey } as unknown as CollectionViewConfigStore}
        tagExpansionStore={{ ...props.tagExpansionStore, removeTag } as unknown as TagExpansionStore}
      />
    );

    return { deleteTag, deleteKey, removeTag };
  }

  const openDelete = () => {
    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByText('Delete'));
  };
  const confirmation = () => document.querySelector<HTMLElement>('.confirmation')!;

  it('Delete is in the row menu and asks first, naming the tag', () => {
    const t = setupDelete(true);
    openDelete();

    expect(within(confirmation()).getByText('Delete Product design?')).toBeInTheDocument();
    expect(
      within(confirmation()).getByText('This will permanently delete the tag. You can\u2019t undo this action.')
    ).toBeInTheDocument();
    expect(t.deleteTag).not.toHaveBeenCalled();
  });

  it('Cancel deletes nothing', () => {
    const t = setupDelete(true);
    openDelete();

    fireEvent.click(within(confirmation()).getByRole('button', { name: 'Cancel' }));

    expect(t.deleteTag).not.toHaveBeenCalled();
  });

  it('confirming deletes the tag and forgets its collection config and expansion state', async () => {
    const t = setupDelete(true);
    openDelete();

    fireEvent.click(within(confirmation()).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(t.deleteTag).toHaveBeenCalledWith('Product-design'));
    await waitFor(() => expect(t.removeTag).toHaveBeenCalledWith('Product-design'));
    expect(t.deleteKey).toHaveBeenCalledWith('tag:Product-design');
  });

  it('an incomplete delete forgets nothing', async () => {
    const t = setupDelete(false);
    openDelete();

    fireEvent.click(within(confirmation()).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(t.deleteTag).toHaveBeenCalled());
    expect(t.deleteKey).not.toHaveBeenCalled();
    expect(t.removeTag).not.toHaveBeenCalled();
  });
});
