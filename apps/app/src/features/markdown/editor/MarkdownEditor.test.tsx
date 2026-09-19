// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { foldEffect, foldState } from '@codemirror/language';

import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';
import type { ResolveEmbedImage } from './codemirror/embed/embedImageResolution';
import { FoldStateStore } from '@core/application/editor/FoldStateStore';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';

// Many tests below reuse the same `pageId="test-page"` (and often the same
// markdown text) across independent `it()` blocks. Since a restorable
// cached session now unconditionally focuses the editor on mount (see
// docs/editor-architecture-decisions.md's "Focus restoration" entry) — not
// gated by any per-test focus action, just "does a matching entry exist"
// — a session left behind by an earlier test would otherwise silently
// autofocus a later, unrelated test's editor. Cleared before every test,
// matching createEditorView.test.ts's own identical `beforeEach`.
beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver — needed only by the image-overlay tests
// below (Overlay's own useOverlayCenteredPosition), same stub
// Overlay.test.tsx/Dialog.test.tsx already establish for exactly this gap.
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
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

  // Regression test for the page title's Enter key: the body's fresh
  // selection defaults to end-of-document (see "initial cursor position"
  // below), so a bare focus() from the title landed the cursor at the end
  // of existing body content instead of a new line right below the title.
  it('focusAtNewLineAtStart() inserts a blank line at the top and places the cursor there, not at the end of the document', () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { container } = render(
      <MarkdownEditor pageId="test-page" ref={ref} markdown="Existing body content" />
    );
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    // Fresh-open selection starts at the end of the document (see below) —
    // confirm the buggy starting condition before exercising the fix.
    expect(view.state.selection.main.head).toBe(view.state.doc.length);

    ref.current?.focusAtNewLineAtStart();

    expect(view.state.doc.toString()).toBe('\nExisting body content');
    expect(view.state.selection.main.head).toBe(0);
    expect(view.state.selection.main.empty).toBe(true);
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it('focusAtNewLineAtStart() on an empty body still creates a blank line and places the cursor at its start', () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { container } = render(<MarkdownEditor pageId="test-page" ref={ref} markdown="" />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    ref.current?.focusAtNewLineAtStart();

    expect(view.state.doc.toString()).toBe('\n');
    expect(view.state.selection.main.head).toBe(0);
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
      status: 'resolved' as const, icon: 'note' as const, emoji: null,
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
      status: 'resolved' as const, icon: 'note' as const, emoji: null,
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

/**
 * End-to-end coverage for the image-click-opens-overlay correction,
 * through the real component (not an isolated CM6-only harness) — proves
 * `imageLivePreview.ts`'s injected callback is actually wired to
 * `ImageOverlay` here, in `MarkdownEditor.tsx` itself, not just that the
 * callback fires in isolation (already covered by
 * `codemirror/image/imageLivePreview.test.ts`). `ImageOverlay`/`Overlay`
 * portal into `document.body`, not `container` — queries below
 * deliberately use `document.body`, matching how `Overlay.test.tsx`/
 * `Dialog.test.tsx` already query their own portaled content.
 */
/**
 * The rendered `<ImageOverlay>`/Escape-to-close behavior itself now lives
 * entirely at `AppLayout` (the single shared owner every entry point opens
 * through — see resourceOverlay.ts and MarkdownEditor.types.ts's own
 * `onOpenImageOverlay` doc comment); Sidebar.test.tsx's own suite already
 * covers that end-to-end through the real `AppLayout` tree, Escape-closing
 * included. What's specific to *this* entry point, and therefore what
 * belongs here, is the wiring between ImageWidget's click and the
 * `onOpenImageOverlay` callback this editor is handed — asserting the
 * callback fires with the right `ImageOverlayImage`, not that some DOM
 * overlay appears (this component no longer renders one).
 */
describe('MarkdownEditor: image overlay', () => {
  const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

  it('clicking the rendered image calls onOpenImageOverlay with the same url/alt', () => {
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );
    const imageButton = document.querySelector('button.cm-image-button') as HTMLButtonElement;
    expect(imageButton).not.toBeNull();

    expect(onOpenImageOverlay).not.toHaveBeenCalled();

    fireEvent.mouseDown(imageButton);
    fireEvent.click(imageButton);

    expect(onOpenImageOverlay).toHaveBeenCalledTimes(1);
    const [image] = onOpenImageOverlay.mock.calls[0]!;
    expect(image.url).toBe('https://example.com/mountain.jpg');
    expect(image.alt).toBe('Mountain view');
  });

  it('keyboard activation (Enter/Space, as native <button> semantics produce) calls onOpenImageOverlay end-to-end', () => {
    // jsdom doesn't synthesize a `click` from a raw Enter/Space keydown on
    // a real <button> (verified directly against this project's own
    // jsdom/vitest setup — see imageLivePreview.test.ts's "Image
    // accessibility" describe block for the full explanation) — this
    // exercises what that native activation actually produces (a `click`
    // event) through the real component tree, confirming the callback
    // wiring all the way from ImageWidget through MarkdownEditor to
    // onOpenImageOverlay — not just that CM6-level click handling is
    // correct in isolation.
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );
    const imageButton = document.querySelector('button.cm-image-button') as HTMLButtonElement;
    imageButton.focus();

    fireEvent.click(imageButton);

    expect(onOpenImageOverlay).toHaveBeenCalledTimes(1);
    expect(onOpenImageOverlay.mock.calls[0]![0].url).toBe('https://example.com/mountain.jpg');
  });

  it('clicking the size or edit control does not call onOpenImageOverlay', () => {
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );
    const sizeButton = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Image size options"]'
    )!;

    fireEvent.mouseDown(sizeButton);
    fireEvent.click(sizeButton);

    expect(onOpenImageOverlay).not.toHaveBeenCalled();

    const editButton = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Edit source"]'
    )!;
    fireEvent.mouseDown(editButton);
    fireEvent.click(editButton);

    expect(onOpenImageOverlay).not.toHaveBeenCalled();
  });
});

