// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FavoriteList } from './FavoriteList';
import { Workspace } from '@core/workspace/Workspace';
import type { FavoriteItem } from '../models/FavoriteItem';
import type { SidebarRowActions } from './FolderTree';

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

describe('FavoriteList — no unknown DOM props leak through Entry (React console warning regression)', () => {
  it('renders a favorited note without React warning about an unrecognized DOM attribute', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items: FavoriteItem[] = [
      { id: 'note-1', title: 'My Note', titleStyle: 'default', type: 'note', emoji: null },
    ];

    render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders a favorited folder without React warning about an unrecognized DOM attribute', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const items: FavoriteItem[] = [
      { id: 'folder-1', title: 'My Folder', titleStyle: 'default', type: 'folder', emoji: null },
    ];

    render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('FavoriteList — compact Markdown title rendering', () => {
  it('renders a favorited note title as compact Markdown, not raw syntax', () => {
    const items: FavoriteItem[] = [
      {
        id: 'note-1',
        title: '**Ship** [[Project Alpha]] #urgent',
        titleStyle: 'default',
        type: 'note',
        emoji: null,
      },
    ];

    const { container } = render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    const titleEl = container.querySelector('.note__title')!;
    expect(titleEl.querySelector('strong')).toHaveTextContent('Ship');
    expect(titleEl.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Project Alpha');
    expect(titleEl.querySelector('.compact-markdown-tag')).toHaveTextContent('#urgent');
    expect(titleEl).not.toHaveTextContent('**Ship**');
  });

  it('resolves a favorited note WikiLink through the injected resolveWikiLink, not the fallback', () => {
    const resolveWikiLink = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      displayLabel: 'Resolved Label',
      activate: () => {},
    });
    const items: FavoriteItem[] = [
      { id: 'note-1', title: '[[Projects/Alpha|Alpha]]', titleStyle: 'default', type: 'note', emoji: null },
    ];

    const { container } = render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
        resolveWikiLink={resolveWikiLink}
      />
    );

    expect(resolveWikiLink).toHaveBeenCalledWith('Projects/Alpha', 'Alpha');
    expect(container.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Resolved Label');
  });

  it('a favorited folder title (plain name, never Markdown-bearing) still renders unaffected', () => {
    const items: FavoriteItem[] = [
      { id: 'folder-1', title: 'My Folder', titleStyle: 'default', type: 'folder', emoji: null },
    ];

    const { getByText } = render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(getByText('My Folder')).toBeDefined();
  });
});

describe('FavoriteList — location actions dispatch (previously listed but inert)', () => {
  function renderWithRowActions(items: FavoriteItem[]) {
    const rowActions = {
      openMenuId: items[0]!.id,
      onOpenMenu: vi.fn(),
      onCloseMenu: vi.fn(),
      noteMoveDestinations: [],
      createFolderInZone: () => undefined,
      getFolderMoveDestinations: () => [],
      onRevealPageInFinder: vi.fn(),
      onCopyPagePath: vi.fn(),
      onCreateTemplate: vi.fn(),
      onRevealFolderInFinder: vi.fn(),
      onCopyFolderPath: vi.fn(),
    } as unknown as SidebarRowActions;

    render(
      <FavoriteList
        items={items}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
        rowActions={rowActions}
      />
    );

    return rowActions;
  }

  it('Reveal in Finder on a favorited note reveals that note', () => {
    const rowActions = renderWithRowActions([
      { id: 'note-1', title: 'N', titleStyle: 'default', type: 'note', emoji: null },
    ]);

    fireEvent.click(screen.getByText('Reveal in Finder'));

    expect(rowActions.onRevealPageInFinder).toHaveBeenCalledWith('note-1');
  });

  it('Copy path > Full path on a favorited note copies that note\'s path', () => {
    const rowActions = renderWithRowActions([
      { id: 'note-1', title: 'N', titleStyle: 'default', type: 'note', emoji: null },
    ]);

    fireEvent.click(screen.getByText('Copy path'));
    fireEvent.click(screen.getByText('Full path'));

    expect(rowActions.onCopyPagePath).toHaveBeenCalledWith('note-1', 'full-path');
  });

  it('Reveal in Finder on a favorited folder reveals that folder', () => {
    const rowActions = renderWithRowActions([
      { id: 'folder-1', title: 'F', titleStyle: 'default', type: 'folder', emoji: null },
    ]);

    fireEvent.click(screen.getByText('Reveal in Finder'));

    expect(rowActions.onRevealFolderInFinder).toHaveBeenCalledWith('folder-1');
  });

  it('Copy path > From vault on a favorited folder copies that folder\'s path', () => {
    const rowActions = renderWithRowActions([
      { id: 'folder-1', title: 'F', titleStyle: 'default', type: 'folder', emoji: null },
    ]);

    fireEvent.click(screen.getByText('Copy path'));
    fireEvent.click(screen.getByText('From vault'));

    expect(rowActions.onCopyFolderPath).toHaveBeenCalledWith('folder-1', 'at-vault');
  });

  it('Create template on a favorited note asks to create a template from that note', () => {
    const rowActions = renderWithRowActions([
      { id: 'note-1', title: 'N', titleStyle: 'default', type: 'note', emoji: null },
    ]);

    fireEvent.click(screen.getByText('Create template'));

    expect(rowActions.onCreateTemplate).toHaveBeenCalledWith('note-1');
  });

  it('a favorited Template offers no Create template', () => {
    renderWithRowActions([
      { id: 'note-1', title: 'N', titleStyle: 'default', type: 'note', emoji: null, isTemplate: true },
    ]);

    expect(screen.queryByText('Create template')).toBeNull();
  });
});

describe('FavoriteList — a favorited folder\'s Sort by is the folder\'s own, like its tree row', () => {
  const folderItem: FavoriteItem = { id: 'folder-1', title: 'F', titleStyle: 'default', type: 'folder', emoji: null };
  const rowActions = () =>
    ({
      openMenuId: 'folder-1',
      onOpenMenu: vi.fn(),
      onCloseMenu: vi.fn(),
      getFolderMoveDestinations: () => [],
      createFolderInZone: () => undefined,
    }) as unknown as SidebarRowActions;

  it('offers Sort by when the sort state is supplied, and picking a key calls onFolderSortChange for that folder', () => {
    const onFolderSortChange = vi.fn();
    render(
      <FavoriteList
        items={[folderItem]}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
        rowActions={rowActions()}
        getFolderSort={() => ({ key: 'name', direction: 'down' })}
        onFolderSortChange={onFolderSortChange}
      />
    );

    fireEvent.click(screen.getByText('Sort by'));
    fireEvent.click(screen.getByText('Created'));

    expect(onFolderSortChange).toHaveBeenCalledWith('folder-1', { key: 'created', direction: 'down' });
  });

  it('re-picking the active key flips its direction', () => {
    const onFolderSortChange = vi.fn();
    render(
      <FavoriteList
        items={[folderItem]}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
        rowActions={rowActions()}
        getFolderSort={() => ({ key: 'name', direction: 'down' })}
        onFolderSortChange={onFolderSortChange}
      />
    );

    fireEvent.click(screen.getByText('Sort by'));
    fireEvent.click(screen.getByText('Name'));

    expect(onFolderSortChange).toHaveBeenCalledWith('folder-1', { key: 'name', direction: 'up' });
  });

  it('has no Sort by when no sort state is supplied', () => {
    render(
      <FavoriteList
        items={[folderItem]}
        workspace={new Workspace()}
        onOpenPage={vi.fn()}
        onOpenFolder={vi.fn()}
        rowActions={rowActions()}
      />
    );

    expect(screen.queryByText('Sort by')).toBeNull();
  });
});
