// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const editorViewConstructions = vi.hoisted(() => ({ count: 0 }));

// Counts every real EditorView construction anywhere in the module graph —
// the preview must never cause one.
vi.mock('@codemirror/view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codemirror/view')>();
  class SpyEditorView extends actual.EditorView {
    constructor(...args: ConstructorParameters<typeof actual.EditorView>) {
      super(...args);
      editorViewConstructions.count += 1;
    }
  }
  return { ...actual, EditorView: SpyEditorView };
});

import { DocumentPreview, type DocumentPreviewResolvers } from './DocumentPreview';
import { NoteCard } from './NoteCard';

beforeEach(() => {
  editorViewConstructions.count = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NoteCard', () => {
  it('renders title and metadata in the header, and the preview as a separate region', () => {
    const { container } = render(
      <NoteCard title="Plan" updated="12 Aug 2026" markdown="# Heading" />
    );

    const header = container.querySelector('.note-card__header')!;
    expect(header.querySelector('.card-title')?.textContent).toBe('Plan');
    expect(header.querySelector('.card-metadata')?.textContent).toBe('Edited 12 Aug 2026');
    // Icon + title share the heading row; metadata is below it, not inside.
    const heading = header.querySelector('.card-title-section__heading')!;
    expect(heading.querySelector('.card-title')).toBeInTheDocument();
    expect(heading.querySelector('.app-icon')).toBeInTheDocument();
    expect(heading.contains(header.querySelector('.card-metadata'))).toBe(false);
    const preview = container.querySelector('.document-preview')!;
    expect(header.contains(preview)).toBe(false);
    expect(preview.querySelector('h1')?.textContent).toBe('Heading');
  });

  it('shows the description on its own line above the edited date', () => {
    const { container } = render(
      <NoteCard title="Plan" description="What this note is about" updated="12 Aug 2026" markdown="" />
    );

    const lines = [...container.querySelectorAll('.card-description, .card-metadata > span')];
    expect(lines.map((l) => l.textContent)).toEqual(['What this note is about', 'Edited 12 Aug 2026']);
    expect(lines[0]).toHaveClass('card-description');
  });

  it('renders no description line (and no placeholder) when there is none', () => {
    const { container } = render(<NoteCard title="Plan" updated="12 Aug 2026" markdown="" />);

    expect(container.querySelector('.note-card__description')).toBeNull();
    expect(container.textContent).not.toMatch(/No description/);
  });

  it('never repeats the title inside the preview', () => {
    const { container } = render(<NoteCard title="Unique Title" markdown="just body" />);

    expect(container.querySelector('.document-preview')!.textContent).toBe('just body');
  });

  it('omits the metadata row entirely when there is nothing to show', () => {
    const { container } = render(<NoteCard title="Plan" markdown="" />);

    expect(container.querySelector('.collection-entry__metadata')).toBeNull();
  });

  it('opens the note on click and on Enter/Space, from the card itself only', () => {
    const onClick = vi.fn();
    const { container } = render(<NoteCard title="Plan" markdown="- a" onClick={onClick} />);
    const card = container.querySelector('.note-card')!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);

    onClick.mockClear();
    fireEvent.keyDown(container.querySelector('.document-preview li')!, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is a single focusable target — nothing inside the preview is focusable', () => {
    const { container } = render(
      <NoteCard title="Plan" markdown="[a](https://x.example) [[Wiki]] #tag ![[p.png]]" />
    );

    expect(container.querySelectorAll('[tabindex]')).toHaveLength(1);
    expect(container.querySelector('.document-preview a, .document-preview button')).toBeNull();
  });
});

