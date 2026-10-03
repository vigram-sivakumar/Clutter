// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CollectionBody,
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  type NoteCoverActions,
} from './CollectionBody';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

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

function noteEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'note-1',
    type: 'note',
    title: 'My note',
    icon: 'note',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

function coverActions(overrides: Partial<NoteCoverActions> = {}): NoteCoverActions {
  return {
    resolveUrl: (cover) => `app://vault/${cover}`,
    onSet: vi.fn(),
    onSetFromUpload: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

const coverCell = (container: HTMLElement) => container.querySelector('.collection-table-row__cover')!;
const coverButton = (container: HTMLElement) =>
  coverCell(container).querySelector<HTMLButtonElement>('button.collection-media')!;

describe('CollectionBody — Table: Cover image column', () => {
  it('is a media column after Name, labelled "Cover image", when the host can change covers', () => {
    const { container } = render(
      <CollectionBody notes={[noteEntry()]} viewMode="table" noteCover={coverActions()} />
    );

    expect([...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual([
      'Name',
      'Cover image',
      'Created',
      'Last edited',
    ]);
    const row = container.querySelector('.collection-table-row')!;
    expect(row.children).toHaveLength(4);
    expect(row.children[1]).toHaveClass('collection-table-cell--media', 'collection-table-row__cover');
  });

  it('is not offered without cover support, or when the Cover image property is off', () => {
    const without = render(<CollectionBody notes={[noteEntry()]} viewMode="table" />);
    expect(without.container.querySelector('.collection-table-row__cover')).toBeNull();
    expect(without.container.querySelectorAll('.collection-table__header-cell')).toHaveLength(3);
    cleanup();

    const off = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="table"
        noteCover={coverActions()}
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, cover: false }}
      />
    );
    expect(off.container.querySelector('.collection-table-row__cover')).toBeNull();
    expect(off.container.querySelector('.collection-table__header-cell--cover')).toBeNull();
  });

  it('shows the note\'s resolved cover, framed at its focal point', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ cover: 'Assets/sea.png', coverPositionAbove: 30 })]}
        viewMode="table"
        noteCover={coverActions()}
      />
    );

    const img = coverCell(container).querySelector('img')!;
    expect(img).toHaveAttribute('src', 'app://vault/Assets/sea.png');
    expect(img.style.objectPosition).toBe('50% 30%');
    expect(coverButton(container)).toHaveAttribute('aria-label', 'Change cover image');
  });

  it('shows a plus to add one when the note has no cover, or its cover is hidden', () => {
    for (const entry of [noteEntry(), noteEntry({ cover: 'Assets/sea.png', coverHidden: true })]) {
      const { container } = render(
        <CollectionBody notes={[entry]} viewMode="table" noteCover={coverActions()} />
      );

      expect(coverCell(container).querySelector('img')).toBeNull();
      expect(coverCell(container).querySelector('.note-cover-thumbnail__empty')).not.toBeNull();
      expect(coverButton(container)).toHaveAttribute('aria-label', 'Add cover image');
      cleanup();
    }
  });

  it('clicking the cover opens the cover picker for that note — and does not open the note', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CollectionBody notes={[noteEntry({ onClick })]} viewMode="table" noteCover={coverActions()} />
    );
    expect(document.querySelector('.image-picker')).toBeNull();

    fireEvent.click(coverButton(container));

    expect(document.querySelector('.image-picker')).not.toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('opens the picker to the left of the thumbnail, vertically centered on it', () => {
    const rect = (top: number, left: number, width: number, height: number) =>
      ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('collection-media')) return rect(200, 600, 30, 30);
        if (this.classList.contains('overlay__surface')) return rect(0, 0, 320, 300);
        return rect(0, 0, 0, 0);
      });
    try {
      const { container } = render(
        <CollectionBody notes={[noteEntry()]} viewMode="table" noteCover={coverActions()} />
      );

      fireEvent.click(coverButton(container));

      const surface = document.querySelector('.overlay__surface') as HTMLElement;
      const content = document.querySelector('.overlay__content') as HTMLElement;
      // Thumbnail middle is y = 215; the picker is 300 tall → top 65. Left edge: 600 − 320 − 6 gap.
      expect(content).toHaveClass('overlay__content--left');
      expect(content.style.transformOrigin).toBe('right center');
      expect(surface.style.top).toBe('65px');
      expect(surface.style.left).toBe('274px');
    } finally {
      spy.mockRestore();
    }
  });

  it('opens on the image sources — also for a note with no cover yet, so the plus goes straight to adding one', () => {
    const { container } = render(
      <CollectionBody notes={[noteEntry()]} viewMode="table" noteCover={coverActions()} />
    );

    fireEvent.click(coverButton(container));

    expect(document.querySelector('.image-picker__buttons')).not.toBeNull();
  });

  it('the picker\'s remove tab clears that note\'s cover and closes the picker', () => {
    const noteCover = coverActions();
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ id: 'a' }), noteEntry({ id: 'b', title: 'Other', cover: 'Assets/sea.png' })]}
        viewMode="table"
        noteCover={noteCover}
      />
    );

    fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.collection-table-row__cover button')[1]!);
    fireEvent.click(screen.getByTestId('sidebar.tab.hide')); // the picker's "hide" (remove) tab

    expect(noteCover.onRemove).toHaveBeenCalledWith('b');
    expect(document.querySelector('.image-picker')).toBeNull();
  });

  it('a link pick sets that note\'s cover and closes the picker', async () => {
    const OriginalImage = window.Image;
    vi.stubGlobal(
      'Image',
      function (this: HTMLImageElement) {
        const img = new OriginalImage();
        Object.defineProperty(img, 'src', {
          set() {
            queueMicrotask(() => img.onload?.(new Event('load')));
          },
        });
        return img;
      } as unknown as typeof Image
    );
    try {
      localStorage.setItem('clutter-cover-picker-source', 'link');
      const noteCover = coverActions();
      const { container } = render(
        <CollectionBody notes={[noteEntry({ id: 'a' })]} viewMode="table" noteCover={noteCover} />
      );

      fireEvent.click(coverButton(container));
      fireEvent.change(screen.getByPlaceholderText('Paste image URL'), {
        target: { value: 'https://example.com/sea.png' },
      });
      fireEvent.click(screen.getByText(/^Add$/));

      await waitFor(() => expect(noteCover.onSet).toHaveBeenCalledWith('a', 'https://example.com/sea.png'));
      expect(document.querySelector('.image-picker')).toBeNull();
    } finally {
      vi.stubGlobal('Image', OriginalImage);
      localStorage.removeItem('clutter-cover-picker-source');
    }
  });

  it('never renders the column or picker in Card mode', () => {
    const { container } = render(
      <CollectionBody notes={[noteEntry()]} viewMode="card" noteCover={coverActions()} />
    );
    expect(container.querySelector('.collection-table-row__cover, .collection-media')).toBeNull();
    expect(document.querySelector('.image-picker')).toBeNull();
  });
});