describe('MarkdownEditor: image overlay — resolveImageResource / More Actions', () => {
  const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

  function clickImage() {
    const imageButton = document.querySelector('button.cm-image-button') as HTMLButtonElement;
    fireEvent.mouseDown(imageButton);
    fireEvent.click(imageButton);
  }

  it('calls resolveImageResource with the image url (no copyUrl for a standard image) when the overlay opens', () => {
    const resolveImageResource = vi.fn(() => undefined);
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        resolveImageResource={resolveImageResource}
      />
    );

    clickImage();

    expect(resolveImageResource).toHaveBeenCalledWith('https://example.com/mountain.jpg');
  });

  it('passes the resolved resourceId to onOpenImageOverlay when resolveImageResource resolves a resource — the gate ImageOverlay\'s own More Actions control reads', () => {
    const resolveImageResource = vi.fn(() => ({ resourceId: 'resource-1' }));
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        resolveImageResource={resolveImageResource}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );

    clickImage();

    expect(onOpenImageOverlay.mock.calls[0]![0].resourceId).toBe('resource-1');
  });

  it('omits resourceId when resolveImageResource is absent (default, every existing call site unaffected)', () => {
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );

    clickImage();

    expect(onOpenImageOverlay.mock.calls[0]![0].resourceId).toBeUndefined();
  });

  it('passes an onSetCoverImage option that forwards the same url the inline menu\'s own onSetCoverImage receives', () => {
    const onSetCoverImage = vi.fn();
    const resolveImageResource = vi.fn(() => ({ resourceId: 'resource-1' }));
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${IMAGE_MD}`}
        resolveImageResource={resolveImageResource}
        onSetCoverImage={onSetCoverImage}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );

    clickImage();
    const [, options] = onOpenImageOverlay.mock.calls[0]!;
    options.onSetCoverImage();

    expect(onSetCoverImage).toHaveBeenCalledWith('https://example.com/mountain.jpg');
  });

  it('standard Markdown image, local Vault path: resolveImageResource receives the raw Markdown path (copyUrl), not the resolved file URL — the ImageOverlay More Actions gate works identically to an embed', () => {
    const LOCAL_MD = '![Alt name](Assets/image.jpg)';
    const resolveImageResource = vi.fn(() => ({ resourceId: 'resource-1' }));
    const resolveImageSrc = vi.fn((path: string) =>
      path === 'Assets/image.jpg'
        ? { status: 'resolved' as const, url: 'app://vault/Assets/image.jpg', copyUrl: 'Assets/image.jpg' }
        : { status: 'unresolved' as const }
    );
    const onOpenImageOverlay = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${LOCAL_MD}`}
        resolveImageSrc={resolveImageSrc}
        resolveImageResource={resolveImageResource}
        onOpenImageOverlay={onOpenImageOverlay}
      />
    );

    const imageButton = document.querySelector('button.cm-image-button') as HTMLButtonElement;
    fireEvent.mouseDown(imageButton);
    fireEvent.click(imageButton);

    // The click handler receives (url, alt, copyUrl) — resolveImageResource
    // must be asked about `copyUrl ?? url`, i.e. the raw vault-relative
    // path, never the resolved app:// URL (MarkdownEditor.tsx's own
    // onImageClickRef doc comment).
    expect(resolveImageResource).toHaveBeenCalledWith('Assets/image.jpg');
    const [image] = onOpenImageOverlay.mock.calls[0]!;
    expect(image.resourceId).toBe('resource-1');
    expect(image.url).toBe('app://vault/Assets/image.jpg');
  });
});

