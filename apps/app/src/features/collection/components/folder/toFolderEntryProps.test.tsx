// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionEntry } from '@features/collection/components/entry/CollectionEntry';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import { folderEntry, type EntryFixture } from '../../testing/collectionEntry';

import { FOLDER_GRID, toFolderEntryProps } from './toFolderEntryProps';

afterEach(cleanup);

const entry = (fixture: EntryFixture = {}): CollectionEntryModel =>
  folderEntry({ id: 'f1', title: 'Projects', onClick: () => {}, subfolderCount: 2, noteCount: 5, ...fixture });

const draw = (model: CollectionEntryModel) => render(<CollectionEntry {...toFolderEntryProps(model)} />);

describe('toFolderEntryProps', () => {
  it('is a CollectionEntry cell: the folder icon, its name and its counts as the description', () => {
    const { container } = draw(entry());
    const card = container.firstElementChild!;

    expect(card).toHaveClass('collection-entry', 'collection-entry--layout-cell', 'collection-entry--folder-card');
    expect(card.querySelector('.collection-entry__title')).toHaveTextContent('Projects');
    expect(card.querySelector('.collection-entry__leading svg')).not.toBeNull();
    expect(card.querySelector('.collection-entry__description')).toHaveTextContent('2 Subfolders · 5 Notes');
    expect(card.querySelector('.collection-entry__trailing')).toBeNull();
  });

  it("draws the folder's emoji instead of the icon", () => {
    const { container } = draw(entry({ emoji: '📁' }));

    expect(container.querySelector('.emoji-icon')).toHaveTextContent('📁');
  });

  it('a count the entry lacks defaults to zero, but an entry with no counts at all shows just its name', () => {
    const { container, rerender } = draw(entry({ subfolderCount: undefined }));
    expect(container.querySelector('.collection-entry__description')).toHaveTextContent('0 Subfolders · 5 Notes');

    rerender(<CollectionEntry {...toFolderEntryProps(entry({ subfolderCount: undefined, noteCount: undefined }))} />);
    expect(container.querySelector('.collection-entry__description')).toBeNull();
    expect(container.querySelector('.collection-entry__title')).toHaveTextContent('Projects');
  });

  it('is selected when the entry is, and opens the folder on click and Enter', () => {
    const onClick = vi.fn();
    const { container } = draw(entry({ selected: true, onClick }));
    const card = container.firstElementChild!;

    expect(card).toHaveClass('collection-entry--selected');
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('declares its grid: one tile tall rows of cards 200px to 1/5 of the row', () => {
    expect(FOLDER_GRID).toEqual({ columns: { min: 200, max: 5 }, rowHeight: 56 });
  });
});
