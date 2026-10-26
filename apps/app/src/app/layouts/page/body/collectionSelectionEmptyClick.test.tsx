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
afterEach(async () => {
  // The click a marquee release fires is swallowed until the next tick.
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
});

const boxes = () => screen.queryAllByRole('checkbox', { hidden: true });
const checkedNames = () =>
  boxes()
    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
    .map((checkbox) => checkbox.getAttribute('aria-label'));
/** Every sign of selection and of selection mode a layout draws. */
const markers = (container: HTMLElement) =>
  container.querySelectorAll('[class*="--checked"], [class*="--selecting"], [aria-checked="true"]');
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
const bodyRoot = (container: HTMLElement) => container.querySelector('.collection__content') as HTMLElement;

const press = (el: Element, init: object = {}) =>
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, isPrimary: true, clientX: 200, clientY: 20, ...init });
const release = () =>
  act(() => {
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
const click = (el: Element, init: object = {}) => {
  press(el, init);
  release();
};
const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' });

describe('clicking empty space in the notes and folders body', () => {
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
  const draw = (viewMode: 'list' | 'table' | 'card', onCreate?: () => void) =>
    render(<CollectionBody notes={NOTES} folders={FOLDERS} viewMode={viewMode} itemMenu={resolverFor()} onCreate={onCreate} />);
  const rowOf = (text: string) => screen.getByText(text).closest('.collection-entry, .collection-card')!;
  const rightClick = (element: Element) =>
    act(() => {
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }));
    });

  describe.each(['list', 'table', 'card'] as const)('in the %s layout', (viewMode) => {
    it('clears one selected item, and a selection of notes and a folder together', () => {
      const { container } = draw(viewMode);
      fireEvent.click(box('Alpha'));
      expect(checkedNames()).toEqual(['Select Alpha']);
      click(bodyRoot(container));
      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);

      fireEvent.click(box('Alpha'));
      fireEvent.click(box('Projects'));
      fireEvent.click(box('Beta'));
      expect(checkedNames()).toHaveLength(3);
      click(bodyRoot(container));
      expect(checkedNames()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('resets exactly as Escape does', () => {
      const clicked = draw(viewMode);
      fireEvent.click(box('Alpha'));
      fireEvent.click(box('Projects'));
      click(bodyRoot(clicked.container));
      const afterClick = clicked.container.innerHTML;
      cleanup();

      const escaped = draw(viewMode);
      fireEvent.click(box('Alpha'));
      fireEvent.click(box('Projects'));
      escape();

      expect(escaped.container.innerHTML).toBe(afterClick);
    });

    it('with nothing selected, changes nothing', () => {
      const { container } = draw(viewMode);
      const before = container.innerHTML;

      click(bodyRoot(container));

      expect(container.innerHTML).toBe(before);
    });

    it('keeps the selection for a click on an item’s checkbox, which toggles it as before', () => {
      draw(viewMode);
      fireEvent.click(box('Alpha'));
      fireEvent.click(box('Beta'));

      click(box('Beta'));
      fireEvent.click(box('Beta'));

      expect(checkedNames()).toEqual(['Select Alpha']);
    });

    it('keeps the selection for a press on a control: the Create card or row, and on an item itself', () => {
      const onCreate = vi.fn();
      const { container } = draw(viewMode, onCreate);
      fireEvent.click(box('Alpha'));

      for (const control of container.querySelectorAll('.collection-card--empty, .collection-entry--new, .collection-table-row--new-item')) {
        click(control);
      }
      click(rowOf('Beta'));

      expect(checkedNames()).toEqual(['Select Alpha']);
    });
  });

  it('keeps the selection when the click is inside the selection’s open right-click menu', () => {
    const { container } = draw('list');
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));
    rightClick(rowOf('Beta'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // The menu is outside the collection's scroll surface: a press in it is never a press on empty space.
    click(screen.getAllByRole('menuitem')[0]!);

    expect(checkedNames()).toEqual(['Select Alpha', 'Select Beta']);
    expect(markers(container).length).toBeGreaterThan(0);
  });

  it('keeps the selection when the click is on a toolbar, a dialog or anything else outside the collection', () => {
    draw('list');
    fireEvent.click(box('Alpha'));
    const toolbar = document.body.appendChild(document.createElement('button'));
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');

    click(toolbar);
    click(dialog);

    expect(checkedNames()).toEqual(['Select Alpha']);
    toolbar.remove();
    dialog.remove();
  });
});

describe('clicking empty space in the assets body', () => {
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
    it('clears one selected asset, and several — and resets as Escape does', () => {
      const clicked = draw(viewMode);
      fireEvent.click(boxes()[0]!);
      click(bodyRoot(clicked.container));
      expect(checkedNames()).toEqual([]);
      expect(markers(clicked.container)).toHaveLength(0);
      fireEvent.click(boxes()[0]!);
      fireEvent.click(boxes()[1]!);
      click(bodyRoot(clicked.container));
      expect(checkedNames()).toEqual([]);
      const afterClick = clicked.container.innerHTML;
      cleanup();

      const escaped = draw(viewMode);
      fireEvent.click(boxes()[0]!);
      fireEvent.click(boxes()[1]!);
      escape();
      expect(escaped.container.innerHTML).toBe(afterClick);
    });

    it('with nothing selected, changes nothing; a click on a checkbox keeps the selection', () => {
      const { container } = draw(viewMode);
      const before = container.innerHTML;
      click(bodyRoot(container));
      expect(container.innerHTML).toBe(before);

      fireEvent.click(boxes()[0]!);
      fireEvent.click(boxes()[1]!);
      click(boxes()[1]!);
      fireEvent.click(boxes()[1]!);
      expect(checkedNames()).toHaveLength(1);
    });
  });
});

describe('clicking empty space in the trash', () => {
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
    it('clears one selected row, and a mixed selection — and resets as Escape does', () => {
      const clicked = draw(viewMode);
      fireEvent.click(boxes()[0]!);
      click(bodyRoot(clicked.container));
      expect(checkedNames()).toEqual([]);
      expect(markers(clicked.container)).toHaveLength(0);

      for (const checkbox of boxes()) fireEvent.click(checkbox);
      expect(checkedNames()).toHaveLength(4);
      click(bodyRoot(clicked.container));
      expect(checkedNames()).toEqual([]);
      const afterClick = clicked.container.innerHTML;
      cleanup();

      const escaped = draw(viewMode);
      for (const checkbox of boxes()) fireEvent.click(checkbox);
      escape();
      expect(escaped.container.innerHTML).toBe(afterClick);
    });

    it('with nothing selected, changes nothing; a click on a checkbox keeps the selection', () => {
      const { container } = draw(viewMode);
      const before = container.innerHTML;
      click(bodyRoot(container));
      expect(container.innerHTML).toBe(before);

      fireEvent.click(boxes()[0]!);
      fireEvent.click(boxes()[1]!);
      click(boxes()[1]!);
      fireEvent.click(boxes()[1]!);
      expect(checkedNames()).toHaveLength(1);
    });
  });
});