/**
 * 2026-09-02 UX baseline, item 9: "Set as cover image" is a capability-
 * gated menu entry point into whatever single cover-writing owner the app
 * layer supplies (`PageHost.tsx`'s existing `PageOperations.updateMetadata`
 * closure in the real app) — this editor never persists anything itself,
 * so what's verified here is exactly the wiring: the prop's presence gates
 * the menu item, and selecting it forwards the image's own URL unchanged.
 */
describe('MarkdownEditor: image options menu — Set as cover image', () => {
  const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

  function openSizeMenu() {
    const sizeButton = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Image size options"]'
    )!;
    fireEvent.mouseDown(sizeButton);
    fireEvent.click(sizeButton);
  }

  function findMenuItem(label: string): HTMLElement | null {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (el) => el.textContent === label
    ) ?? null;
  }

  it('regression: opening the menu never detaches/recreates its own anchor button', () => {
    // Guards the exact bug this mechanism previously had: routing the
    // menu's open/closed state through CM6's imageUiState (diffed by
    // ImageWidget.eq()) made opening the menu recreate the widget's DOM,
    // detaching the very button Overlay was anchored to — the menu then
    // rendered at the viewport's top-left corner instead of near the
    // image. `setImageMenuButtonOpen` (MarkdownEditor.tsx) fixes this by
    // mutating the existing button/container directly; this test asserts
    // that mutation, not a swap, is what happens.
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} />);
    const buttonBeforeOpen = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Image size options"]'
    )!;

    openSizeMenu();

    const buttonAfterOpen = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Image size options"]'
    )!;
    expect(buttonAfterOpen).toBe(buttonBeforeOpen);
    expect(buttonAfterOpen.isConnected).toBe(true);
    expect(buttonAfterOpen.getAttribute('aria-expanded')).toBe('true');
    expect(buttonAfterOpen.classList.contains('cm-media-control--active')).toBe(true);
    expect(
      buttonAfterOpen.closest('.cm-image-container')?.getAttribute('data-menu-open')
    ).toBe('true');
  });

  it('closing the menu clears the button/container open state without touching their identity', () => {
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} />);
    openSizeMenu();
    const button = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Image size options"]'
    )!;

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.querySelector('.cm-media-control[aria-label="Image size options"]')).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.classList.contains('cm-media-control--active')).toBe(false);
    expect(button.closest('.cm-image-container')?.getAttribute('data-menu-open')).toBe('false');
  });

  it('omits the menu item when onSetCoverImage is not supplied', () => {
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} />);
    openSizeMenu();

    expect(findMenuItem('Set as cover image')).toBeNull();
  });

  it('selecting it forwards the image URL to onSetCoverImage and closes the menu', () => {
    const onSetCoverImage = vi.fn();
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} onSetCoverImage={onSetCoverImage} />);
    openSizeMenu();

    const item = findMenuItem('Set as cover image');
    expect(item).not.toBeNull();
    fireEvent.click(item!);

    expect(onSetCoverImage).toHaveBeenCalledWith('https://example.com/mountain.jpg');
    expect(findMenuItem('Set as cover image')).toBeNull();
  });

  it('Remove is labelled "Remove" (not "Delete") and only edits this note\'s own Markdown', () => {
    const onEdit = vi.fn();
    render(<MarkdownEditor pageId="test-page" markdown={`Before\n\n${IMAGE_MD}\n\nAfter`} onEdit={onEdit} />);
    openSizeMenu();

    expect(findMenuItem('Delete')).toBeNull();
    const item = findMenuItem('Remove');
    expect(item).not.toBeNull();
    fireEvent.click(item!);

    expect(onEdit).toHaveBeenCalledWith('Before\n\nAfter');
  });

  it('places Edit source before the size/options button, matching PdfEmbedWidget\'s Expand/Edit source/More actions order', () => {
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} />);

    const controls = document.querySelector('.cm-media-controls')!;
    const buttonLabels = Array.from(controls.querySelectorAll('button')).map((button) =>
      button.getAttribute('aria-label')
    );
    expect(buttonLabels).toEqual(['Edit source', 'Image size options']);
  });

  it('Download is always present, unlike the capability-gated Set as cover image', () => {
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} />);
    openSizeMenu();

    expect(findMenuItem('Download')).not.toBeNull();
  });

  it('selecting Download forwards the image URL to onDownloadImage and closes the menu', () => {
    const onDownloadImage = vi.fn();
    render(<MarkdownEditor pageId="test-page" markdown={IMAGE_MD} onDownloadImage={onDownloadImage} />);
    openSizeMenu();

    const item = findMenuItem('Download');
    expect(item).not.toBeNull();
    fireEvent.click(item!);

    expect(onDownloadImage).toHaveBeenCalledWith('https://example.com/mountain.jpg');
    expect(findMenuItem('Download')).toBeNull();
  });

  it('a local Resource embed forwards its vault-relative copyUrl, not the resolved file URL — same rule as Set as cover image', () => {
    const LOCAL_MD = '![Alt name](Assets/image.jpg)';
    const onDownloadImage = vi.fn();
    const resolveImageSrc = vi.fn((path: string) =>
      path === 'Assets/image.jpg'
        ? { status: 'resolved' as const, url: 'app://vault/Assets/image.jpg', copyUrl: 'Assets/image.jpg' }
        : { status: 'unresolved' as const }
    );
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`See: ${LOCAL_MD}`}
        resolveImageSrc={resolveImageSrc}
        onDownloadImage={onDownloadImage}
      />
    );
    openSizeMenu();

    fireEvent.click(findMenuItem('Download')!);

    expect(onDownloadImage).toHaveBeenCalledWith('Assets/image.jpg');
  });
});

