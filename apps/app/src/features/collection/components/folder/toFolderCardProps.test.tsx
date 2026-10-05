// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import { folderEntry, type EntryFixture } from '../../testing/collectionEntry';

import { FOLDER_GRID, toFolderCardProps } from './toFolderCardProps';

afterEach(cleanup);

const entry = (fixture: EntryFixture = {}): CollectionEntryModel =>
  folderEntry({ id: 'f1', title: 'Projects', onClick: () => {}, subfolderCount: 2, noteCount: 5, ...fixture });

const draw = (model: CollectionEntryModel) => render(<CollectionCard {...toFolderCardProps(model)} />);

describe('toFolderCardProps', () => {
  it('is a header-only card: the folder icon, its name and its counts — no media, no content', () => {
    const { container } = draw(entry());
    const card = container.firstElementChild!;

    expect(card.querySelector('.card-title-section__title')).toHaveTextContent('Projects');
    expect(card.querySelector('.card-title-section__leading svg')).not.toBeNull();
    expect([...card.querySelectorAll('.card-title-section__metadata-item')].map((i) => i.textContent)).toEqual([
      '2 Subfolders',
      '5 Notes',
    ]);
    expect(card.querySelector('.collection-card__media, .collection-card__content')).toBeNull();
    expect((card as HTMLElement).style.aspectRatio).toBe('');
  });

  it("draws the folder's emoji instead of the icon", () => {
    const { container } = draw(entry({ emoji: '📁' }));

    expect(container.querySelector('.emoji-icon')).toHaveTextContent('📁');
  });

  it('a count the entry lacks defaults to zero, but an entry with no counts at all shows just its name', () => {
    const { container, rerender } = draw(entry({ subfolderCount: undefined }));
    expect([...container.querySelectorAll('.card-title-section__metadata-item')].map((i) => i.textContent)).toEqual([
      '0 Subfolders',
      '5 Notes',
    ]);

    rerender(<CollectionCard {...toFolderCardProps(entry({ subfolderCount: undefined, noteCount: undefined }))} />);
    expect(container.querySelector('.card-title-section__metadata')).toBeNull();
    expect(container.querySelector('.card-title-section__title')).toHaveTextContent('Projects');
  });

  it('is selected when the entry is, and opens the folder on click and Enter', () => {
    const onClick = vi.fn();
    const { container } = draw(entry({ selected: true, onClick }));
    const card = container.firstElementChild!;

    expect(card).toHaveClass('collection-card--selected');
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('declares its grid: one tile tall rows of cards 200px to 1/5 of the row', () => {
    expect(FOLDER_GRID).toEqual({ columns: { min: 200, max: 5 }, rowHeight: 56 });
  });
});
