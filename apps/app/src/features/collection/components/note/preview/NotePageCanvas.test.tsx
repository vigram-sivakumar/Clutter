// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
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

import { NOTE_CANVAS_WIDTH, NotePageCanvas } from './NotePageCanvas';

beforeEach(() => {
  editorViewConstructions.count = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotePageCanvas — safety', () => {
  it('never constructs an EditorView or mounts CodeMirror DOM', () => {
    const { container } = render(
      <NotePageCanvas markdown={'# T\n\n```ts\ncode\n```\n\n- a\n\n| A |\n|---|\n| 1 |\n\n![[note]]'} />
    );

    expect(editorViewConstructions.count).toBe(0);
    expect(container.querySelector('.cm-editor, .cm-content')).toBeNull();
  });

  it('is aria-hidden and pointer-inert so it cannot be an interactive copy of the document', () => {
    const { container } = render(<NotePageCanvas markdown="text" />);

    expect(container.querySelector('.scaled-canvas')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not mutate its inputs (frozen resolvers + string markdown render without throwing)', () => {
    const resolvers = Object.freeze({});
    const markdown = '# T\n\nbody';

    expect(() => render(<NotePageCanvas markdown={markdown} coverUrl="app://c.png" resolvers={resolvers} />)).not.toThrow();
    expect(markdown).toBe('# T\n\nbody');
  });

  it('renders the Markdown body — and never a title of its own', () => {
    const { container } = render(<NotePageCanvas markdown="just body" />);

    expect(container.querySelector('.note-page-canvas__body')!.textContent).toBe('just body');
  });
});

describe('NotePageCanvas — the page: cover, then body, one canvas', () => {
  it('lays the page out at the fixed canvas width — the width is ScaledCanvas’s, the scale only is measured', () => {
    const { container } = render(<NotePageCanvas markdown="x" />);

    const canvas = container.querySelector<HTMLElement>('.scaled-canvas__canvas')!;
    expect(NOTE_CANVAS_WIDTH).toBe(600);
    expect(canvas.style.width).toBe('600px');
  });

  it('puts the cover INSIDE the canvas, before the body, so it scales with the document', () => {
    const { container } = render(<NotePageCanvas markdown="body" coverUrl="app://vault/Assets/hero.png" />);

    const page = container.querySelector('.scaled-canvas__canvas .note-page-canvas__page')!;
    const cover = page.querySelector('.note-page-canvas__cover')!;
    expect(cover.querySelector('img')).toHaveAttribute('src', 'app://vault/Assets/hero.png');
    expect(cover.nextElementSibling).toHaveClass('note-page-canvas__body');
  });

  it('applies the saved above focal position to the crop (centred by default)', () => {
    const { container, rerender } = render(<NotePageCanvas markdown="" coverUrl="app://c.png" coverPositionAbove={20} />);
    expect(container.querySelector<HTMLImageElement>('.note-page-canvas__cover img')!.style.objectPosition).toBe('50% 20%');

    rerender(<NotePageCanvas markdown="" coverUrl="app://c.png" />);
    expect(container.querySelector<HTMLImageElement>('.note-page-canvas__cover img')!.style.objectPosition).toBe('50% 50%');
  });

  it('has no cover section when there is no cover URL', () => {
    for (const coverUrl of [undefined, null, '']) {
      const { container } = render(<NotePageCanvas markdown="x" coverUrl={coverUrl} />);
      expect(container.querySelector('.note-page-canvas__cover')).toBeNull();
      cleanup();
    }
  });

  it('adds a className to the viewport', () => {
    const { container } = render(<NotePageCanvas markdown="x" className="note-page-canvas--headless" />);

    expect(container.firstElementChild).toHaveClass('note-page-canvas', 'note-page-canvas--headless');
  });
});

describe('NotePageCanvas — lazy mounting (IntersectionObserver)', () => {
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
    const { container } = render(<NotePageCanvas markdown="# Far away" />);

    expect(container.querySelector('.note-page-canvas')).toBeInTheDocument();
    expect(container.querySelector('.note-page-canvas__page')).toBeNull();
    expect(observers[0]!.options?.rootMargin).toMatch(/px$/);

    act(() => observers[0]!.callback([{ isIntersecting: false }]));
    expect(container.querySelector('.note-page-canvas__page')).toBeNull();

    act(() => observers[0]!.callback([{ isIntersecting: true }]));
    expect(container.querySelector('h1')?.textContent).toBe('Far away');
  });

  it('stops observing once rendered, so scrolling away never discards or re-parses it', () => {
    const observers = stubObserver();
    const { container } = render(<NotePageCanvas markdown="# Kept" />);

    act(() => observers[0]!.callback([{ isIntersecting: true }]));

    expect(observers[0]!.disconnect).toHaveBeenCalled();
    act(() => observers[0]!.callback([{ isIntersecting: false }]));
    expect(container.querySelector('h1')?.textContent).toBe('Kept');
  });
});
