// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionTableAssetCell } from './CollectionTableAssetCell';
import { CollectionTableDateCell } from './CollectionTableDateCell';
import { CollectionTableHeaderCell } from './CollectionTableHeaderCell';

vi.mock('@features/pdf/usePdfDocument', () => ({
  usePdfDocument: vi.fn(() => ({ status: 'loading' as const })),
}));

afterEach(cleanup);

describe('CollectionTableHeaderCell', () => {
  it('renders title, description and metadata on the shared CollectionEntry, with the row-entry hook class', () => {
    const { container, getByText } = render(
      <CollectionTableHeaderCell icon="note" title="Plan" description="Q4 goals" metadata="PDF" />
    );

    const cell = container.querySelector('.collection-table-cell--header')!;
    expect(cell).toHaveClass('collection-entry', 'collection-table-row__entry');
    expect(getByText('Plan')).toHaveClass('collection-entry__title');
    expect(getByText('Q4 goals')).toHaveClass('collection-entry__description');
    expect(getByText('PDF').closest('.collection-entry__metadata')).not.toBeNull();
    expect(cell.querySelector('.collection-entry__icon')).not.toBeNull();
  });

  it('shows the placeholder (styled as empty) only when the description is empty and a placeholder is given', () => {
    const withPlaceholder = render(<CollectionTableHeaderCell title="A" descriptionPlaceholder="No description" />);
    expect(withPlaceholder.getByText('No description')).toHaveClass('collection-table-row__description-empty');
    cleanup();

    const withoutPlaceholder = render(<CollectionTableHeaderCell title="A" />);
    expect(withoutPlaceholder.container.querySelector('.collection-entry__description')).toBeNull();
    cleanup();

    const withDescription = render(
      <CollectionTableHeaderCell title="A" description="Real" descriptionPlaceholder="No description" />
    );
    expect(withDescription.getByText('Real')).not.toHaveClass('collection-table-row__description-empty');
  });

  it('prefers titleContent over title and wires selection', () => {
    const onSelectedChange = vi.fn();
    const { container, getByTestId, queryByText } = render(
      <CollectionTableHeaderCell
        title="Old"
        titleContent={<input data-testid="rename" />}
        isSelectable
        onSelectedChange={onSelectedChange}
      />
    );

    expect(getByTestId('rename')).toBeInTheDocument();
    expect(queryByText('Old')).toBeNull();
    expect(container.querySelector('.collection-entry--selectable')).not.toBeNull();
  });
});

describe('CollectionTableDateCell', () => {
  it('renders the formatted value as metadata, with the column hook and machine date', () => {
    const { container, getByText } = render(
      <CollectionTableDateCell value="Oct 3, 2026" dateTime="2026-10-03" className="collection-table-row__created" />
    );

    const cell = container.querySelector('.collection-table-cell--date')!;
    expect(cell).toHaveClass('collection-entry', 'collection-table-row__created');
    expect(cell).toHaveAttribute('data-date', '2026-10-03');
    expect(getByText('Oct 3, 2026').closest('.collection-entry__metadata')).not.toBeNull();
  });

  it('still renders an (empty) cell without a value, so the grid track is kept', () => {
    const { container } = render(<CollectionTableDateCell />);
    const cell = container.querySelector('.collection-table-cell--date')!;
    expect(cell).toBeInTheDocument();
    expect(cell.querySelector('.collection-entry__metadata')).toBeNull();
  });
});

describe('CollectionTableAssetCell', () => {
  it('shows an image thumbnail, and falls back to the kind icon when it fails to load', () => {
    const { container } = render(<CollectionTableAssetCell kind="image" url="app://house.png" />);

    const img = container.querySelector('img.collection-table-cell__thumbnail-image')!;
    expect(img).toHaveAttribute('src', 'app://house.png');
    expect(container.querySelector('.collection-table-cell__thumbnail')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.collection-table-cell__thumbnail-icon')).not.toBeNull();
  });

  it('renders a PDF through the shared first-page preview, in the thumbnail wrapper (not the card one)', () => {
    const { container } = render(<CollectionTableAssetCell kind="pdf" url="app://manual.pdf" />);

    expect(container.querySelector('.collection-table-cell__thumbnail-pdf')).not.toBeNull();
    expect(container.querySelector('.asset-card__pdf')).toBeNull();
    expect(container.querySelector('[data-asset-kind="pdf"]')).not.toBeNull();
  });

  it('shows the kind icon when there is no URL', () => {
    const { container } = render(<CollectionTableAssetCell kind="pdf" />);
    expect(container.querySelector('.collection-table-cell__thumbnail-icon')).not.toBeNull();
    expect(container.querySelector('.collection-table-cell__thumbnail-pdf')).toBeNull();
  });
});