/**
 * Regression coverage for a real crash: `RangeError: Position N is out
 * of range for changeset of length M`, thrown from `imageUiStateField`'s
 * `update()` (`value.map(tr.changes)`) on the transaction *after* a
 * Fit/Fill mode toggle. Root cause: `handleSelectImageDisplayMode`
 * (MarkdownEditor.tsx) dispatched `setImageUiState`'s `pos`/`to` using
 * `imageMenu.pos`/`imageMenu.to` — positions resolved against `view.state`
 * *before* the dispatch — directly, in the same transaction as `changes`
 * that rewrite the image's own `|width,alignment,mode` pipe segment.
 * `imageUiStateField.update()` inserts an effect's `pos`/`to` straight
 * into `next` (already `value.map(tr.changes)` — *post*-change
 * coordinates) with no mapping of its own, so a pre-change `to` silently
 * corrupted the stored `RangeSet` entry whenever the rewrite changed the
 * segment's length (near-guaranteed: `fit`/`fill` differ in character
 * count, and adding/removing the segment is a bigger delta) — not
 * throwing immediately, but on the *next* transaction that maps the
 * field's `RangeSet`, once the stale position fell outside that later
 * changeset's own recorded length. Fixed by mapping `imageMenu.pos`/
 * `imageMenu.to` through `view.state.changes(changes)` before building
 * the effect, so both positions land in the same post-change coordinate
 * space the field's own `update()` already assumes.
 */
