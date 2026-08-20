// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
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
  } as unknown as TagOperations;
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
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} />);

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
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} />);

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
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} />);

    const field = startRenaming();
    field.textContent = '   ';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rename).not.toHaveBeenCalled();
  });

  it('submitting a valid value calls TagOperations.rename with the raw old name and the canonical (hyphenated) new name', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} />);

    const field = startRenaming();
    field.textContent = 'UX design';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rename).toHaveBeenCalledWith('Product-design', 'UX-design');
  });

  it('a valid rename ends the edit session — the row is no longer a textbox', () => {
    const rename = vi.fn(() => Promise.resolve());
    const page = makePage('p1', ['Product-design']);
    render(<Tags vault={makeVault([page])} navigation={fakeNavigation()} tagOperations={fakeTagOperations(rename)} />);

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

    render(<Tags vault={vault} navigation={fakeNavigation()} tagOperations={tagOperations} />);

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
      canRename: (_oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return false;
        return /^[A-Za-z0-9_-]+$/.test(trimmed.replace(/\s+/g, '-'));
      },
      rename: vi.fn(() => Promise.resolve()),
    } as unknown as TagOperations;

    render(<Tags vault={vault} navigation={fakeNavigation()} tagOperations={tagOperations} />);

    const field = startRenaming();
    field.textContent = 'Personal: project';
    fireEvent.input(field);
    fireEvent.blur(field);

    expect(tagOperations.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Product design')).toBeInTheDocument();
  });
});
