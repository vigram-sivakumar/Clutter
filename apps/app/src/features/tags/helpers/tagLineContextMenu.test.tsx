// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RowContextMenuEnabled } from '@components/entry/EntryMenuContext';
import { buildCollectionItemMenu } from '@app/layouts/page/body/buildCollectionItemMenu';
import { CollectionBody } from '@app/layouts/page/body/CollectionBody';
import { noteEntry } from '@features/collection/testing/collectionEntry';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import { TagContextEntry } from '../sidebar/TagContextEntry';
import { buildTagLineMenu } from './buildTagLineMenu';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const rightClick = (element: Element) => {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
};
const labels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('the shared matching-line menu', () => {
  it('is exactly Show in note, wired to the line\'s own opener', () => {
    const open = vi.fn();
    const { menu, handlers } = buildTagLineMenu(open);

    expect(menu.map((item) => item.label)).toEqual(['Show in note']);
    handlers['open-in-note']!();
    expect(open).toHaveBeenCalledOnce();
  });
});

describe('Sidebar TagContextEntry', () => {
  const setup = (onShowInNote = vi.fn(), onClick = vi.fn()) => {
    const result = render(
      <RowContextMenuEnabled value>
        <TagContextEntry level={1} lineText="hey #work" onClick={onClick} onShowInNote={onShowInNote} />
      </RowContextMenuEnabled>
    );
    return { ...result, onShowInNote, onClick };
  };

  it('has the row\'s ⋯ button, which opens the one-action menu anchored to the button', () => {
    const rect = (r: Partial<DOMRect>) => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {}, ...r }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('overlay__surface')) return rect({ width: 100, height: 60, right: 100, bottom: 60 });
      if (this.getAttribute('aria-haspopup') === 'menu') return rect({ left: 200, top: 300, right: 220, bottom: 320, width: 20, height: 20 });
      return rect({});
    });
    const { container } = setup();

    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);

    expect(labels()).toEqual(['Show in note']);
    const surface = document.querySelector<HTMLElement>('.overlay__surface')!;
    expect(parseFloat(surface.style.left)).toBe(200);
    expect(parseFloat(surface.style.top)).toBeGreaterThanOrEqual(320);
    spy.mockRestore();
  });

  it('right-click opens the identical menu at the pointer, suppressing the native menu', () => {
    const { container } = setup();

    const event = rightClick(screen.getByText('hey', { exact: false }));

    expect(event.defaultPrevented).toBe(true);
    expect(labels()).toEqual(['Show in note']);
    expect(container.querySelector('.entry-force-hover')).not.toBeNull();
    // Opened at the pointer: not the button's menu.
    expect(document.querySelector('span[aria-hidden="true"][style*="position: fixed"]')).not.toBeNull();
  });

  it('Show in note runs the row\'s existing opener (note + highlighted line) and clears the hover', () => {
    const { container, onShowInNote, onClick } = setup();
    rightClick(screen.getByText('hey', { exact: false }));

    fireEvent.click(screen.getByText('Show in note'));

    expect(onShowInNote).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    expect(container.querySelector('.entry-force-hover')).toBeNull();
  });

  it('left-click still opens as before, without a menu', () => {
    const { onClick } = setup();
    fireEvent.click(screen.getByText('hey', { exact: false }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Tag Collection View', () => {
  const lineEntry = (onClick: () => void): CollectionEntryModel => ({
    ...noteEntry({ id: 'note-1#tag-line-0', title: 'hey #work', onClick }),
    noteId: 'note-1',
    tagLine: 'hey #work',
  });

  it('a matching-line entry opens the same one-action menu, and Show in note uses the entry\'s own opener', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CollectionBody
        notes={[lineEntry(onClick)]}
        viewMode="list"
        itemMenu={(entry) => buildCollectionItemMenu({} as never, {} as never, entry)}
      />
    );

    const event = rightClick(container.querySelector('.collection-entry')!);

    expect(event.defaultPrevented).toBe(true);
    expect(labels()).toEqual(['Show in note']);
    expect(container.querySelector("[data-context-menu-open='true']")).not.toBeNull();

    fireEvent.click(screen.getByText('Show in note'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-context-menu-open='true']")).toBeNull();
  });

  it('never resolves a matching line to its source note\'s general menu', () => {
    const application = {
      vault: {
        getPage: vi.fn(() => {
          throw new Error('the source note must not be looked up');
        }),
      },
    };
    expect(() => buildCollectionItemMenu(application as never, {} as never, lineEntry(() => {}))).not.toThrow();
  });
});
