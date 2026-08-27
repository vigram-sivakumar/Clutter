// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

afterEach(() => {
  cleanup();
});

describe('MarkdownEditor imperative focus handle', () => {
  it('lets a caller focus the editor via ref', () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { container } = render(<MarkdownEditor pageId="test-page" ref={ref} markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(document.activeElement).not.toBe(editor);

    ref.current?.focus();

    expect(document.activeElement).toBe(editor);
  });
});

describe('MarkdownEditor: DOM sync from the markdown prop', () => {
  it('syncs the DOM to the markdown prop on initial render', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(editor.textContent).toBe('Hello');
  });

  it('syncs an external markdown prop change into the DOM while unfocused', () => {
    const { container, rerender } = render(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;
    expect(document.activeElement).not.toBe(editor);

    rerender(<MarkdownEditor pageId="test-page" markdown="Changed externally" />);

    expect(editor.textContent).toBe('Changed externally');
  });

  it('does NOT overwrite the DOM from a markdown prop change while the editor has focus', () => {
    const { container, rerender } = render(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;
    editor.focus();
    expect(document.activeElement).toBe(editor);

    // Simulate the editor's own in-progress typing that hasn't round-tripped
    // back through the markdown prop yet.
    editor.textContent = 'Hello, mid-edit';

    // A stale/round-tripped prop update arrives (e.g. this editor's own
    // earlier commit re-rendering) — must not clobber in-progress typing.
    rerender(<MarkdownEditor pageId="test-page" markdown="Hello" />);

    expect(editor.textContent).toBe('Hello, mid-edit');
  });

  it('resumes syncing from the prop once focus leaves the editor', () => {
    const { container, rerender } = render(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;
    editor.focus();
    editor.textContent = 'Mid-edit';
    rerender(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    expect(editor.textContent).toBe('Mid-edit');

    // jsdom's fireEvent.blur only dispatches the event, it doesn't move
    // document.activeElement the way a real browser's focus change would —
    // .blur() is what actually clears activeElement here, which is the
    // condition the component's effect checks.
    editor.blur();
    rerender(<MarkdownEditor pageId="test-page" markdown="Reconciled value" />);

    expect(editor.textContent).toBe('Reconciled value');
  });
});

describe('MarkdownEditor: initial cursor position', () => {
  it('places the cursor at the end of the document on open, not position 0', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello, world" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('reflects the end-of-document cursor once focused via the imperative handle', () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { container } = render(<MarkdownEditor pageId="test-page" ref={ref} markdown="Hello, world" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    ref.current?.focus();

    expect(document.activeElement).toBe(view.contentDOM);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it('does not fight a subsequent user selection — a later click/selection change is preserved', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello, world" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    view.dispatch({ selection: { anchor: 0 } });

    expect(view.state.selection.main.head).toBe(0);
  });
});

describe('MarkdownEditor: onEdit (per-keystroke commit)', () => {
  // CM6 owns its own model and does not read arbitrary DOM mutations via a
  // generic native 'input' event the way the previous contentEditable +
  // React onInput implementation did — confirmed empirically: mutating
  // .cm-content's textContent and firing a synthetic InputEvent (including
  // 'beforeinput' with inputType/data set) never reaches CM6's update
  // listener under jsdom. Driving a real transaction via view.dispatch is
  // CM6's actual, documented mechanism for state changes, and is exactly
  // what a genuine keystroke becomes internally regardless of how it was
  // produced — so these tests exercise that mechanism directly via
  // EditorView.findFromDOM, a public CM6 lookup API, rather than faking a
  // browser input event jsdom can't fully emulate for a CM6 editor.
  it('calls onEdit with the current content on every document-changing transaction', () => {
    const onEdit = vi.fn();
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello" onEdit={onEdit} />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    view.dispatch({ changes: { from: 5, insert: ', edited' } });

    expect(onEdit).toHaveBeenCalledWith('Hello, edited');
  });

  it('calls onEdit again for a second change, unconditionally (no local diffing)', () => {
    const onEdit = vi.fn();
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="" onEdit={onEdit} />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    view.dispatch({ changes: { from: 0, insert: 'H' } });
    view.dispatch({ changes: { from: 1, insert: 'e' } });

    expect(onEdit).toHaveBeenNthCalledWith(1, 'H');
    expect(onEdit).toHaveBeenNthCalledWith(2, 'He');
  });

  it('does not throw when onEdit is not provided', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    expect(() => view.dispatch({ changes: { from: 5, insert: '!' } })).not.toThrow();
  });
});

describe('MarkdownEditor: onFlush (blur — a payload-free save request)', () => {
  it('calls onFlush with no arguments on blur', () => {
    const onFlush = vi.fn();
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello" onFlush={onFlush} />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    fireEvent.blur(editor);

    expect(onFlush).toHaveBeenCalledWith();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does not call onEdit on blur — blur is a persistence event only, never a mutation event', () => {
    const onEdit = vi.fn();
    const onFlush = vi.fn();
    const { container } = render(
      <MarkdownEditor pageId="test-page" markdown="Hello" onEdit={onEdit} onFlush={onFlush} />
    );
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    editor.textContent = 'Edited';
    fireEvent.blur(editor);

    expect(onEdit).not.toHaveBeenCalled();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onFlush is not provided', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(() => fireEvent.blur(editor)).not.toThrow();
  });
});

describe('MarkdownEditor: resolveWikiLink (§5 boundary, §6 decoration wiring)', () => {
  it('renders without throwing when resolveWikiLink is provided', () => {
    const resolveWikiLink = vi.fn(() => ({
      status: 'resolved' as const,
      displayLabel: 'x',
      activate: vi.fn(),
    }));

    expect(() =>
      render(<MarkdownEditor pageId="test-page" markdown="[[Page]]" resolveWikiLink={resolveWikiLink} />)
    ).not.toThrow();
  });

  it('renders without throwing when resolveWikiLink is not provided, even with WikiLink syntax present', () => {
    expect(() => render(<MarkdownEditor pageId="test-page" markdown="[[Page]]" />)).not.toThrow();
  });

  it('calls resolveWikiLink for a WikiLink present in the initial markdown (§6 — decoration layer now consumes it)', () => {
    // Surrounded by leading and trailing text deliberately: the editor's
    // own mount selection lands a zero-width caret at doc.length (end of
    // document — see createEditorView.ts), which the engagement rule
    // ("selection strictly within the node's range, including exactly at
    // either boundary") correctly treats as engaged if the WikiLink itself
    // ends at doc.length — the resolver is never called for an engaged
    // node, since engaged tokens render as plain text. Trailing (and
    // leading) text keeps the mount caret away from both of the
    // WikiLink's boundaries, so this test stays about resolver wiring,
    // not that (real, separately-tested) boundary behavior.
    const resolveWikiLink = vi.fn(() => ({
      status: 'resolved' as const,
      displayLabel: 'x',
      activate: vi.fn(),
    }));
    render(<MarkdownEditor pageId="test-page" markdown="See [[Page]] here" resolveWikiLink={resolveWikiLink} />);

    expect(resolveWikiLink).toHaveBeenCalledWith('Page', null);
  });

  // Decoration correctness beyond this thin integration check — resolved
  // vs. fallback display labels, engaged/at-rest transitions, atomicRanges
  // — is covered in codemirror/wikilink/wikiLinkDecorations.test.ts, not
  // duplicated here.
});

describe('MarkdownEditor: no duplicate same-class decoration wrapping (same-range regression guard)', () => {
  // Regression guard for a real, previously-confirmed failure mode: two
  // independently-registered decoration sources targeting the same syntax
  // node range produce nested duplicate wrappers instead of one correctly
  // composed element — confirmed once already for headings (see
  // docs/editor-architecture-decisions.md's "Heading content classing
  // moved into the shared decoration source"), where two sources each
  // emitting `tok-heading1` on the same range rendered as
  // `<span class="tok-heading1"><span class="tok-heading1">...`.
  //
  // This exercises the actual production extension set assembled in
  // MarkdownEditor.tsx (not an isolated single-extension harness), so it
  // fails if *any* future change to that wiring — re-enabling a currently
  // commented-out extension, or adding a new one — reintroduces a second
  // independent source classing one of these six ranges, regardless of
  // that source's name. Each construct is padded with leading/trailing
  // text so the default end-of-document mount caret (see
  // createEditorView.ts) never lands inside it and renders it engaged
  // (raw source, no classing at all) instead of at rest.
  //
  // The assertion is deliberately about the *observable DOM contract* —
  // a class must not wrap another element carrying that same class — not
  // about which extension produced it.
  function expectNoSelfNestedClass(view: EditorView, className: string) {
    const matches = view.dom.querySelectorAll(`.${className}`);
    expect(matches.length).toBeGreaterThan(0);
    matches.forEach((el) => {
      expect(el.querySelector(`.${className}`)).toBeNull();
    });
  }

  it('Emphasis (*text*): tok-emphasis does not wrap another tok-emphasis', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="before *italic* after" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expectNoSelfNestedClass(view, 'tok-emphasis');
  });

  it('StrongEmphasis (**text**): tok-strong does not wrap another tok-strong', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="before **bold** after" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expectNoSelfNestedClass(view, 'tok-strong');
  });

  it('Strikethrough (~~text~~): tok-strike does not wrap another tok-strike', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="before ~~struck~~ after" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expectNoSelfNestedClass(view, 'tok-strike');
  });

  it('InlineCode (`text`): tok-code does not wrap another tok-code', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="before `code` after" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expectNoSelfNestedClass(view, 'tok-code');
  });

  it('Highlight (==text==): tok-highlight does not wrap another tok-highlight', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown="before ==marked== after" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expectNoSelfNestedClass(view, 'tok-highlight');
  });

  it('ATX heading (# text): tok-heading1 does not wrap another tok-heading1', () => {
    const { container } = render(<MarkdownEditor pageId="test-page" markdown={'# Heading\n\nafter'} />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expectNoSelfNestedClass(view, 'tok-heading1');
  });
});
