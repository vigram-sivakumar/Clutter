// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { historyField } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  createReferencePreviewExtensions,
  ReferencePreview,
} from './ReferencePreview';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const extensions = createReferencePreviewExtensions(() => ({}));
const viewOf = (root: ParentNode = document, index = 0): EditorView =>
  EditorView.findFromDOM(
    root.querySelectorAll<HTMLElement>('.cm-content')[index]!
  )!;

describe('ReferencePreview', () => {
  it("mounts inside .markdown__editor so the editor's own CSS applies", () => {
    render(
      <ReferencePreview markdown="Hello **world**" extensions={extensions} />
    );

    expect(
      document.querySelector('.reference-preview.markdown__editor .cm-editor')
    ).not.toBeNull();
  });

  it('is the entry body element itself, not a wrapper inside one', () => {
    render(<ReferencePreview markdown="Hello" extensions={extensions} />);

    expect(document.querySelector('.reference-preview')).toHaveClass(
      'reference-entry__body'
    );
  });

  it("renders through the editor pipeline: inline styles come out as the editor's own tok-* classes", () => {
    render(
      <ReferencePreview
        markdown="Some **bold** and *italic* and ==marked== text"
        extensions={extensions}
      />
    );

    const content = document.querySelector('.cm-content')!;

    expect(content.querySelector('.tok-strong')?.textContent).toBe('bold');
    expect(content.querySelector('.tok-emphasis')?.textContent).toBe('italic');
    expect(content.querySelector('.tok-highlight')?.textContent).toBe('marked');
  });

  it('is permanently read-only: not editable, and a document change is dropped', () => {
    render(<ReferencePreview markdown="Original" extensions={extensions} />);

    const content = document.querySelector('.cm-content')!;
    const view = viewOf();

    expect(content).toHaveAttribute('contenteditable', 'false');
    expect(content).toHaveAttribute('aria-readonly', 'true');
    expect(view.state.readOnly).toBe(true);

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'Changed' },
    });

    expect(view.state.doc.toString()).toBe('Original');
  });

  it('has no history and no folding, so nothing is kept per view and no fold toggle is drawn', () => {
    render(
      <ReferencePreview
        markdown={'# Heading\n\ntext'}
        extensions={extensions}
      />
    );

    expect(
      document.querySelector('.cm-fold-toggle, [class*="fold-toggle"]')
    ).toBeNull();
    expect(viewOf().state.field(historyField, false)).toBeUndefined();
  });

  it('adds no tab stop and no text-box semantics: its text belongs to the entry around it', () => {
    render(<ReferencePreview markdown="One\n\nTwo" extensions={extensions} />);

    const root = document.querySelector('.reference-preview')!;
    const tabbable = [
      ...root.querySelectorAll<HTMLElement>('[tabindex]'),
    ].filter((element) => element.tabIndex >= 0);

    expect(tabbable).toEqual([]);
    expect(root.querySelector('.cm-content')).toHaveAttribute(
      'role',
      'presentation'
    );
    expect(root.querySelector('[role="textbox"]')).toBeNull();
  });

  it("takes the editor's own buttons (a code block's Copy) out of the tab order, now and as the view updates", async () => {
    const { rerender } = render(
      <ReferencePreview
        markdown={'```ts\nconst a = 1;\n```'}
        extensions={extensions}
      />
    );
    const root = document.querySelector('.reference-preview')!;
    const tabbable = () =>
      [...root.querySelectorAll<HTMLElement>('button, [tabindex]')].filter(
        (el) => el.tabIndex >= 0
      );

    expect(root.querySelector('button')).not.toBeNull();
    expect(tabbable()).toEqual([]);

    rerender(
      <ReferencePreview
        markdown={'```js\nlet b = 2;\n```\n\n```ts\nconst c = 3;\n```'}
        extensions={extensions}
      />
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelectorAll('button').length).toBeGreaterThan(1);
    expect(tabbable()).toEqual([]);
  });

  it('bounds embed nesting: an embed in a preview renders, but what that embed embeds does not (no unbounded views)', async () => {
    const notes: Record<string, string> = {
      A: 'inside A ![[B]]',
      B: 'inside B ![[C]]',
      C: 'inside C ![[A]]',
    };
    const resolvePageEmbed = (path: string) => ({
      status: 'resolved' as const,
      pageId: path,
      title: path,
      markdown: notes[path] ?? '',
      icon: 'note' as const,
      emoji: null,
    });
    const shared = createReferencePreviewExtensions(() => ({
      resolvePageEmbed,
      // Page targets: the image and PDF resolvers decline first, as they do in production.
      resolveEmbedImage: () => ({ status: 'unresolved', alt: '' }),
      resolveEmbedPdf: () => ({ status: 'non-pdf' }),
    }));

    render(<ReferencePreview markdown={'Start ![[A]]'} extensions={shared} />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const root = document.querySelector('.reference-preview')!;

    // The preview itself, plus exactly one nested view for ![[A]]; ![[B]] inside A is refused, not rendered.
    expect(root.querySelectorAll('.cm-editor')).toHaveLength(2);
    expect(root.textContent).toContain('inside A');
    expect(root.textContent).not.toContain('inside B');
  });

  it("applies the editor's completed-task styling to a completed task, and recreates the view when that changes", () => {
    const { rerender } = render(
      <ReferencePreview
        markdown="finished"
        extensions={extensions}
        isCompleted
      />
    );

    expect(document.querySelector('.cm-content')).toHaveClass(
      'cm-task-completed'
    );

    const before = viewOf();
    rerender(
      <ReferencePreview
        markdown="finished"
        extensions={extensions}
        isCompleted={false}
      />
    );

    expect(document.querySelector('.cm-content')).not.toHaveClass(
      'cm-task-completed'
    );
    expect(viewOf()).not.toBe(before);
  });

  it('applies a changed document to the live view instead of rebuilding it', () => {
    const { rerender } = render(
      <ReferencePreview markdown="First text" extensions={extensions} />
    );
    const view = viewOf();

    rerender(
      <ReferencePreview
        markdown="Second text, **updated**"
        extensions={extensions}
      />
    );

    expect(viewOf()).toBe(view);
    expect(view.state.doc.toString()).toBe('Second text, **updated**');
    expect(document.querySelector('.tok-strong')?.textContent).toBe('updated');
  });

  it('does nothing when unrelated props re-render it', () => {
    const create = vi.spyOn(EditorView.prototype, 'destroy');
    const { rerender } = render(
      <ReferencePreview markdown="Stable" extensions={extensions} />
    );
    const view = viewOf();

    rerender(<ReferencePreview markdown="Stable" extensions={extensions} />);
    rerender(<ReferencePreview markdown="Stable" extensions={extensions} />);

    expect(viewOf()).toBe(view);
    expect(create).not.toHaveBeenCalled();
  });

  it('destroys its view on unmount', () => {
    const destroy = vi.spyOn(EditorView.prototype, 'destroy');
    const { unmount } = render(
      <ReferencePreview markdown="Bye" extensions={extensions} />
    );

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.cm-editor')).toBeNull();
  });

  it('shares one extension list across views without sharing any state between them', () => {
    render(
      <>
        <ReferencePreview markdown="Alpha" extensions={extensions} />
        <ReferencePreview markdown="Beta" extensions={extensions} />
      </>
    );

    const first = viewOf(document, 0);
    const second = viewOf(document, 1);

    expect(first).not.toBe(second);

    // An external update to one never reaches the other, and neither view's selection follows the other's.
    first.dispatch({ selection: { anchor: 2 } });
    expect(second.state.selection.main.head).toBe('Beta'.length);

    render(
      <ReferencePreview markdown="Alpha, changed" extensions={extensions} />
    );
    expect(second.state.doc.toString()).toBe('Beta');
  });

  it('builds its extension list without calling the resolvers until something renders', () => {
    const getContext = vi.fn(() => ({}));

    createReferencePreviewExtensions(getContext);

    expect(getContext).not.toHaveBeenCalled();
  });
});

describe('Reference.css preview rules', () => {
  const css = readFileSync(join(__dirname, 'Reference.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );
  const rule =
    css.match(/\.reference-preview\.markdown__editor\s*\{([^}]*)\}/)?.[1] ?? '';

  it('makes the preview inert, so every click lands on the entry around it', () => {
    expect(rule).toMatch(/pointer-events\s*:\s*none/);
  });

  it('undoes the page-column layout .markdown__editor brings, and clips the height', () => {
    expect(rule).toMatch(/flex\s*:\s*1/);
    expect(rule).toMatch(/min-width\s*:\s*0/);
    expect(rule).toMatch(/max-width\s*:\s*none/);
    expect(rule).toMatch(/max-height\s*:/);
    expect(rule).toMatch(/overflow\s*:\s*hidden/);
  });

  it('never puts a margin on an editor line or the preview (CLAUDE.md hard rule)', () => {
    expect(css).not.toMatch(/\.cm-line[^{]*\{[^}]*margin/);
    expect(rule).not.toMatch(/margin/);
  });
});