describe('CollectionBody — List: Cover image media', () => {
  const listMedia = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('.collection-list-row .collection-entry__media button.collection-media')!;

  it('shows each note\'s resolved cover as the row\'s trailing media, framed at its focal point', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ cover: 'Assets/sea.png', coverPositionAbove: 30 })]}
        viewMode="list"
        noteCover={coverActions()}
      />
    );

    const img = listMedia(container).querySelector('img')!;
    expect(img).toHaveAttribute('src', 'app://vault/Assets/sea.png');
    expect(img.style.objectPosition).toBe('50% 30%');
    expect(listMedia(container)).toHaveAttribute('aria-label', 'Change cover image');
  });

  it('shows a plus to add one when the note has no cover, or its cover is hidden', () => {
    for (const entry of [noteEntry(), noteEntry({ cover: 'Assets/sea.png', coverHidden: true })]) {
      const { container } = render(
        <CollectionBody notes={[entry]} viewMode="list" noteCover={coverActions()} />
      );

      expect(listMedia(container).querySelector('img')).toBeNull();
      expect(listMedia(container).querySelector('.note-cover-thumbnail__empty')).not.toBeNull();
      expect(listMedia(container)).toHaveAttribute('aria-label', 'Add cover image');
      cleanup();
    }
  });

  it('clicking it opens the cover picker for that note — and does not open the note', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CollectionBody notes={[noteEntry({ onClick })]} viewMode="list" noteCover={coverActions()} />
    );

    fireEvent.click(listMedia(container));

    expect(document.querySelector('.image-picker')).not.toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is not offered without cover support, or when the Cover image property is off', () => {
    const without = render(<CollectionBody notes={[noteEntry()]} viewMode="list" />);
    expect(without.container.querySelector('.collection-media')).toBeNull();
    cleanup();

    const off = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="list"
        noteCover={coverActions()}
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, cover: false }}
      />
    );
    expect(off.container.querySelector('.collection-media')).toBeNull();
  });
});
