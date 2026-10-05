// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';

import type { NotePreviewResolvers } from './notePreviewResolvers';
import { NOTE_CARD_ASPECT_RATIO, NOTE_GRID, toNoteCardProps, type NoteCardOptions } from './toNoteCardProps';

afterEach(cleanup);

const entry = (overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel => ({
  id: 'n1',
  type: 'note',
  title: 'Plan',
  icon: 'note',
  emoji: null,
  selected: false,
  onClick: () => {},
  markdown: '# Heading',
  ...overrides,
});
const SHOW_ALL: NoteCardOptions['show'] = { description: true, updated: true };
const resolvers: NotePreviewResolvers = {
  resolveCoverImage: (cover) => (cover.startsWith('Assets/') ? `app://vault/${cover}` : cover),
};

/** A note as the generic card draws it — the mapper's props through the real primitive. */
function draw(model: CollectionEntryModel, options: Partial<NoteCardOptions> = {}) {
  return render(<CollectionCard {...toNoteCardProps(model, { show: SHOW_ALL, resolvers, ...options })} />);
}

describe('toNoteCardProps', () => {
  it('is a fixed-shape card on the generic card: header, then the page canvas — no note-specific card component', () => {
    const { container } = draw(entry({ updated: '12 Aug 2026' }));
    const card = container.firstElementChild as HTMLElement;

    expect(card).toHaveClass('collection-card', 'collection-card--layout-stack');
    expect(card.style.aspectRatio).toBe(NOTE_CARD_ASPECT_RATIO);
    expect([...card.children].map((c) => c.className)).toEqual([
      'collection-card__header',
      'collection-card__content',
    ]);
    expect(NOTE_GRID).toEqual({ min: 200, max: 5 });
  });

  it('renders title and metadata in the header, and the page as a separate region', () => {
    const { container } = draw(entry({ updated: '12 Aug 2026' }));

    const header = container.querySelector('.collection-card__header')!;
    expect(header.querySelector('.card-title-section__title')?.textContent).toBe('Plan');
    expect(header.querySelector('.card-title-section__metadata')?.textContent).toBe('Edited 12 Aug 2026');
    // Icon + title share the heading row; metadata is below it, not inside.
    const heading = header.querySelector('.card-title-section__heading')!;
    expect(heading.querySelector('.app-icon')).toBeInTheDocument();
    expect(heading.contains(header.querySelector('.card-title-section__metadata'))).toBe(false);
    const page = container.querySelector('.note-page-canvas')!;
    expect(header.contains(page)).toBe(false);
    expect(page.querySelector('h1')?.textContent).toBe('Heading');
  });

  it("draws the note's emoji instead of the note icon", () => {
    const { container } = draw(entry({ emoji: '🌊' }));

    expect(container.querySelector('.card-title-section__leading .emoji-icon')).toHaveTextContent('🌊');
  });

  it('shows the description on its own line above the edited date', () => {
    const { container } = draw(entry({ description: 'What this note is about', updated: '12 Aug 2026', markdown: '' }));

    const lines = [
      ...container.querySelectorAll('.card-title-section__description, .card-title-section__metadata-item'),
    ];
    expect(lines.map((l) => l.textContent)).toEqual(['What this note is about', 'Edited 12 Aug 2026']);
  });

  it('renders no description line (and no placeholder) when there is none', () => {
    const { container } = draw(entry({ updated: '12 Aug 2026', markdown: '' }));

    expect(container.querySelector('.card-title-section__description')).toBeNull();
    expect(container.textContent).not.toMatch(/No description/);
  });

  it('the Description / Last edited properties turn their lines off', () => {
    const { container } = draw(entry({ description: 'About', updated: '12 Aug 2026' }), {
      show: { description: false, updated: false },
    });

    expect(container.querySelector('.card-title-section__description')).toBeNull();
    expect(container.querySelector('.card-title-section__metadata')).toBeNull();
  });

  it('omits the metadata row entirely when there is nothing to show', () => {
    const { container } = draw(entry({ markdown: '' }));

    expect(container.querySelector('.card-title-section__metadata')).toBeNull();
  });

  it('never repeats the title inside the page', () => {
    const { container } = draw(entry({ title: 'Unique Title', markdown: 'just body' }));

    expect(container.querySelector('.note-page-canvas__body')!.textContent).toBe('just body');
  });

  it('opens the note on click and on Enter/Space, from the card itself only', () => {
    const onClick = vi.fn();
    const { container } = draw(entry({ markdown: '- a', onClick }));
    const card = container.firstElementChild!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);

    onClick.mockClear();
    fireEvent.keyDown(container.querySelector('.note-page-canvas li')!, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is a single focusable target — nothing inside the page is focusable', () => {
    const { container } = draw(entry({ markdown: '[a](https://x.example) [[Wiki]] #tag ![[p.png]]' }));

    expect(container.querySelectorAll('[tabindex]')).toHaveLength(1);
    expect(container.querySelector('.note-page-canvas a, .note-page-canvas button')).toBeNull();
  });

  it('is selected when the entry is', () => {
    const { container } = draw(entry({ selected: true }));

    expect(container.firstElementChild).toHaveClass('collection-card--selected');
  });

  describe('the cover', () => {
    it('is INSIDE the page canvas, before the body, so it scales with the document', () => {
      const { container } = draw(entry({ markdown: 'body', cover: 'Assets/hero.png' }));

      const page = container.querySelector('.note-page-canvas__page')!;
      const img = page.querySelector('.note-page-canvas__cover img')!;
      expect(img.getAttribute('src')).toBe('app://vault/Assets/hero.png');
      expect(page.querySelector('.note-page-canvas__cover')!.nextElementSibling).toHaveClass('note-page-canvas__body');
      expect(container.querySelector('.collection-card__header img')).toBeNull();
    });

    it('applies the saved above focal position to the crop', () => {
      const { container } = draw(entry({ markdown: '', cover: 'Assets/hero.png', coverPositionAbove: 20 }));

      expect(container.querySelector<HTMLImageElement>('.note-page-canvas__cover img')!.style.objectPosition).toBe('50% 20%');
    });

    it('is omitted when hidden, absent or unresolvable — the card still has its canvas', () => {
      for (const [model, options] of [
        [entry({ cover: 'Assets/hero.png', coverHidden: true }), {}],
        [entry({}), {}],
        [entry({ cover: 'Assets/hero.png' }), { resolvers: { resolveCoverImage: () => null } }],
      ] as const) {
        const { container } = draw(model, options);
        expect(container.querySelector('.note-page-canvas__cover')).toBeNull();
        expect(container.querySelector('.note-page-canvas')).not.toBeNull();
        cleanup();
      }
    });
  });
});