describe('DocumentPreview — safety', () => {
  it('never constructs an EditorView or mounts CodeMirror DOM', () => {
    const { container } = render(
      <DocumentPreview markdown={'# T\n\n```ts\ncode\n```\n\n- a\n\n| A |\n|---|\n| 1 |\n\n![[note]]'} />
    );

    expect(editorViewConstructions.count).toBe(0);
    expect(container.querySelector('.cm-editor, .cm-content')).toBeNull();
  });

  it('is aria-hidden and pointer-inert so it cannot be an interactive copy of the document', () => {
    const { container } = render(<DocumentPreview markdown="text" />);

    expect(container.querySelector('.document-preview')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not mutate its inputs (frozen resolvers + string markdown render without throwing)', () => {
    const resolvers: DocumentPreviewResolvers = Object.freeze({
      resolveCoverImage: vi.fn(() => 'app://c.png'),
    });
    const markdown = '# T\n\nbody';

    expect(() => render(<NoteCard title="T" markdown={markdown} cover="Assets/c.png" previewResolvers={resolvers} />)).not.toThrow();
    expect(markdown).toBe('# T\n\nbody');
  });
});

describe('DocumentPreview — lazy mounting (IntersectionObserver)', () => {
  type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

  function stubObserver() {
    const observers: Array<{ callback: Callback; disconnect: ReturnType<typeof vi.fn>; options?: IntersectionObserverInit }> = [];
    class FakeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: Callback, options?: IntersectionObserverInit) {
        observers.push({ callback, disconnect: this.disconnect, options });
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    return observers;
  }

  it('does not render (or parse) the document until the card is near the viewport', () => {
    const observers = stubObserver();
    const { container } = render(<DocumentPreview markdown="# Far away" />);

    expect(container.querySelector('.document-preview')).toBeInTheDocument();
    expect(container.querySelector('.document-preview__canvas')).toBeNull();
    expect(observers[0]!.options?.rootMargin).toMatch(/px$/);

    act(() => observers[0]!.callback([{ isIntersecting: false }]));
    expect(container.querySelector('.document-preview__canvas')).toBeNull();

    act(() => observers[0]!.callback([{ isIntersecting: true }]));
    expect(container.querySelector('h1')?.textContent).toBe('Far away');
  });

  it('stops observing once rendered, so scrolling away never discards or re-parses it', () => {
    const observers = stubObserver();
    const { container } = render(<DocumentPreview markdown="# Kept" />);

    act(() => observers[0]!.callback([{ isIntersecting: true }]));

    expect(observers[0]!.disconnect).toHaveBeenCalled();
    act(() => observers[0]!.callback([{ isIntersecting: false }]));
    expect(container.querySelector('h1')?.textContent).toBe('Kept');
  });
});

describe('NoteCard — the sections: header, cover, content', () => {
  const resolvers: DocumentPreviewResolvers = {
    resolveCoverImage: (cover) => (cover.startsWith('Assets/') ? `app://vault/${cover}` : cover),
  };
  const sections = (container: HTMLElement) =>
    [...container.querySelector('.note-card')!.children].map((el) =>
      el.classList.contains('note-card__header')
        ? 'header'
        : el.classList.contains('note-card__cover')
          ? 'cover'
          : el.classList.contains('document-preview')
            ? 'content'
            : 'other'
    );

  it('lays the sections out as siblings in order: header, cover, content', () => {
    const { container } = render(
      <NoteCard title="T" markdown="body" cover="Assets/hero.png" previewResolvers={resolvers} />
    );

    expect(sections(container)).toEqual(['header', 'cover', 'content']);
    expect(container.querySelector('.note-card__cover-image')!.getAttribute('src')).toBe('app://vault/Assets/hero.png');
  });

  it('keeps the cover OUT of the content canvas — it is its own section and is not scaled with the document', () => {
    const { container } = render(
      <NoteCard title="T" markdown="body" cover="Assets/hero.png" previewResolvers={resolvers} />
    );

    expect(container.querySelector('.document-preview .note-card__cover')).toBeNull();
    expect(container.querySelector('.document-preview img')).toBeNull();
    expect(container.querySelector('.document-preview__canvas .note-card__cover-image')).toBeNull();
  });

  it('applies the saved above focal position to the crop', () => {
    const { container } = render(
      <NoteCard title="T" markdown="" cover="Assets/hero.png" coverPositionAbove={20} previewResolvers={resolvers} />
    );

    expect((container.querySelector('.note-card__cover-image') as HTMLElement).style.objectPosition).toBe('50% 20%');
  });

  it('omits the cover section when the cover is hidden, absent or unresolvable (content on: no empty slot)', () => {
    for (const props of [
      { cover: 'Assets/hero.png', coverHidden: true },
      {},
      { cover: 'Assets/hero.png', previewResolvers: { resolveCoverImage: () => null } },
    ]) {
      const { container } = render(<NoteCard title="T" markdown="x" previewResolvers={resolvers} {...props} />);
      expect(sections(container)).toEqual(['header', 'content']);
      cleanup();
    }
  });

  it('has no notion of cover layout: a side-positioned note renders the same top banner, before the content', () => {
    // `coverLayout` is not an input (CollectionEntryModel carries only the above position), so a note whose own
    // cover sits on the right can only ever produce this one banner, always before the content.
    const { container } = render(
      <NoteCard title="T" markdown="body" cover="Assets/hero.png" coverPositionAbove={30} previewResolvers={resolvers} />
    );

    expect(sections(container)).toEqual(['header', 'cover', 'content']);
    expect(container.querySelector('.note-card__cover')!.innerHTML).toBe(
      '<img class="note-card__cover-image" src="app://vault/Assets/hero.png" alt="" draggable="false" loading="lazy" style="object-position: 50% 30%;">'
    );
  });

  it('Cover image off removes the cover section; Content preview off removes the content section', () => {
    const noCover = render(<NoteCard title="T" markdown="x" cover="Assets/hero.png" showCover={false} previewResolvers={resolvers} />);
    expect(sections(noCover.container)).toEqual(['header', 'content']);
    cleanup();

    const noContent = render(<NoteCard title="T" markdown="x" cover="Assets/hero.png" showContent={false} previewResolvers={resolvers} />);
    expect(sections(noContent.container)).toEqual(['header', 'cover']);
    expect(noContent.container.querySelector('.note-card')).toHaveClass('note-card--cover-only');
    cleanup();

    const neither = render(<NoteCard title="T" markdown="x" cover="Assets/hero.png" showCover={false} showContent={false} />);
    expect(sections(neither.container)).toEqual(['header']);
    expect(neither.container.querySelector('.note-card')).toHaveClass('note-card--header-only');
  });

  it('with content off, a note WITHOUT a cover has no cover section — the card keeps its shape (the cover fills it when there is one)', () => {
    const { container } = render(<NoteCard title="T" markdown="x" showContent={false} previewResolvers={resolvers} />);

    expect(sections(container)).toEqual(['header']);
    expect(container.querySelector('.note-card')).toHaveClass('note-card--cover-only');
    expect(container.querySelector('.note-card')).not.toHaveClass('note-card--header-only');
  });

  it('with content off and a cover, the cover is the second section and the card is in cover-fill mode', () => {
    const { container } = render(
      <NoteCard title="T" markdown="x" cover="Assets/hero.png" showContent={false} previewResolvers={resolvers} />
    );

    expect(sections(container)).toEqual(['header', 'cover']);
    expect(container.querySelector('.note-card')).toHaveClass('note-card--cover-only');
  });

  it('never renders the content (or its blocks) while Content preview is off', () => {
    const { container } = render(<NoteCard title="T" markdown="# Hidden heading" showContent={false} />);

    expect(container.textContent).not.toContain('Hidden heading');
    expect(container.querySelector('.document-preview__body')).toBeNull();
  });

  it('lays the content canvas out at a fixed width — no inline width or transform; only the measured scale is inline', () => {
    const { container } = render(<NoteCard title="T" markdown="x" />);

    const canvas = container.querySelector<HTMLElement>('.document-preview__canvas')!;
    // The only inline value is the measured scale; the layout width and the transform itself are the stylesheet's.
    expect(canvas.getAttribute('style') ?? '').not.toMatch(/(^|[;\s])width|transform/);
  });
});