describe('MarkdownEditor: Fit/Fill toggle never corrupts imageUiState position mapping', () => {
  function openSizeMenu() {
    const sizeButton = document.querySelector<HTMLButtonElement>(
      '.cm-media-control[aria-label="Image size options"]'
    )!;
    fireEvent.mouseDown(sizeButton);
    fireEvent.click(sizeButton);
  }

  function findMenuItem(label: string): HTMLElement | null {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (el) => el.textContent === label
    ) ?? null;
  }

  /** Reopens the size menu (it closes on every selection) and clicks the given mode's item — the exact click sequence `handleSelectImageDisplayMode` fires from. */
  function selectMode(label: 'Fit' | 'Fill'): void {
    openSizeMenu();
    const item = findMenuItem(label);
    if (!item) {
      throw new Error(`menu item not found: ${label}`);
    }
    fireEvent.click(item);
  }

  function getContainer(): HTMLElement {
    const container = document.querySelector<HTMLElement>('.cm-image-container');
    if (!container) throw new Error('image container not found');
    return container;
  }

  // Deliberately no trailing content *after* the image in most fixtures
  // below (only leading text, so the image is not at position 0) — this
  // is exactly the shape that reproduces the crash reliably rather than
  // "intermittently." A stale pre-change `to` stored by a *shrinking*
  // toggle only exceeds the document's real length once mapped through a
  // later transaction if there isn't enough trailing content past the
  // image to absorb the discrepancy; with generous trailing text (e.g. a
  // full paragraph after the image), the same underlying bug silently
  // stores a *wrong* position without ever exceeding bounds, so it never
  // throws — which is the actual reason this bug reads as "intermittent"
  // rather than "always." Confirmed directly: a scratch repro with a
  // trailing paragraph never threw across repeated toggles; removing the
  // trailing paragraph reproduced `RangeError: Position 59 is out of
  // range for changeset of length 55` on the very next transaction after
  // exactly one grow-then-shrink pair, matching the reported shape
  // ("Position 209... length 207") precisely.
  it('URL image, not at position 0, nothing after it: Fit → Fill → Fit → Fill never throws, and every step persists the correct mode', () => {
    const { container: root } = render(
      <MarkdownEditor
        pageId="test-page"
        markdown={'Some text before.\n\n![Mountain view](https://example.com/mountain.jpg)'}
      />
    );
    const view = EditorView.findFromDOM(root as unknown as HTMLElement)!;

    for (const label of ['Fit', 'Fill', 'Fit', 'Fill'] as const) {
      expect(() => selectMode(label)).not.toThrow();

      const token = label.toLowerCase();
      if (token === 'fill') {
        // Fill is the default mode — a default-only change removes the
        // pipe segment entirely (`serializeImagePresentationTokens`), so
        // "fill" itself never appears literally in the Markdown.
        expect(view.state.doc.toString()).not.toContain('|fit');
        expect(view.state.doc.toString()).not.toContain('|fill');
      } else {
        expect(view.state.doc.toString()).toContain(`|${token}`);
      }
      expect(view.state.doc.toString()).toContain('Some text before.');
      expect(getContainer().classList.contains(`cm-image-container--${token}`)).toBe(true);
      expect(getContainer().classList.contains('cm-invalid-embed')).toBe(false);
    }
  });

  it('URL image, WITH generous trailing content: Fit → Fill → Fit → Fill still never throws (the same fix covers both shapes, not just the reliably-reproducing one)', () => {
    const { container: root } = render(
      <MarkdownEditor
        pageId="test-page"
        markdown={'Some text before.\n\n![Mountain view](https://example.com/mountain.jpg)\n\nSome text after.'}
      />
    );
    const view = EditorView.findFromDOM(root as unknown as HTMLElement)!;

    for (const label of ['Fit', 'Fill', 'Fit', 'Fill'] as const) {
      expect(() => selectMode(label)).not.toThrow();
      expect(view.state.doc.toString()).toContain('Some text before.');
      expect(view.state.doc.toString()).toContain('Some text after.');
    }
  });

  it('URL image: width and alignment metadata survive repeated Fit/Fill toggles untouched', () => {
    const { container: root } = render(
      <MarkdownEditor
        pageId="test-page"
        markdown={'Prefix text.\n\n![Photo|320,center](https://example.com/a.jpg)'}
      />
    );
    const view = EditorView.findFromDOM(root as unknown as HTMLElement)!;

    selectMode('Fit');
    expect(view.state.doc.toString()).toContain('320,center,fit');
    selectMode('Fill');
    expect(view.state.doc.toString()).toContain('320,center');
    expect(view.state.doc.toString()).not.toContain('fit');
    selectMode('Fit');
    expect(view.state.doc.toString()).toContain('320,center,fit');
  });

  it('local asset embed (![[image.png]]), not at position 0, nothing after it: Fit → Fill → Fit → Fill never throws, and every step persists the correct mode', () => {
    const resolveEmbedImage: ResolveEmbedImage = (path) =>
      path === 'image.png'
        ? { status: 'image', url: 'app://vault/image.png', copyUrl: 'image.png', alt: 'image.png' }
        : { status: 'unresolved', alt: path };

    const { container: root } = render(
      <MarkdownEditor
        pageId="test-page"
        markdown={'Some text before.\n\n![[image.png]]'}
        resolveEmbedImage={resolveEmbedImage}
      />
    );
    const view = EditorView.findFromDOM(root as unknown as HTMLElement)!;

    for (const label of ['Fit', 'Fill', 'Fit', 'Fill'] as const) {
      expect(() => selectMode(label)).not.toThrow();

      const token = label.toLowerCase();
      if (token === 'fill') {
        expect(view.state.doc.toString()).toBe('Some text before.\n\n![[image.png]]');
      } else {
        expect(view.state.doc.toString()).toContain(`image.png|${token}`);
      }
      expect(getContainer().classList.contains(`cm-image-container--${token}`)).toBe(true);
      expect(getContainer().classList.contains('cm-invalid-embed')).toBe(false);
    }
  });

  it('repeated toggling leaves imageUiState queryable and consistent — a subsequent unrelated edit elsewhere in the document (which also maps the field\'s RangeSet) never throws either', () => {
    const { container: root } = render(
      <MarkdownEditor
        pageId="test-page"
        markdown={'Some text before.\n\n![Mountain view](https://example.com/mountain.jpg)'}
      />
    );
    const view = EditorView.findFromDOM(root as unknown as HTMLElement)!;

    selectMode('Fit');
    selectMode('Fill');
    selectMode('Fit');

    // An entirely unrelated transaction elsewhere in the document also
    // calls `imageUiStateField`'s own `value.map(tr.changes)` — this is
    // exactly the call that threw in the original bug report, once a
    // prior toggle had already stored a stale, unmapped position.
    expect(() => {
      view.dispatch({ changes: { from: 0, insert: 'X' } });
    }).not.toThrow();

    expect(view.state.doc.toString().startsWith('XSome text before.')).toBe(true);
    expect(getContainer().classList.contains('cm-image-container--fit')).toBe(true);
  });
});

