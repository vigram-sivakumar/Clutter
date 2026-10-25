// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceKind } from '@core/presentation/resourceActions/resourceActionTypes';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { localAsset } from '@core/vault/testing/localAsset';
import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import { AssetsCollectionBody } from './AssetsCollectionBody';
import { CollectionBody } from './CollectionBody';
import type { CollectionItemMenuResolver } from './useCollectionItemContextMenu';

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
afterEach(cleanup);

const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' });
const boxes = () => screen.queryAllByRole('checkbox', { hidden: true });
const checkedNames = () =>
  boxes()
    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
    .map((checkbox) => checkbox.getAttribute('aria-label'));
/** Every sign of selection and of selection mode a layout draws. */
const markers = (container: HTMLElement) =>
  container.querySelectorAll('[class*="--checked"], [class*="--selecting"], [aria-checked="true"]');
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });

describe('Escape in the notes and folders body', () => {
  const NOTES = [noteEntry({ id: 'a', title: 'Alpha' }), noteEntry({ id: 'b', title: 'Beta' })];
  const FOLDERS = [folderEntry({ id: 'f', title: 'Projects' })];

  function resolverFor(): CollectionItemMenuResolver {
    return (entry) => {
      const kind: ResourceKind = entry.type === 'folder' ? 'folder' : 'note';
      const menu = buildResourceActionMenu(kind, { status: 'active', isFavorite: false }, 'context');
      return {
        menu,
        handlers: Object.fromEntries(menu.map((item) => [item.id, () => {}])),
        isFavorite: false,
        moveDestinations: [{ id: 'dest', title: 'Dest', level: 0, parentId: null }],
        onMove: () => {},
      };
    };
  }
  const draw = (viewMode: 'list' | 'table' | 'card') =>
    render(<CollectionBody notes={NOTES} folders={FOLDERS} viewMode={viewMode} itemMenu={resolverFor()} />);
  const rowOf = (text: string) => screen.getByText(text).closest('.collection-entry, .collection-card')!;
  const rightClick = (element: Element) =>
    act(() => {
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }));
    });

  describe.each(['list', 'table', 'card'] as const)('in the %s layout', (viewMode) => {
    it('with one item selected, clears it: no checked box, no selected styling, no selection mode', () => {
      const { container } = draw(viewMode);
      fireEvent.click(box('Alpha'));
      expect(checkedNames()).toEqual(['Select Alpha']);
      expect(markers(container).length).toBeGreaterThan(0);

      escape();

      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('with a note and a folder selected, clears both', () => {
      const { container } = draw(viewMode);
      fireEvent.click(box('Alpha'));
      fireEvent.click(box('Projects'));
      fireEvent.click(box('Beta'));
      expect(checkedNames()).toHaveLength(3);

      escape();

      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('with nothing selected, changes nothing and leaves the key unconsumed', () => {
      const { container } = draw(viewMode);

      expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);

      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });
  });

  it('leaves the mode for real: the Delete shortcut of the selection has nothing to act on afterwards', () => {
    draw('list');
    fireEvent.click(box('Alpha'));
    escape();

    fireEvent.keyDown(document.body, { key: 'Backspace' });

    expect(screen.queryByText(/to trash\?/)).not.toBeInTheDocument();
  });

  it('with the selection’s right-click menu open, Escape closes the menu first and keeps the selection; the next one clears it', () => {
    draw('list');
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));
    rightClick(rowOf('Beta'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    escape();

    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
    expect(checkedNames()).toEqual(['Select Alpha', 'Select Beta']);

    escape();

    expect(checkedNames()).toEqual([]);
  });

  it('with a single item’s menu open, Escape closes only the menu', () => {
    draw('list');

    rightClick(rowOf('Alpha'));
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    escape();

    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
  });

  it('with the move-to-trash confirmation open, Escape dismisses the confirmation and keeps the selection', () => {
    draw('list');
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(screen.getByText('Move 2 items to trash?')).toBeInTheDocument();

    escape();

    expect(screen.queryByText('Move 2 items to trash?')).not.toBeInTheDocument();
    expect(checkedNames()).toEqual(['Select Alpha', 'Select Beta']);

    escape();

    expect(checkedNames()).toEqual([]);
  });
});

describe('Escape in the assets body', () => {
  const resource = (id: string, name: string): VaultResource => ({
    id,
    kind: 'image',
    name,
    path: `/vault/Assets/${name}`,
    parentId: 'assets-folder',
  });
  const ASSETS = [localAsset(resource('r1', 'house.png')), localAsset(resource('r2', 'boat.png'))];
  const draw = (viewMode: 'list' | 'table' | 'card') =>
    render(
      <AssetsCollectionBody
        assets={ASSETS}
        viewMode={viewMode}
        onRenameResource={vi.fn()}
        resolveResourceUrl={(path) => `app://vault${path.replace('/vault', '')}`}
      />
    );

  describe.each(['list', 'table', 'card'] as const)('in the %s layout', (viewMode) => {
    it('clears one selected asset, and several', () => {
      const { container } = draw(viewMode);
      fireEvent.click(boxes()[0]!);
      expect(checkedNames()).toHaveLength(1);
      escape();
      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);

      fireEvent.click(boxes()[0]!);
      fireEvent.click(boxes()[1]!);
      expect(checkedNames()).toHaveLength(2);
      escape();
      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('with nothing selected, changes nothing', () => {
      const { container } = draw(viewMode);

      expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);

      expect(markers(container)).toHaveLength(0);
    });
  });
});

describe('Escape in the trash', () => {
  const resources: VaultResource[] = [
    { id: 'r1', kind: 'image', name: 'hero.png', path: '/vault/Archive/hero.png', parentId: 'folder-archive' },
    { id: 'r2', kind: 'pdf', name: 'manual.pdf', path: '/vault/Archive/manual.pdf', parentId: 'folder-archive' },
  ];
  const draw = (viewMode: 'list' | 'table') =>
    render(
      <ArchiveCollectionBody
        folders={[folderEntry({ id: 'folder-1', title: 'Old Project' })]}
        notes={[noteEntry({ id: 'page-1', title: 'Old Note' })]}
        resources={resources}
        resolveResourceUrl={(path) => `app://vault${path}`}
        viewMode={viewMode}
      />
    );

  describe.each(['list', 'table'] as const)('in the %s layout', (viewMode) => {
    it('clears one selected row, and a mixed selection of a folder, a note and files', () => {
      const { container } = draw(viewMode);
      fireEvent.click(boxes()[0]!);
      expect(checkedNames()).toHaveLength(1);
      escape();
      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);

      for (const checkbox of boxes()) fireEvent.click(checkbox);
      expect(checkedNames()).toHaveLength(4);
      escape();
      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('with nothing selected, changes nothing', () => {
      const { container } = draw(viewMode);

      expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);

      expect(markers(container)).toHaveLength(0);
    });
  });
});
