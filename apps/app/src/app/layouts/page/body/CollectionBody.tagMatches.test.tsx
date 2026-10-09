// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TagContextEntry, TAG_CONTEXT_ICON } from '@features/tags/sidebar/TagContextEntry';
import { noteEntry } from '@features/collection/testing/collectionEntry';
import { tagVisible } from '@features/collection/testing/visibleProperties';

import { CollectionBody } from './CollectionBody';

afterEach(cleanup);

const LINE = 'Ship the **#project** plan today';

/** The markup of the icon the Tags sidebar puts on a matching-content row. */
const sidebarIconMarkup = () => {
  const { container, unmount } = render(<TagContextEntry lineText={LINE} />);
  const markup = container.querySelector('svg')!.outerHTML.replace(/class="[^"]*"/, '');
  unmount();
  return markup;
};

describe.each(['list', 'table'] as const)('Tag collection note entries — %s', (viewMode) => {
  const body = (
    notes = [noteEntry({ title: 'Bullets', tagLine: LINE, source: 'Bullets' })],
    visible = tagVisible()
  ) => render(<CollectionBody notes={notes} viewMode={viewMode} visible={visible} />);

  it('the Name is the matching content (Markdown rendered), not the filename; no description is drawn under it', () => {
    const { container } = body();

    expect(container.querySelector('.collection-entry__title')).toHaveTextContent('Ship the #project plan today');
    expect(container.querySelector('.collection-entry__title')).not.toHaveTextContent('**');
    expect(container.querySelector('.collection-entry__title')).not.toHaveTextContent('Bullets');
    expect(container.querySelector('.collection-entry__description')).toBeNull();
  });

  it('marks the content with the same icon the Tags sidebar uses', () => {
    const { container } = body();
    const icon = container.querySelector('.collection-entry__leading svg')!;

    expect(TAG_CONTEXT_ICON).toBe('squiggleLine');
    expect(icon.outerHTML.replace(/class="[^"]*"/, '')).toBe(sidebarIconMarkup());
  });

  it('the Source is drawn exactly as the Task Collection draws it (the shared wiki-link-styled source link) — never a path', () => {
    const { container } = body([noteEntry({ id: 'a', tagLine: LINE, source: 'Bullets' })]);
    const link = container.querySelector('.collection-entry-properties--wiki')!;

    expect(container.querySelector('.collection-entry__description')).toBeNull();
    expect(link).toHaveAttribute('role', 'link');
    expect(link).toHaveAttribute('aria-label', 'Open Bullets');
    expect(link.querySelector('.collection-entry-properties__text')).toHaveTextContent('Bullets');
    expect(link.querySelector('.collection-entry-properties__leading svg')).not.toBeNull();
    expect(container.textContent).not.toContain('/');
    if (viewMode === 'table') {
      expect(container).toHaveTextContent('Source');
    }
  });

  it('clicking the Source link opens the source note, once, without also firing the row click', () => {
    const onClick = vi.fn();
    const { container } = body([noteEntry({ id: 'a', noteId: 'n', tagLine: LINE, source: 'Bullets', onClick })]);

    fireEvent.click(container.querySelector('.collection-entry-properties--wiki')!);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a Source hidden through the property configuration is not shown', () => {
    const { container } = body([noteEntry({ id: 'a', tagLine: LINE, source: 'Bullets' })], tagVisible('source'));

    expect(container).not.toHaveTextContent('Bullets');
  });

  it('each matching line is its own entry, all with the same Source; clicking each opens its own note', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container } = body([
      noteEntry({ id: 'n1#tag-line-0', noteId: 'n1', tagLine: 'first #project', source: 'Bullets', onClick: first }),
      noteEntry({ id: 'n1#tag-line-1', noteId: 'n1', tagLine: 'second #project', source: 'Bullets', onClick: second }),
    ]);
    const titles = [...container.querySelectorAll('.collection-entry__title')].map((t) => t.textContent);
    const entries = container.querySelectorAll('.collection-entry');

    expect(titles).toEqual(['first #project', 'second #project']);
    expect(container.querySelector('.collection-entry__description')).toBeNull();
    fireEvent.click(entries[1]!);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('a note entry (frontmatter-only membership) keeps its name, icon and DEFAULT description, and has no Source', () => {
    const { container } = body(
      [noteEntry({ title: 'Frontmatter', description: 'About it' })],
      tagVisible()
    );

    expect(container.querySelector('.collection-entry__title')).toHaveTextContent('Frontmatter');
    expect(container.querySelector('.collection-entry__description')).toHaveTextContent('About it');
    expect(container).not.toHaveTextContent('Frontmatter Frontmatter');
    // The note's own icon, not the matching-content one.
    expect(container.querySelector('.collection-entry__leading svg')!.outerHTML.replace(/class="[^"]*"/, '')).not.toBe(
      sidebarIconMarkup()
    );
  });

  it('a note entry with no description draws none; a Daily Note entry behaves the same', () => {
    const { container } = body([
      noteEntry({ id: 'plain', title: 'Frontmatter' }),
      noteEntry({ id: 'daily', title: '2026-10-09' }),
    ]);

    expect(container.querySelectorAll('.collection-entry__title')).toHaveLength(2);
    expect(container.querySelector('.collection-entry__description')).toBeNull();
  });

  it('the description is hidden for a note entry when the Description property is off, and a content entry never draws one', () => {
    const { container } = body(
      [
        noteEntry({ id: 'note', title: 'Frontmatter', description: 'About it' }),
        noteEntry({ id: 'line', noteId: 'note', tagLine: LINE, source: 'Frontmatter' }),
      ],
      tagVisible('description')
    );

    expect(container.querySelector('.collection-entry__description')).toBeNull();
  });

  it('clicking an entry opens that note', () => {
    const onClick = vi.fn();
    const { container } = body([noteEntry({ id: 'n1', noteId: 'n1', tagLine: LINE, source: 'Bullets', onClick })]);

    fireEvent.click(container.querySelector('.collection-entry')!);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('property visibility is unaffected: visible properties still show, hidden ones stay hidden', () => {
    const updated = '2026-08-12T14:20:00.000Z';
    const shown = body([noteEntry({ tagLine: LINE, source: 'N', updated })], tagVisible('updated'));
    const withUpdated = shown.container.textContent;
    shown.unmount();

    const hidden = body([noteEntry({ tagLine: LINE, source: 'N', updated })], tagVisible());
    expect(hidden.container.textContent).not.toBe(withUpdated);
  });

  it('outside a Tag collection nothing changes: the note name, its icon and its own description', () => {
    const { container } = body([noteEntry({ title: 'Plain', description: 'About it' })], tagVisible());

    expect(container.querySelector('.collection-entry__title')).toHaveTextContent('Plain');
    expect(container.querySelector('.collection-entry__description')).toHaveTextContent('About it');
  });
});