/**
 * "Broken / Invalid Image UX" (2026-09-02 UX baseline), end-to-end through
 * the real component tree (CM6-level coverage already lives in
 * imageLivePreview.test.ts's own "Broken image fallback" block).
 */
describe('MarkdownEditor: broken image fallback', () => {
  const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

  // ImageWidget.renderWorking() (2026-09 native-broken-icon fix) probes a
  // URL with a detached, never-inserted Image() before ever creating the
  // real, visible <img> — see ImageWidget.ts's own probeThenMount doc
  // comment. jsdom never fires a real Image's load/error on its own (no
  // network), so without resolving this probe first there is no <img> here
  // to fire the *second*, real `error` event on below. Same capture-and-
  // auto-resolve mechanism imageLivePreview.test.ts's own mountView()
  // already establishes at the CM6 level; mirrored here since this suite
  // renders through the full MarkdownEditor/React tree instead.
  let capturedProbes: HTMLImageElement[] = [];
  let OriginalImage: typeof Image;

  beforeEach(() => {
    capturedProbes = [];
    OriginalImage = window.Image;
    class CapturingImage extends OriginalImage {
      constructor(width?: number, height?: number) {
        super(width, height);
        capturedProbes.push(this);
      }
    }
    vi.stubGlobal('Image', CapturingImage);
  });

  afterEach(() => {
    vi.stubGlobal('Image', OriginalImage);
  });

  function renderWithLoadedImage(markdown: string) {
    const result = render(<MarkdownEditor pageId="test-page" markdown={markdown} />);
    for (const probe of capturedProbes) {
      probe.dispatchEvent(new Event('load'));
    }
    return result;
  }

  it('renders the broken representation in place of the <img> once it errors, with a trimmed controls set', () => {
    renderWithLoadedImage(IMAGE_MD);

    const img = document.querySelector('img.tok-image')!;
    fireEvent.error(img);

    expect(document.querySelector('img.tok-image')).toBeNull();
    expect(document.querySelector('button.cm-image-button')).toBeNull();
    const broken = document.querySelector('.cm-invalid-embed__content');
    expect(broken).not.toBeNull();
    expect(broken?.querySelector('.cm-invalid-embed__title')?.textContent).toBe('Unable to load');
    expect(broken?.querySelector('.cm-invalid-embed__source')?.textContent).toBe(
      'https://example.com/mountain.jpg'
    );

    expect(document.querySelector('.cm-invalid-embed__control[aria-label="Edit source"]')).not.toBeNull();
    expect(document.querySelector('.cm-invalid-embed__control[aria-label="Remove image"]')).not.toBeNull();
    expect(document.querySelector('.cm-media-control[aria-label="Image size options"]')).toBeNull();
  });

  it('Remove works from the broken state and supports undo', () => {
    renderWithLoadedImage(IMAGE_MD);
    fireEvent.error(document.querySelector('img.tok-image')!);

    const deleteButton = document.querySelector<HTMLButtonElement>(
      '.cm-invalid-embed__control[aria-label="Remove image"]'
    )!;
    fireEvent.mouseDown(deleteButton);
    fireEvent.click(deleteButton);

    expect(document.querySelector('.cm-invalid-embed__content')).toBeNull();
  });
});

