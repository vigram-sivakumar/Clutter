// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchEntry } from './SearchEntry';

afterEach(cleanup);

describe('SearchEntry', () => {
  it('is an Entry with the title, location and a one-line excerpt', () => {
    render(<SearchEntry icon="note" title="Meeting notes" path="Work / Plans" excerpt="the weekly agenda is attached" />);

    const row = screen.getByText('Meeting notes').closest('.entry')!;

    expect(row).toHaveClass('search-entry');
    expect(row.querySelector('.search-entry__title')).toHaveTextContent('Meeting notes');
    expect(row.querySelector('.search-entry__path')).toHaveTextContent('Work / Plans');
    expect(row.querySelector('.search-entry__excerpt')).toHaveTextContent('the weekly agenda is attached');
  });

  it('leaves out the levels it was not given', () => {
    render(<SearchEntry icon="note" title="Just a title" />);

    const row = screen.getByText('Just a title').closest('.entry')!;

    expect(row.querySelector('.search-entry__path')).toBeNull();
    expect(row.querySelector('.search-entry__excerpt')).toBeNull();
    expect(row.querySelectorAll('.search-entry__meta')).toHaveLength(0);
  });

  it('shows badges after the title and a note about more matches after the excerpt', () => {
    render(<SearchEntry icon="note" title="New note" badges={['Draft', 'Close match']} excerpt="x" more="2 more matches" />);

    const row = screen.getByText('New note').closest('.entry')!;
    const titleRow = row.querySelector('.search-entry__title-row')!;

    expect(Array.from(titleRow.querySelectorAll('.search-entry__meta')).map((badge) => badge.textContent)).toEqual([
      'Draft',
      'Close match',
    ]);
    expect(row.querySelector('.search-entry__content > .search-entry__meta')).toHaveTextContent('2 more matches');
  });

  it('shows the page icon, or the emoji in its place', () => {
    const { rerender } = render(<SearchEntry icon="note" title="A" />);

    expect(document.querySelector('.search-entry__leading [data-icon="note"]')).not.toBeNull();

    rerender(<SearchEntry icon="note" emoji="🍒" title="A" />);

    expect(document.querySelector('.search-entry__leading')).toHaveTextContent('🍒');
    expect(document.querySelector('.search-entry__leading [data-icon="note"]')).toBeNull();
  });

  it('passes the row behavior of Entry through: role, id, hover state, click and mouse enter', () => {
    const onClick = vi.fn();
    const onMouseEnter = vi.fn();

    render(
      <SearchEntry
        id="row-1"
        role="menuitem"
        tabIndex={-1}
        icon="note"
        title="Row"
        forceHover
        onClick={onClick}
        onMouseEnter={onMouseEnter}
      />
    );

    const row = screen.getByRole('menuitem');

    expect(row).toHaveAttribute('id', 'row-1');
    expect(row).toHaveClass('entry-force-hover');

    fireEvent.mouseEnter(row);
    fireEvent.click(row);

    expect(onMouseEnter).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets a host tell a click on the excerpt from a click on the rest of the row', () => {
    const clicks: boolean[] = [];

    render(
      <SearchEntry
        icon="note"
        title="Row"
        excerpt="matching line"
        onClick={(event) => clicks.push((event.target as HTMLElement).closest('.search-entry__excerpt') !== null)}
      />
    );

    fireEvent.click(screen.getByText('matching line'));
    fireEvent.click(screen.getByText('Row'));

    expect(clicks).toEqual([true, false]);
  });

  it('appends a caller class to its own', () => {
    render(<SearchEntry icon="note" title="Row" className="host-class" />);

    expect(screen.getByText('Row').closest('.entry')).toHaveClass('search-entry', 'host-class');
  });

  it('marks the matching ranges of the title and the excerpt, and only those', () => {
    render(
      <SearchEntry
        icon="note"
        title="New note"
        titleMatches={[{ from: 0, to: 3 }]}
        excerpt="a new note, a newer one"
        excerptMatches={[
          { from: 2, to: 5 },
          { from: 14, to: 17 },
        ]}
      />
    );

    const row = document.querySelector('.entry.search-entry')!;
    const marks = (selector: string) =>
      Array.from(row.querySelectorAll(`${selector} mark.search-entry__match`)).map((mark) => mark.textContent);

    expect(marks('.search-entry__title')).toEqual(['New']);
    expect(marks('.search-entry__excerpt')).toEqual(['new', 'new']);
    expect(row.querySelector('.search-entry__excerpt')!.textContent).toBe('a new note, a newer one');
  });

  it('shows plain text when nothing matched', () => {
    render(<SearchEntry icon="note" title="Title" excerpt="text" />);

    expect(document.querySelector('mark')).toBeNull();
  });
});