/**
 * Regression coverage for ADR-033's full wiring: MarkdownEditor's mount
 * effect reading `foldStateStore.get(pageId)` into `restoreFoldJSON`, and
 * its unmount cleanup writing `foldStateStore.set(pageId, ...)` — the
 * integration point between `createEditorView.test.ts`'s CM6-level
 * coverage and `FoldStateStore.test.ts`'s storage-level coverage.
 */
describe('MarkdownEditor: fold-state persistence (ADR-033)', () => {
  function foldedRangesIn(container: HTMLElement): Array<{ from: number; to: number }> {
    const dom = container.querySelector<HTMLElement>('.cm-editor')!;
    const view = EditorView.findFromDOM(dom)!;
    const ranges: Array<{ from: number; to: number }> = [];
    view.state.field(foldState).between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });
    return ranges;
  }

  function foldFirstRegion(container: HTMLElement, from: number, to: number): void {
    const dom = container.querySelector<HTMLElement>('.cm-editor')!;
    const view = EditorView.findFromDOM(dom)!;
    view.dispatch({ effects: [foldEffect.of({ from, to })] });
  }

  /** Lets FoldStateStore's fire-and-forget persistence write complete. */
  async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('fold -> unmount/remount (editor destroy/recreate, same pageId) -> fold is restored', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const foldStateStore = await FoldStateStore.load(fileSystem, '/vault');
    const markdown = '# Section A\ncontent\n# Section B\nmore content';

    const first = render(
      <MarkdownEditor pageId="note-a" markdown={markdown} foldStateStore={foldStateStore} />
    );
    foldFirstRegion(first.container, 0, 11);
    first.unmount();
    await flushMicrotasks();

    const second = render(
      <MarkdownEditor pageId="note-a" markdown={markdown} foldStateStore={foldStateStore} />
    );

    expect(foldedRangesIn(second.container)).toEqual([{ from: 0, to: 11 }]);
  });

  it('fold -> persist -> simulate app restart (fresh FoldStateStore.load over the same filesystem) -> reopen note -> fold is restored', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await FoldStateStore.load(fileSystem, '/vault');
    const markdown = '# Section A\ncontent';

    const first = render(
      <MarkdownEditor pageId="note-a" markdown={markdown} foldStateStore={beforeRestart} />
    );
    foldFirstRegion(first.container, 0, 11);
    first.unmount();
    await flushMicrotasks();

    // A genuinely fresh store, loaded from whatever was written to disk —
    // the same call Application.bootstrap() makes on a real app restart.
    const afterRestart = await FoldStateStore.load(fileSystem, '/vault');
    const reopened = render(
      <MarkdownEditor pageId="note-a" markdown={markdown} foldStateStore={afterRestart} />
    );

    expect(foldedRangesIn(reopened.container)).toEqual([{ from: 0, to: 11 }]);
  });

  it('multiple folded regions restore correctly', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const foldStateStore = await FoldStateStore.load(fileSystem, '/vault');
    const markdown = '# Section A\ncontent\n# Section B\nmore content';

    const first = render(
      <MarkdownEditor pageId="note-a" markdown={markdown} foldStateStore={foldStateStore} />
    );
    const dom = first.container.querySelector<HTMLElement>('.cm-editor')!;
    const view = EditorView.findFromDOM(dom)!;
    view.dispatch({
      effects: [foldEffect.of({ from: 0, to: 11 }), foldEffect.of({ from: 20, to: 31 })],
    });
    first.unmount();
    await flushMicrotasks();

    const second = render(
      <MarkdownEditor pageId="note-a" markdown={markdown} foldStateStore={foldStateStore} />
    );

    expect(foldedRangesIn(second.container)).toEqual([
      { from: 0, to: 11 },
      { from: 20, to: 31 },
    ]);
  });

  it('different notes maintain independent fold states', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const foldStateStore = await FoldStateStore.load(fileSystem, '/vault');
    const markdownA = '# Note A heading\ncontent A';
    const markdownB = '# Note B heading\ncontent B';

    const noteA = render(
      <MarkdownEditor pageId="note-a" markdown={markdownA} foldStateStore={foldStateStore} />
    );
    foldFirstRegion(noteA.container, 0, 16);
    noteA.unmount();
    await flushMicrotasks();

    // Note B is opened and closed without ever being folded.
    const noteB = render(
      <MarkdownEditor pageId="note-b" markdown={markdownB} foldStateStore={foldStateStore} />
    );
    noteB.unmount();
    await flushMicrotasks();

    const reopenedA = render(
      <MarkdownEditor pageId="note-a" markdown={markdownA} foldStateStore={foldStateStore} />
    );
    const reopenedB = render(
      <MarkdownEditor pageId="note-b" markdown={markdownB} foldStateStore={foldStateStore} />
    );

    expect(foldedRangesIn(reopenedA.container)).toEqual([{ from: 0, to: 16 }]);
    expect(foldedRangesIn(reopenedB.container)).toEqual([]);
  });

  it('a note with no persisted fold state starts unfolded', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const foldStateStore = await FoldStateStore.load(fileSystem, '/vault');

    const { container } = render(
      <MarkdownEditor
        pageId="never-folded"
        markdown="# Heading\ncontent"
        foldStateStore={foldStateStore}
      />
    );

    expect(foldedRangesIn(container)).toEqual([]);
  });

  it('changed document content does not incorrectly restore a stale fold position', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const foldStateStore = await FoldStateStore.load(fileSystem, '/vault');
    const originalMarkdown = '# Section A\ncontent';

    const first = render(
      <MarkdownEditor pageId="note-a" markdown={originalMarkdown} foldStateStore={foldStateStore} />
    );
    foldFirstRegion(first.container, 0, 11);
    first.unmount();
    await flushMicrotasks();

    // Content changed externally (e.g. a task toggle, or an edit made
    // while this note was closed) before it was reopened.
    const changedMarkdown = 'Something entirely different now\ncontent';
    const second = render(
      <MarkdownEditor pageId="note-a" markdown={changedMarkdown} foldStateStore={foldStateStore} />
    );

    expect(foldedRangesIn(second.container)).toEqual([]);
  });
});
