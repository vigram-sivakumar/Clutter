// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { foldable, foldEffect, foldState, forceParsing } from '@codemirror/language';

import { markdownLanguageExtension } from '../markdownLanguage';
import { embedLivePreview } from './embedLivePreview';
import type { ResolveEmbedImage } from './embedImageResolution';
import type { ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import type { PageEmbedResolution, ResolvePageEmbed } from '../../../render/blocks/pageEmbedResolution';
import type { NoteEmbedAncestry } from './noteEmbedAncestry';
import { embedFolderPath, NoteEmbedWidget, trimEmptyEdgeLines, type OnOpenNoteEmbedMenu, type FoldStatePersistence } from './NoteEmbedWidget';
import { editorRevealHighlight, setRevealHighlight } from '../highlight/editorRevealHighlight';

/** Every fixture here targets a page (never a real Vault resource) — both resolvers always decline, matching real production wiring. */
const declineImage: ResolveEmbedImage = () => ({ status: 'unresolved', alt: '' });
const declinePdf: ResolveEmbedPdf = () => ({ status: 'non-pdf' });

function mountView(
  doc: string,
  resolvePageEmbed: ResolvePageEmbed,
  options: {
    onOpenPage?: (pageId: string, heading?: string) => void;
    onOpenNoteEmbedMenu?: OnOpenNoteEmbedMenu;
    ancestry?: NoteEmbedAncestry;
    getFoldStateStore?: () => FoldStatePersistence | undefined;
    hostPageId?: string;
    extensions?: Extension[];
  } = {}
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      markdownLanguageExtension(),
      ...(options.extensions ?? []),
      embedLivePreview({
        hostPageId: options.hostPageId ?? 'test-host-page',
        resolveEmbedImage: () => declineImage,
        onImageClick: () => undefined,
        onOpenImageMenu: () => undefined,
        resolveEmbedPdf: () => declinePdf,
        onPdfEmbedClick: () => undefined,
        onOpenPdfMenu: () => undefined,
        resolvePageEmbed: () => resolvePageEmbed,
        onOpenPage: () => options.onOpenPage,
        onOpenNoteEmbedMenu: () => options.onOpenNoteEmbedMenu,
        ancestry: options.ancestry,
        getFoldStateStore: options.getFoldStateStore,
      }),
    ],
  });
  return new EditorView({ state, parent });
}

/**
 * A minimal, real `FoldStatePersistence` implementation — a plain
 * `Map<pageId, entry>`, the same shape `FoldStateStore`'s own in-memory
 * map already is (`core/application/editor/FoldStateStore.ts`). Tests
 * below construct one directly rather than importing the concrete
 * `FoldStateStore` class, matching this module's own boundary rule (no
 * `core/application` import inside `codemirror/embed/`).
 */
function createInMemoryFoldStatePersistence(): FoldStatePersistence {
  const entries = new Map<string, { readonly doc: string; readonly fold: readonly number[] }>();
  const embedCollapse = new Map<string, Map<string, boolean>>();
  return {
    get: (pageId) => entries.get(pageId),
    set: (pageId, entry) => entries.set(pageId, entry),
    getEmbedCollapse: (hostPageId, embeddedPageId) => embedCollapse.get(hostPageId)?.get(embeddedPageId),
    setEmbedCollapse: (hostPageId, embeddedPageId, collapsed) => {
      let hostMap = embedCollapse.get(hostPageId);
      if (!hostMap) {
        hostMap = new Map();
        embedCollapse.set(hostPageId, hostMap);
      }
      hostMap.set(embeddedPageId, collapsed);
    },
  };
}

function resolverFor(pages: Record<string, PageEmbedResolution>): ResolvePageEmbed {
  return (path) => pages[path] ?? { status: 'unresolved', displayLabel: path };
}

describe('note embeds (embedLivePreview + NoteEmbedWidget)', () => {
  beforeEach(() => {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a resolved page target as a note embed card with the source note title and its content', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: '# Heading\n\nBody text.', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed');
    expect(card).not.toBeNull();
    // The title is plain, non-interactive text — never a button, never
    // clickable, no navigation behavior of its own.
    const title = card?.querySelector('.cm-note-embed__title');
    expect(title?.textContent).toBe('Other Note');
    expect(title?.tagName).toBe('SPAN');
    // Rendered through a real nested EditorView, not a hand-built DOM copy
    // — the embedded note's own content lives inside `.cm-content`.
    expect(card?.querySelector('.cm-content')?.textContent).toContain('Body text.');
  });

  it("shows the note's folder path beside the title, without the note's own name, in the header's title-and-path group", () => {
    const view = mountView(
      '![[Projects/Weekly/Other Note]]',
      resolverFor({
        'Projects/Weekly/Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      })
    );

    const header = view.dom.querySelector('.cm-note-embed__header')!;
    const group = header.querySelector('.cm-note-embed__text')!;
    const title = group.querySelector('.cm-note-embed__title');
    const path = group.querySelector<HTMLElement>('.cm-note-embed__path');
    expect(title?.textContent).toBe('Other Note');
    expect(path?.textContent).toBe('Projects/Weekly');
    expect(path?.tagName).toBe('SPAN');
    // The path follows the title in the same group, and the controls stay a sibling of the group, at the row's end.
    expect(title?.nextElementSibling).toBe(path);
    expect(group.nextElementSibling).toBe(header.querySelector('.cm-note-embed__controls'));
    // Full text is available when it is truncated.
    expect(path?.title).toBe('Projects/Weekly');
  });

  it('shows no path when the target has no folder: the title already says the note', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      })
    );

    const group = view.dom.querySelector('.cm-note-embed__text')!;
    expect(group.querySelector('.cm-note-embed__title')?.textContent).toBe('Other Note');
    expect(group.querySelector('.cm-note-embed__path')).toBeNull();
  });

  it('a heading target shows the folder of its note, not the heading', () => {
    const view = mountView(
      '![[Notes/Other Note#Details]]',
      resolverFor({
        'Notes/Other Note#Details': { status: 'resolved', pageId: 'page-other', title: 'Other Note › Details', markdown: 'Body.', icon: 'note', emoji: null },
      })
    );

    expect(view.dom.querySelector('.cm-note-embed__title')?.textContent).toBe('Other Note › Details');
    expect(view.dom.querySelector('.cm-note-embed__path')?.textContent).toBe('Notes');
  });

  it('the path has no handler of its own: a click on it is a click on the card, opening the note once', () => {
    const onOpenPage = vi.fn();
    const view = mountView(
      '![[Folder/Other Note]]',
      resolverFor({
        'Folder/Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      }),
      { onOpenPage }
    );

    view.dom.querySelector<HTMLElement>('.cm-note-embed__path')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenPage.mock.calls).toEqual([['page-other']]);
  });

  it('a nested embed shows its own folder path in its own header too', () => {
    const view = mountView(
      '![[Top/Outer]]',
      resolverFor({
        'Top/Outer': { status: 'resolved', pageId: 'outer', title: 'Outer', markdown: '![[Deep/Down/Inner]]', icon: 'note', emoji: null },
        'Deep/Down/Inner': { status: 'resolved', pageId: 'inner', title: 'Inner', markdown: 'Inner body.', icon: 'note', emoji: null },
      })
    );

    const paths = [...view.dom.querySelectorAll('.cm-note-embed__path')].map((el) => el.textContent);
    expect(paths).toEqual(['Top', 'Deep/Down']);
  });

  it('the title has no handler of its own: a click on it is a click on the card, opening the note once', () => {
    const onOpenPage = vi.fn();
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      }),
      { onOpenPage }
    );

    const title = view.dom.querySelector<HTMLElement>('.cm-note-embed__title')!;
    title.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenPage.mock.calls).toEqual([['page-other']]);
  });

  it('Expand opens the source note via the existing page-navigation mechanism', () => {
    const onOpenPage = vi.fn();
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      }),
      { onOpenPage }
    );

    const expandButton = view.dom.querySelector<HTMLButtonElement>('.cm-note-embed [aria-label="Expand"]');
    expect(expandButton).not.toBeNull();
    expandButton?.click();

    expect(onOpenPage).toHaveBeenCalledWith('page-other');
  });

  describe('opening the source of an embed that names a heading', () => {
    const resolved = (title: string) => ({ status: 'resolved' as const, pageId: 'page-other', title, markdown: 'Body.', icon: 'note' as const, emoji: null });

    it.each([
      ['![[Other Note#Decisions]]', 'Other Note#Decisions', ['page-other', 'Decisions']],
      ['![[Other Note# Decisions |x]]', 'Other Note# Decisions ', ['page-other', 'Decisions']],
      ['![[Other Note]]', 'Other Note', ['page-other']],
      ['![[Other Note#^decision-1]]', 'Other Note#^decision-1', ['page-other']],
    ])('%s: Expand and the content boundary both open the source with %j', (doc, target, expected) => {
      const onOpenPage = vi.fn();
      const view = mountView(doc, resolverFor({ [target]: resolved('Other Note') }), { onOpenPage });

      view.dom.querySelector<HTMLButtonElement>('.cm-note-embed [aria-label="Expand"]')!.click();
      view.dom.querySelector<HTMLElement>('.cm-note-embed__content')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

      expect(onOpenPage.mock.calls).toEqual([expected, expected]);
    });
  });

  describe('the embed is a clickable card', () => {
    const mount = (onOpenPage: (pageId: string, heading?: string) => void) =>
      mountView('![[Other Note]]', resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body #tag', icon: 'note', emoji: null },
      }), { onOpenPage });
    const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    it('a click anywhere on the card opens the source note once: wrapper, header, title, content, editor, text', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);
      const card = view.dom.querySelector<HTMLElement>('.cm-note-embed')!;

      for (const selector of [null, '.cm-note-embed__header', '.cm-note-embed__title', '.cm-note-embed__content', '.cm-editor', '.cm-content', '.cm-line']) {
        onOpenPage.mockClear();
        click(selector === null ? card : card.querySelector(selector)!);
        expect(onOpenPage).toHaveBeenCalledTimes(1);
        expect(onOpenPage).toHaveBeenCalledWith('page-other');
      }
    });

    it('header buttons keep their own behavior: Edit source, More actions and the caret do not open the note; Expand opens it once', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);
      const button = (label: string) =>
        view.dom.querySelector<HTMLButtonElement>(`.cm-note-embed__header [aria-label="${label}"]`)!;

      for (const label of ['Edit source', 'More actions', 'Collapse note']) {
        click(button(label));
      }
      expect(onOpenPage).not.toHaveBeenCalled();

      click(button('Expand'));
      expect(onOpenPage.mock.calls).toEqual([['page-other']]);
    });

    it('links and inputs inside the document keep their own behavior and do not open the note', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);
      const line = view.dom.querySelector<HTMLElement>('.cm-note-embed .cm-line')!;

      for (const tag of ['a', 'input']) {
        const element = document.createElement(tag);
        line.appendChild(element);
        click(element);
      }

      expect(onOpenPage).not.toHaveBeenCalled();
    });

    it('semantic tokens (link, WikiLink, tag, date) act on mousedown and keep their own behavior: a click on one does not navigate', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);
      const line = view.dom.querySelector<HTMLElement>('.cm-note-embed .cm-line')!;

      for (const token of ['tok-link', 'tok-wikilink', 'tok-tag', 'tok-date']) {
        const span = document.createElement('span');
        span.className = token;
        line.appendChild(span);
        click(span);
      }

      expect(onOpenPage).not.toHaveBeenCalled();
    });

    it('a media block inside the document (an image, a PDF) keeps its own behavior and does not navigate the card', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);
      const line = view.dom.querySelector<HTMLElement>('.cm-note-embed .cm-line')!;
      const media = document.createElement('div');
      media.className = 'cm-media-block';
      line.appendChild(media);

      click(media);

      expect(onOpenPage).not.toHaveBeenCalled();
    });

    it('a click that ends a text selection does not navigate', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);
      const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Bod' } as Selection);

      click(view.dom.querySelector('.cm-note-embed .cm-line')!);
      selection.mockRestore();

      expect(onOpenPage).not.toHaveBeenCalled();
    });

    it('a collapsed card still navigates', () => {
      const onOpenPage = vi.fn();
      const view = mount(onOpenPage);

      click(view.dom.querySelector('.cm-fold-toggle')!);
      expect(view.dom.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
      expect(onOpenPage).not.toHaveBeenCalled();

      click(view.dom.querySelector('.cm-note-embed')!);
      expect(onOpenPage).toHaveBeenCalledTimes(1);
      expect(onOpenPage).toHaveBeenCalledWith('page-other');
    });

    it('the pointer cursor covers the card, its editor and its text lines', () => {
      const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const rules = [...css.matchAll(/([^{}]+)\{([^}]*cursor\s*:\s*(\w+)[^}]*)\}/g)].map((m) => [m[1]!.replace(/\s+/g, ' ').trim(), m[3]!]);

      expect(rules).toEqual([['.cm-note-embed, .cm-note-embed .cm-editor, .cm-note-embed .cm-line', 'pointer']]);
    });
  });

  it('Edit source reveals the raw ![[Note]] Markdown alongside the rendered card, and Hide source collapses it again', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      })
    );

    expect(view.dom.textContent).not.toContain('![[Other Note]]');

    const editButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-note-embed [aria-label="Edit source"]'
    )!;
    editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.textContent).toContain('![[Other Note]]');
    expect(view.dom.querySelector('.cm-note-embed')).not.toBeNull();

    const hideButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-note-embed [aria-label="Hide source"]'
    )!;
    expect(hideButton).not.toBeNull();
    hideButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.textContent).not.toContain('![[Other Note]]');
  });

  it('More actions invokes the injected callback with this button as the anchor and the embed’s own node position', () => {
    const onOpenNoteEmbedMenu = vi.fn();
    const view = mountView(
      'x ![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body.', icon: 'note', emoji: null },
      }),
      { onOpenNoteEmbedMenu }
    );

    const moreActionsButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-note-embed [aria-label="More actions"]'
    );
    expect(moreActionsButton).not.toBeNull();
    moreActionsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenNoteEmbedMenu).toHaveBeenCalledWith({ anchor: moreActionsButton, pos: 2, to: 17 });
  });

  it('a click inside a nested embed opens only the nested note, never the outer one', () => {
    const onOpenPage = vi.fn();
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: 'Inner body.', icon: 'note', emoji: null },
      }),
      { onOpenPage }
    );
    const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const inner = view.dom.querySelector<HTMLElement>('.cm-note-embed__content .cm-note-embed')!;

    // The nested card's wrapper and its own text each open the nested note once.
    for (const target of [inner, inner.querySelector('.cm-line')!]) {
      onOpenPage.mockClear();
      click(target);
      expect(onOpenPage.mock.calls).toEqual([['page-inner']]);
    }

    // A click on the outer card (outside the nested one) opens the outer note.
    onOpenPage.mockClear();
    click(view.dom.querySelector('.cm-note-embed')!);
    expect(onOpenPage.mock.calls).toEqual([['page-outer']]);

    const innerExpand = inner.querySelector<HTMLButtonElement>('[aria-label="Expand"]')!;
    onOpenPage.mockClear();
    innerExpand.click();
    expect(onOpenPage.mock.calls).toEqual([['page-inner']]);
  });

  it('nested inside another read-only note embed: Edit source and More actions carry the read-only mutating marker, Expand does not', () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: 'Inner body.', icon: 'note', emoji: null },
      })
    );

    const outerCard = view.dom.querySelector('.cm-note-embed')!;
    const innerCard = outerCard.querySelector('.cm-note-embed')!;
    expect(innerCard).not.toBeNull();

    const expandButton = innerCard.querySelector('[aria-label="Expand"]')!;
    const editButton = innerCard.querySelector('[aria-label="Edit source"]')!;
    const moreActionsButton = innerCard.querySelector('[aria-label="More actions"]')!;

    expect(expandButton.classList.contains('cm-note-embed-control--mutating')).toBe(false);
    expect(editButton.classList.contains('cm-note-embed-control--mutating')).toBe(true);
    expect(moreActionsButton.classList.contains('cm-note-embed-control--mutating')).toBe(true);

    // The mutating marker is only meaningful because the nested view's own
    // `.cm-content` really is `contenteditable="false"` — the same
    // attribute `MarkdownEditor.css`'s shared rule keys the actual hiding
    // off (see that rule's own doc comment); confirming both together is
    // what proves this nested embed's Edit source/More actions are
    // actually hidden, not just marked.
    const innerContent = innerCard.querySelector('.cm-content');
    expect(innerContent?.getAttribute('contenteditable')).toBe('false');
  });

  it('never renders an editable embed — the nested view is permanently read-only', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Original content.', icon: 'note', emoji: null },
      })
    );

    const nestedContent = view.dom.querySelector<HTMLElement>('.cm-note-embed .cm-content');
    expect(nestedContent?.getAttribute('contenteditable')).toBe('false');

    // Reach into the nested view directly (CM6 exposes it via the DOM
    // node) and confirm a doc-changing transaction is actually blocked,
    // not merely hidden from the mouse/keyboard.
    const nestedEditorDom = view.dom.querySelector('.cm-note-embed .cm-editor');
    const nestedView = nestedEditorDom ? EditorView.findFromDOM(nestedEditorDom as HTMLElement) : null;
    expect(nestedView).not.toBeNull();
    nestedView?.dispatch({ changes: { from: 0, to: 0, insert: 'x' } });
    expect(nestedView?.state.doc.toString()).toBe('Original content.');
  });

  it('does not render a note embed for a direct self-embed — caught by ancestry, falls back to the shared broken-embed card (NoteEmbedWidget\'s own renderBroken, not the working header/nested-view structure)', () => {
    const view = mountView(
      '![[This Note]]',
      resolverFor({
        'This Note': { status: 'resolved', pageId: 'page-self', title: 'This Note', markdown: '![[This Note]]', icon: 'note', emoji: null },
      }),
      { ancestry: { ancestryPageIds: new Set(['page-self']), depth: 0 } }
    );

    // `.cm-note-embed` itself is never present on a broken embed — only
    // NoteEmbedWidget's own working-state branch adds it (see
    // `invalidEmbedCard.ts`'s own doc comment for why the shared broken
    // card never claims a type-specific container identity).
    expect(view.dom.querySelector('.cm-note-embed')).toBeNull();
    expect(view.dom.querySelector('.cm-note-embed__header')).toBeNull();
    expect(view.dom.querySelector('.cm-invalid-embed')).not.toBeNull();
  });

  it('never reveals raw Markdown syntax when the nested view\'s own selection lands inside a construct', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': {
          status: 'resolved',
          pageId: 'page-other',
          title: 'Other Note',
          markdown: '# Heading\n\nSome **bold** text.',
          icon: 'note', emoji: null,
        },
      })
    );

    const nestedEditorDom = view.dom.querySelector('.cm-note-embed .cm-editor');
    const nestedView = nestedEditorDom ? EditorView.findFromDOM(nestedEditorDom as HTMLElement) : null;
    expect(nestedView).not.toBeNull();
    if (!nestedView) {
      return;
    }

    // At rest: the heading's `# ` marker and the bold word's `**` markers
    // are both collapsed (Decoration.replace) — neither raw marker
    // appears in the rendered text.
    expect(nestedView.dom.textContent).not.toContain('# Heading');
    expect(nestedView.dom.textContent).not.toContain('**bold**');

    // A click landing inside "bold" would dispatch exactly this kind of
    // selection-only transaction against the nested view's own state —
    // confirmed in the prior investigation that this happens even though
    // DOM focus never moves into the nested view. Simulate it directly.
    const boldFrom = nestedView.state.doc.toString().indexOf('bold');
    nestedView.dispatch({ selection: { anchor: boldFrom + 2 } });

    // Still never reveals — `isTokenEngaged`'s `state.readOnly` guard
    // means this nested, permanently read-only view can never enter an
    // engaged/revealed state, regardless of where its selection sits.
    expect(nestedView.dom.textContent).not.toContain('**bold**');

    // Same check for the heading marker, engaging its own line.
    const headingFrom = nestedView.state.doc.toString().indexOf('Heading');
    nestedView.dispatch({ selection: { anchor: headingFrom } });
    expect(nestedView.dom.textContent).not.toContain('# Heading');
  });

  it('does not render a note embed once an indirect cycle is detected deeper in the chain', () => {
    const resolvePageEmbed = resolverFor({
      'Note B': { status: 'resolved', pageId: 'page-b', title: 'Note B', markdown: '![[Note A]]', icon: 'note', emoji: null },
      'Note A': { status: 'resolved', pageId: 'page-a', title: 'Note A', markdown: '![[Note B]]', icon: 'note', emoji: null },
    });

    const view = mountView('![[Note B]]', resolvePageEmbed);

    // Top-level embed (B) renders fine — the cycle is one level deeper.
    const topCard = view.dom.querySelector('.cm-note-embed');
    expect(topCard).not.toBeNull();

    // Inside B's own nested view, embedding A back in renders fine too
    // (A hasn't been seen yet)...
    const nestedCard = topCard?.querySelector('.cm-note-embed') ?? null;
    expect(nestedCard).not.toBeNull();

    // ...but A's own attempt to re-embed B is the cycle, caught and
    // rendered as a broken embed instead of recursing forever. `cycleCard`
    // (the note-embed B-again, nested inside A) is found via
    // `.cm-invalid-embed`, not `.cm-note-embed` — NoteEmbedWidget's own
    // broken state never carries the latter at all (the shared
    // `renderInvalidEmbedCard` component never claims a type-specific
    // container identity; see `invalidEmbedCard.ts`'s own doc comment).
    const cycleCard = nestedCard?.querySelector('.cm-invalid-embed') ?? null;
    expect(cycleCard).not.toBeNull();
    expect(cycleCard?.classList.contains('cm-note-embed')).toBe(false);
    expect(cycleCard?.querySelector('.cm-note-embed__header')).toBeNull();
    expect(cycleCard?.querySelector('.cm-editor')).toBeNull();
  });
});

/**
 * Regression coverage for a real, confirmed misclassification bug:
 * `![[statue.pngs]]` (a typo'd image extension) used to fall all the way
 * through `embedLivePreview.ts`'s own image → PDF → page resolution chain
 * unclassified, landing on "Note not found" simply because every other
 * resolver happened to decline it — a *failed resolution* was silently
 * deciding the *type*. `embedTargetKind.ts`'s own doc comment has the full
 * account; these tests establish the deterministic classification rule
 * directly, target by target, with every resolver wired to decline (the
 * worst case for misclassification — nothing "helps" by actually
 * resolving anything).
 *
 * Unlike `mountView` above (whose image/PDF resolvers are always the
 * fixed `declineImage`/`declinePdf` constants), these tests need a real,
 * extension-aware PDF resolver stub for the `.pdf` case — mounted
 * directly rather than reusing that shared helper.
 */
describe('embed target classification — extension decides type, never a failed resolution', () => {
  function mountClassificationView(doc: string, resolveEmbedPdf: ResolveEmbedPdf = declinePdf): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      extensions: [
        history(),
        markdownLanguageExtension(),
        embedLivePreview({
          hostPageId: 'test-host-page',
          resolveEmbedImage: () => declineImage,
          onImageClick: () => undefined,
          onOpenImageMenu: () => undefined,
          resolveEmbedPdf: () => resolveEmbedPdf,
          onPdfEmbedClick: () => undefined,
          onOpenPdfMenu: () => undefined,
          resolvePageEmbed: () => resolverFor({}),
          onOpenPage: () => undefined,
          onOpenNoteEmbedMenu: () => undefined,
        }),
      ],
    });
    return new EditorView({ state, parent });
  }

  it('![[statue.png]] (recognized image extension, file missing): renders a broken Image, never a Note', () => {
    const view = mountClassificationView('![[statue.png]]');

    const card = view.dom.querySelector('.cm-invalid-embed');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('cm-note-embed')).toBe(false);
    expect(view.dom.querySelector('.cm-invalid-embed__title')?.textContent).toBe('Unable to load');
    expect(view.dom.querySelector('.cm-invalid-embed__source')?.textContent).toBe('statue.png');
  });

  it('![[statue.pngs]] (malformed/unrecognized extension): renders the generic unsupported-file card, never a Note or an Image', () => {
    const view = mountClassificationView('![[statue.pngs]]');

    const card = view.dom.querySelector('.cm-invalid-embed');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('cm-note-embed')).toBe(false);
    expect(card?.classList.contains('cm-image-container')).toBe(false);
    expect(view.dom.querySelector('.cm-invalid-embed__title')?.textContent).toBe('Unsupported file');
    expect(view.dom.querySelector('.cm-invalid-embed__source')?.textContent).toBe('statue.pngs');
  });

  it('![[notes.docx]] (a real, well-known extension this editor still doesn\'t render): also the generic unsupported-file card, not a Note', () => {
    const view = mountClassificationView('![[notes.docx]]');

    expect(view.dom.querySelector('.cm-invalid-embed__title')?.textContent).toBe('Unsupported file');
    expect(view.dom.querySelector('.cm-note-embed')).toBeNull();
  });

  it('![[Missing Note]] (no extension at all): the only shape resolved as a page — renders "Note not found"', () => {
    const view = mountClassificationView('![[Missing Note]]');

    const card = view.dom.querySelector('.cm-invalid-embed');
    expect(card).not.toBeNull();
    expect(view.dom.querySelector('.cm-invalid-embed__title')?.textContent).toBe('Note not found');
    expect(view.dom.querySelector('.cm-invalid-embed__source')?.textContent).toBe('Missing Note');
  });

  it('![[missing.pdf]] (recognized PDF extension, file missing) still classifies as PDF even with resolvePageEmbed wired in — PDF\'s own extension fallback runs before page resolution is ever consulted', () => {
    const pdfAware: ResolveEmbedPdf = (path) =>
      path === 'missing.pdf' ? { status: 'unresolved', title: 'missing' } : { status: 'non-pdf' };
    const view = mountClassificationView('![[missing.pdf]]', pdfAware);

    const card = view.dom.querySelector('.cm-invalid-embed');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('cm-note-embed')).toBe(false);
    expect(view.dom.querySelector('.cm-invalid-embed__title')?.textContent).toBe('Unable to load');
    expect(view.dom.querySelector('.cm-invalid-embed__source')?.textContent).toBe('missing.pdf');
  });
});

describe('trimEmptyEdgeLines — display-only leading/trailing blank-line trim', () => {
  it('strips leading blank/whitespace-only lines', () => {
    expect(trimEmptyEdgeLines('\n\n  \nHello\nWorld')).toBe('Hello\nWorld');
  });

  it('strips trailing blank/whitespace-only lines', () => {
    expect(trimEmptyEdgeLines('Hello\nWorld\n  \n\n')).toBe('Hello\nWorld');
  });

  it('strips both edges at once, a real "100 blank lines before and after" shape', () => {
    const padding = Array.from({ length: 100 }, () => '').join('\n');
    expect(trimEmptyEdgeLines(`${padding}\nHello\nWorld\n${padding}`)).toBe('Hello\nWorld');
  });

  it('never touches blank lines between real content', () => {
    expect(trimEmptyEdgeLines('\nFirst\n\n\nSecond\n')).toBe('First\n\n\nSecond');
  });

  it('a fully blank/whitespace-only document trims to an empty string', () => {
    expect(trimEmptyEdgeLines('\n  \n\t\n')).toBe('');
  });

  it('a document with no leading/trailing blank lines is returned unchanged', () => {
    expect(trimEmptyEdgeLines('First\n\nSecond')).toBe('First\n\nSecond');
  });

  it('treats a whitespace-only line (spaces/tabs, no newline content) as blank, not as real content', () => {
    expect(trimEmptyEdgeLines('   \nHello\n\t\t')).toBe('Hello');
  });
});

describe('note embed rendering trims leading/trailing blank lines, never internal ones, without touching the source document', () => {
  it('the nested view never renders leading/trailing blank lines the source note has', () => {
    const view = mountView(
      '![[Padded Note]]',
      resolverFor({
        'Padded Note': {
          status: 'resolved',
          pageId: 'page-padded',
          title: 'Padded Note',
          markdown: '\n\n\nFirst line\n\nSecond line\n\n\n',
          icon: 'note', emoji: null,
        },
      })
    );

    const nestedEditorDom = view.dom.querySelector('.cm-note-embed .cm-editor');
    const nestedView = nestedEditorDom ? EditorView.findFromDOM(nestedEditorDom as HTMLElement) : null;
    expect(nestedView).not.toBeNull();

    // Trimmed at both edges, but the blank line *between* the two real
    // lines survives untouched.
    expect(nestedView?.state.doc.toString()).toBe('First line\n\nSecond line');
  });

  it('trims at every nesting depth automatically, with no depth-specific logic — a note embedded inside a note embedded inside a note', () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: {
          status: 'resolved',
          pageId: 'page-outer',
          title: 'Outer',
          markdown: '\n\nOuter first\n\n![[Inner]]\n\nOuter last\n\n',
          icon: 'note', emoji: null,
        },
        Inner: {
          status: 'resolved',
          pageId: 'page-inner',
          title: 'Inner',
          markdown: '\n\n\nInner content\n\n\n',
          icon: 'note', emoji: null,
        },
      })
    );

    const outerEditorDom = view.dom.querySelector('.cm-note-embed .cm-editor');
    const outerNestedView = outerEditorDom ? EditorView.findFromDOM(outerEditorDom as HTMLElement) : null;
    expect(outerNestedView).not.toBeNull();
    expect(outerNestedView?.state.doc.toString()).toBe('Outer first\n\n![[Inner]]\n\nOuter last');

    const innerEditorDom = outerNestedView?.dom.querySelector('.cm-note-embed .cm-editor') ?? null;
    const innerNestedView = innerEditorDom ? EditorView.findFromDOM(innerEditorDom as HTMLElement) : null;
    expect(innerNestedView).not.toBeNull();
    expect(innerNestedView?.state.doc.toString()).toBe('Inner content');
  });

  it('never mutates the resolved page\'s own source markdown — the trim is a rendering-only transform', () => {
    const sourceMarkdown = '\n\nUntouched\n\n';
    const resolution: PageEmbedResolution = {
      status: 'resolved',
      pageId: 'page-source',
      title: 'Source Note',
      markdown: sourceMarkdown,
      icon: 'note', emoji: null,
    };
    mountView('![[Source Note]]', resolverFor({ 'Source Note': resolution }));

    // The resolution object handed in by the resolver is never mutated —
    // the widget only ever reads `resolution.markdown` to derive a
    // trimmed *copy* for the nested view's own `doc`.
    expect(resolution.markdown).toBe(sourceMarkdown);
  });
});

describe('the embedded document has no fold toggles; the header caret is the only collapse control', () => {
  const doc = '![[Other Note]]';
  const resolve = (markdown: string) =>
    resolverFor({
      'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown, icon: 'note', emoji: null },
    });

  /** A fold toggle sitting directly in a document line: where the fold decorations are placed. */
  const foldToggleInDocument = (container: ParentNode) => container.querySelector('.cm-note-embed__content .cm-line > .cm-fold-toggle');

  it('hides document fold toggles by a rule scoped to toggles that are direct children of a line', () => {
    const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(css).toMatch(/\.cm-note-embed__content \.cm-line > \.cm-fold-toggle\s*\{\s*display\s*:\s*none/);
  });

  it('the rule hits the heading\'s fold toggle but never the header caret, which is not a direct child of a line', () => {
    const view = mountView(doc, resolve('# Heading\n\nBody'));
    const card = view.dom.querySelector<HTMLElement>('.cm-note-embed')!;
    forceParsing(EditorView.findFromDOM(card.querySelector<HTMLElement>('.cm-note-embed__content > .cm-editor')!)!);

    expect(foldToggleInDocument(card)).not.toBeNull();
    const caret = card.querySelector<HTMLElement>('.cm-note-embed__header > .cm-fold-toggle')!;
    expect(caret).not.toBeNull();
    expect(caret.matches('.cm-note-embed__content .cm-line > .cm-fold-toggle')).toBe(false);
  });

  it('a nested embed\'s own header caret is still not matched by the rule', () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: 'Inner body.', icon: 'note', emoji: null },
      })
    );
    const innerCaret = view.dom.querySelector<HTMLElement>('.cm-note-embed__content .cm-note-embed__header > .cm-fold-toggle')!;

    expect(innerCaret).not.toBeNull();
    expect(innerCaret.matches('.cm-note-embed__content .cm-line > .cm-fold-toggle')).toBe(false);
  });

  it('the header caret still collapses and expands the whole embed', () => {
    const view = mountView(doc, resolve('# Heading\n\nBody'));
    const card = view.dom.querySelector<HTMLElement>('.cm-note-embed')!;
    const caret = card.querySelector<HTMLElement>('.cm-note-embed__header > .cm-fold-toggle')!;
    const content = card.querySelector<HTMLElement>('.cm-note-embed__content')!;

    caret.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(content.hidden).toBe(true);
    caret.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(content.hidden).toBe(false);
  });

  it('the heading still renders normally', () => {
    const view = mountView(doc, resolve('# Heading\n\nBody'));

    expect(view.dom.querySelector('.cm-note-embed__content')!.textContent).toContain('Heading');
  });

  it('does not restore the source note\'s saved folds into the embed', () => {
    const get = vi.fn(() => ({ doc: '# Heading\n\nBody', fold: [9, 15] }));
    const view = mountView(doc, resolve('# Heading\n\nBody'), {
      getFoldStateStore: () => ({ ...createInMemoryFoldStatePersistence(), get }),
    });
    const nested = EditorView.findFromDOM(view.dom.querySelector<HTMLElement>('.cm-note-embed__content > .cm-editor')!)!;
    forceParsing(nested);

    expect(get).not.toHaveBeenCalled();
    expect(nested.state.field(foldState).size).toBe(0);
  });

  it('never overwrites the source note\'s saved folds when the embed is destroyed', () => {
    const store = createInMemoryFoldStatePersistence();
    const set = vi.spyOn(store, 'set');
    const view = mountView(doc, resolve('# Heading\n\nBody'), { getFoldStateStore: () => store });

    view.destroy();

    expect(set).not.toHaveBeenCalled();
  });
});

describe("a note embed's own extra content indent applies only when it's nested inside another note embed, never at the top level", () => {
  // jsdom applies no real CSS from imported stylesheets — reading the rule
  // text directly, the same convention `imageLivePreview.test.ts`'s own
  // CSS tripwires already establish for this codebase, rather than a
  // `getComputedStyle` check that would silently pass against jsdom's own
  // unstyled defaults regardless of what the real rule says.
  it("the .cm-note-embed__content base rule carries the content inset for every embed; the .cm-content[contenteditable='false'] rule only resets it for a nested embed", () => {
    const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8');
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const bareMatch = cssWithoutComments.match(/^\.cm-note-embed__content\s*\{([^}]*)\}/m);
    expect(bareMatch, 'bare .cm-note-embed__content rule not found').not.toBeNull();
    expect(bareMatch![1]).toMatch(/padding-inline-start\s*:/);

    const match = cssWithoutComments.match(
      /\.cm-content\[contenteditable='false'\]\s+\.cm-note-embed__content\s*\{([^}]*)\}/
    );
    expect(match, "scoped .cm-content[contenteditable='false'] .cm-note-embed__content rule not found").not.toBeNull();
    expect(match![1]).toMatch(/padding\s*:\s*0/);
  });

  it("a top-level embed's own .cm-note-embed__content never matches that scoped selector — it has no [contenteditable='false'] ancestor, only the main document's own editable .cm-content", () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body', icon: 'note', emoji: null },
      })
    );

    const content = view.dom.querySelector<HTMLElement>('.cm-note-embed__content')!;
    expect(content.closest("[contenteditable='false']")).toBeNull();
  });

  it("a note embedded inside another note embed's own content does have a [contenteditable='false'] ancestor — the outer embed's own top-level content does not", () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: 'Inner body', icon: 'note', emoji: null },
      })
    );

    const outerCard = view.dom.querySelector('.cm-note-embed')!;
    const outerContent = outerCard.querySelector<HTMLElement>(':scope > .cm-note-embed__content')!;
    expect(outerContent.closest("[contenteditable='false']")).toBeNull();

    const innerCard = outerCard.querySelector('.cm-note-embed')!;
    const innerContent = innerCard.querySelector<HTMLElement>('.cm-note-embed__content')!;
    expect(innerContent.closest("[contenteditable='false']")).not.toBeNull();
  });
});

describe('hover presentation stays separate from collapsed/expanded title typography (regression: hover jitter)', () => {
  // jsdom applies no real CSS — same rule-text convention the padding-left
  // tripwire above already establishes. The font-size transition on the
  // outer `.cm-media-block.cm-note-embed` container was dead weight (that
  // element never itself carries a `font-size` declaration — only
  // `.cm-note-embed__title` does, for its own collapsed/expanded sizing)
  // and, because `:hover` re-triggers a style recalc on this element (it's
  // the anchor for `:hover::before`/`:hover .cm-note-embed__controls`/
  // `:hover .cm-fold-toggle`), declaring `transition: font-size` here made
  // every hover pay for a font-size re-evaluation it never needed —
  // observed as icon/title jitter. Only the title's own transition, scoped
  // to itself, should exist.
  it('the outer .cm-media-block.cm-note-embed rule never transitions font-size', () => {
    const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8');
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const outerMatch = cssWithoutComments.match(/\.cm-media-block\.cm-note-embed\s*\{([^}]*)\}/);
    expect(outerMatch, '.cm-media-block.cm-note-embed rule not found').not.toBeNull();
    expect(outerMatch![1]).not.toMatch(/transition\s*:[^;]*font-size/);
  });

  it("only .cm-note-embed__title transitions font-size, for its own collapsed/expanded sizing", () => {
    const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8');
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const titleMatch = cssWithoutComments.match(/(?:^|\s)\.cm-note-embed__title\s*\{([^}]*)\}/);
    expect(titleMatch, '.cm-note-embed__title rule not found').not.toBeNull();
    expect(titleMatch![1]).toMatch(/transition\s*:[^;]*font-size/);
  });

  // `.cm-note-embed__controls` fades in a *group* of three buttons on
  // hover — animating `opacity` on an element with overlapping/stacked
  // descendants forces the browser to composite that whole subtree as one
  // layer for the transition's duration. That layer sits directly against
  // `.cm-note-embed__title`'s right edge (only the header's own `gap`
  // between them); recompositing that shared boundary every animation
  // frame is the same "layer squeezed against unpromoted content" jitter
  // `::before` had, just relocated to the controls row. Dropping the
  // transition (an instant show/hide) removes the per-frame boundary
  // recomposite entirely, the same fix that resolved `::before`'s jitter.
  it('.cm-note-embed__controls never transitions opacity (instant reveal, no group-opacity layer churn against the title)', () => {
    const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8');
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const controlsMatch = cssWithoutComments.match(/\.cm-note-embed__controls\s*\{([^}]*)\}/);
    expect(controlsMatch, '.cm-note-embed__controls rule not found').not.toBeNull();
    expect(controlsMatch![1]).not.toMatch(/transition\s*:/);
  });

  // Each individual button inside the controls row never has its own
  // `opacity` value changed by any rule — only `background`/`color` do,
  // on the button's own `:hover`. A `transition: opacity` declared here
  // regardless made each button independently eligible for its own nested
  // layer promotion inside the already-promoted `.cm-note-embed__controls`
  // group layer — dead weight stacked on top of the group-opacity jitter,
  // the same category of unused-transition bug the outer container's own
  // `font-size` transition was.
  it('.cm-media-control/.cm-invalid-embed__control never transition opacity — only background/color actually change on hover', () => {
    const css = readFileSync(
      join(__dirname, '../mediaPresentation/MediaFloatingControls.css'),
      'utf8'
    );
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const controlMatch = cssWithoutComments.match(
      /\.cm-media-control,\s*\n\.cm-invalid-embed__control\s*\{([^}]*)\}/
    );
    expect(controlMatch, '.cm-media-control, .cm-invalid-embed__control rule not found').not.toBeNull();
    expect(controlMatch![1]).not.toMatch(/transition\s*:[\s\S]*?opacity/);
    expect(controlMatch![1]).toMatch(/transition\s*:[\s\S]*?background/);
  });
});

/**
 * Phase 2: embedded-note collapse. Deliberately independent of CM6's own
 * fold state (`codemirror/fold/foldToggleDecoration.ts`) — a note embed's
 * body is DOM synthesized by `NoteEmbedWidget.toDOM()`, not a range of the
 * *outer* document, so there is nothing for `foldService`/`foldEffect`/
 * `findFold()` to act on here at all. See `ImageUiState.collapsed`'s and
 * `NoteEmbedWidget`'s own "Collapse/expand" doc comments for why this is
 * widget-level DOM state, not a decoration/`eq()`-driven rebuild.
 */
describe('note embed collapse/expand (Phase 2)', () => {
  beforeEach(() => {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function collapseButtonOf(card: Element): HTMLButtonElement {
    return card.querySelector('[aria-label="Collapse note"], [aria-label="Expand note"]') as HTMLButtonElement;
  }

  it('renders expanded by default: content visible and header present, button reads "Collapse note"', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body text.', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    const content = card.querySelector<HTMLElement>('.cm-note-embed__content')!;
    expect(content.hidden).toBe(false);
    expect(content.textContent).toContain('Body text.');
    expect(card.classList.contains('cm-note-embed--collapsed')).toBe(false);
    expect(card.querySelector('.cm-note-embed__title')?.textContent).toBe('Other Note');
    expect(collapseButtonOf(card).getAttribute('aria-label')).toBe('Collapse note');
  });

  it('clicking Collapse hides the body; header/title stay visible', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body text.', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    collapseButtonOf(card).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const content = card.querySelector<HTMLElement>('.cm-note-embed__content')!;
    expect(content.hidden).toBe(true);
    expect(card.classList.contains('cm-note-embed--collapsed')).toBe(true);
    // Header/title/icon are separate DOM elements from
    // `.cm-note-embed__content` — hiding it must not remove or hide them.
    expect(card.querySelector('.cm-note-embed__header')).not.toBeNull();
    expect(card.querySelector('.cm-note-embed__title')?.textContent).toBe('Other Note');
    expect(card.querySelector('.cm-note-embed__icon-wrap')).not.toBeNull();
    expect(collapseButtonOf(card).getAttribute('aria-label')).toBe('Expand note');
  });

  it('clicking Expand after Collapse restores the content exactly as it was, and removes cm-note-embed--collapsed again', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body text.', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    collapseButtonOf(card).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    collapseButtonOf(card).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const content = card.querySelector<HTMLElement>('.cm-note-embed__content')!;
    expect(content.hidden).toBe(false);
    expect(content.textContent).toContain('Body text.');
    expect(card.classList.contains('cm-note-embed--collapsed')).toBe(false);
    expect(collapseButtonOf(card).getAttribute('aria-label')).toBe('Collapse note');
  });

  it('collapsing never changes the document text — this is a display-only toggle', () => {
    const doc = '![[Other Note]]';
    const view = mountView(
      doc,
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body text.', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    collapseButtonOf(card).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.state.doc.toString()).toBe(doc);
  });

  it('collapsing does not tear down and recreate the nested EditorView — the same nested .cm-content DOM node survives the toggle', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body text.', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    const nestedContentBefore = card.querySelector('.cm-note-embed__content .cm-content');
    expect(nestedContentBefore).not.toBeNull();

    collapseButtonOf(card).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Same DOM node identity, not merely an equivalent-looking new one —
    // proves the collapse toggle never went through `toDOM()` again.
    const nestedContentAfter = card.querySelector('.cm-note-embed__content .cm-content');
    expect(nestedContentAfter).toBe(nestedContentBefore);
  });

  it('the other header controls (Expand to source, Edit source, More actions) remain present and clickable after collapsing', () => {
    const onOpenPage = vi.fn();
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: 'Body text.', icon: 'note', emoji: null },
      }),
      { onOpenPage }
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    collapseButtonOf(card).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const expandToSourceButton = card.querySelector('[aria-label="Expand"]') as HTMLButtonElement;
    expect(expandToSourceButton).not.toBeNull();
    expandToSourceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenPage).toHaveBeenCalledWith('page-other');

    expect(card.querySelector('[aria-label="Edit source"]')).not.toBeNull();
    expect(card.querySelector('[aria-label="More actions"]')).not.toBeNull();
  });

  it('multiple embeds in the same document maintain independent collapsed states', () => {
    const view = mountView(
      '![[First]]\n\n![[Second]]',
      resolverFor({
        First: { status: 'resolved', pageId: 'page-first', title: 'First', markdown: 'First body.', icon: 'note', emoji: null },
        Second: { status: 'resolved', pageId: 'page-second', title: 'Second', markdown: 'Second body.', icon: 'note', emoji: null },
      })
    );

    const cards = Array.from(view.dom.querySelectorAll('.cm-note-embed'));
    expect(cards).toHaveLength(2);
    const [firstCard, secondCard] = cards;

    collapseButtonOf(firstCard!).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(firstCard!.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
    expect(secondCard!.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(false);
    expect(secondCard!.querySelector<HTMLElement>('.cm-note-embed__content')?.textContent).toContain('Second body.');
  });

  it('a note embedded inside another note embed collapses independently, at any depth, without disturbing the read-only nested editor\'s own (now independently foldable, per ADR-033) internal content', () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '# Heading\n\nbody\n\n![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: 'Inner body', icon: 'note', emoji: null },
      })
    );

    const outerCard = view.dom.querySelector('.cm-note-embed')!;
    const innerCard = outerCard.querySelector('.cm-note-embed')!;

    collapseButtonOf(innerCard).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(innerCard.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
    // The outer embed's own content (which contains this inner card) is a
    // structurally different element from the inner embed's own content —
    // collapsing the inner one must not collapse the outer one.
    const outerOwnContent = outerCard.querySelector(':scope > .cm-note-embed__content') as HTMLElement;
    expect(outerOwnContent.hidden).toBe(false);
  });
});

/**
 * Regression coverage for ADR-033's second amendment — the *outer*
 * "collapse this whole embedded note card" toggle (`ImageUiState.
 * collapsed`, a completely different mechanism from CM6 `foldState`; see
 * that amendment's own investigation finding). Persisted independently of
 * — and must never conflict with — the *inner* CM6 fold state the first
 * amendment (tested above) already covers.
 */
describe("note-embed OUTER collapse persistence (ADR-033's second amendment)", () => {
  function collapseButtonOf(card: Element): HTMLButtonElement {
    return card.querySelector('[aria-label="Collapse note"], [aria-label="Expand note"]') as HTMLButtonElement;
  }

  const singleEmbedDoc = '![[Other Note]]';
  const singleEmbedResolver = () =>
    resolverFor({
      'Other Note': {
        status: 'resolved',
        pageId: 'page-other',
        title: 'Other Note',
        markdown: '# Heading\ncontent',
        icon: 'note',
        emoji: null,
      },
    });

  it('outer embed collapsed, then close/reopen the host note — the embed reopens still collapsed', () => {
    const store = createInMemoryFoldStatePersistence();

    const before = mountView(singleEmbedDoc, singleEmbedResolver(), { getFoldStateStore: () => store });
    const cardBefore = before.dom.querySelector('.cm-note-embed')!;
    collapseButtonOf(cardBefore).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cardBefore.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
    before.destroy();

    const after = mountView(singleEmbedDoc, singleEmbedResolver(), { getFoldStateStore: () => store });
    const cardAfter = after.dom.querySelector('.cm-note-embed')!;
    expect(cardAfter.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
    expect(collapseButtonOf(cardAfter).getAttribute('aria-label')).toBe('Expand note');
  });

  it('outer embed left expanded (never toggled), then close/reopen — remains expanded, the ordinary default', () => {
    const store = createInMemoryFoldStatePersistence();

    const before = mountView(singleEmbedDoc, singleEmbedResolver(), { getFoldStateStore: () => store });
    before.destroy();

    const after = mountView(singleEmbedDoc, singleEmbedResolver(), { getFoldStateStore: () => store });
    const cardAfter = after.dom.querySelector('.cm-note-embed')!;
    expect(cardAfter.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(false);
    expect(collapseButtonOf(cardAfter).getAttribute('aria-label')).toBe('Collapse note');
  });

  it('two different host notes embedding the same note do not share outer-collapse state — collapsing it in one host leaves the other host\'s own occurrence expanded', () => {
    const store = createInMemoryFoldStatePersistence();

    const hostA = mountView(singleEmbedDoc, singleEmbedResolver(), {
      getFoldStateStore: () => store,
      hostPageId: 'host-a',
    });
    collapseButtonOf(hostA.dom.querySelector('.cm-note-embed')!).dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    hostA.destroy();

    // A different host note, embedding the exact same page, never toggled
    // in this session at all.
    const hostB = mountView(singleEmbedDoc, singleEmbedResolver(), {
      getFoldStateStore: () => store,
      hostPageId: 'host-b',
    });
    const cardB = hostB.dom.querySelector('.cm-note-embed')!;
    expect(cardB.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(false);
    expect(collapseButtonOf(cardB).getAttribute('aria-label')).toBe('Collapse note');
    hostB.destroy();

    // Reopening host A still shows its own collapsed state, independent of
    // host B ever having been opened in between.
    const hostAReopened = mountView(singleEmbedDoc, singleEmbedResolver(), {
      getFoldStateStore: () => store,
      hostPageId: 'host-a',
    });
    const cardAReopened = hostAReopened.dom.querySelector('.cm-note-embed')!;
    expect(cardAReopened.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
  });

});

describe('embedFolderPath', () => {
  it.each([
    ['Projects/Weekly/Note', 'Projects/Weekly'],
    ['Folder/Note', 'Folder'],
    ['Note', ''],
    ['Folder/Note#Heading', 'Folder'],
    ['Note#Heading', ''],
    ['Note#Head/ing', ''],
    ['A/B/Note#One/Two', 'A/B'],
    ['  Folder / Note ', 'Folder'],
    ['/Note', ''],
    ['', ''],
  ])('%j -> %j', (target, expected) => {
    expect(embedFolderPath(target)).toBe(expected);
  });
});

describe('note embed lifecycle: each nested view belongs to the DOM it was rendered into', () => {
  beforeEach(() => {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const OTHER: Record<string, PageEmbedResolution> = {
    'Other Note': {
      status: 'resolved',
      pageId: 'page-other',
      title: 'Other Note',
      markdown: '# Heading\n\nBody text.',
      icon: 'note',
      emoji: null,
    },
  };

  const ui = { revealed: false, collapsed: false, broken: false } as unknown as ConstructorParameters<typeof NoteEmbedWidget>[3];

  function widgetWith(store: FoldStatePersistence) {
    return new NoteEmbedWidget(
      OTHER['Other Note'] as Extract<PageEmbedResolution, { status: 'resolved' }>,
      'Other Note',
      [markdownLanguageExtension()],
      ui,
      0,
      15,
      () => undefined,
      () => undefined,
      () => store,
      'host'
    );
  }

  const nestedOf = (dom: HTMLElement) =>
    EditorView.findFromDOM(dom.querySelector<HTMLElement>('.cm-note-embed__content > .cm-editor')!)!;

  it('rendering the same widget instance twice, then dropping the first DOM, keeps the visible editor alive', () => {
    const widget = widgetWith(createInMemoryFoldStatePersistence());
    const outer = {} as EditorView;
    const first = widget.toDOM(outer);
    const second = widget.toDOM(outer);

    widget.destroy(first);

    expect(first.querySelector('.cm-editor')).toBeNull();
    expect(second.querySelector('.cm-note-embed__content > .cm-editor')).not.toBeNull();
    expect(second.textContent).toContain('Body text.');
  });

  it('an equal widget instance that never rendered a DOM still cleans up the editor in the DOM it is handed', () => {
    const store = createInMemoryFoldStatePersistence();
    const dom = widgetWith(store).toDOM({} as EditorView);

    widgetWith(store).destroy(dom);

    expect(dom.querySelector('.cm-editor')).toBeNull();
  });

  it('destroying a DOM leaves no editor behind and a second destroy of it is a no-op', () => {
    const widget = widgetWith(createInMemoryFoldStatePersistence());
    const dom = widget.toDOM({} as EditorView);
    const nested = nestedOf(dom);
    const destroy = vi.spyOn(nested, 'destroy');

    widget.destroy(dom);
    widget.destroy(dom);

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the editor in the DOM being removed and records no fold state for the embedded note", () => {
    const store = createInMemoryFoldStatePersistence();
    const widget = widgetWith(store);
    const outer = {} as EditorView;
    const first = widget.toDOM(outer);
    const second = widget.toDOM(outer);
    const secondView = nestedOf(second);
    forceParsing(secondView);
    const heading = secondView.state.doc.line(1);
    secondView.dispatch({ effects: foldEffect.of(foldable(secondView.state, heading.from, heading.to)!) });

    widget.destroy(first);
    widget.destroy(second);

    expect(store.get('page-other')).toBeUndefined();
  });
});

describe('note embed in a host editor: reveal updates and navigation highlighting', () => {
  beforeEach(() => {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const resolver = resolverFor({
    'Other Note': {
      status: 'resolved',
      pageId: 'page-other',
      title: 'Other Note',
      markdown: '# Heading\n\nBody text.',
      icon: 'note',
      emoji: null,
    },
  });
  const DOC = 'Before\n\n![[Other Note]]\n\nAfter';
  const embedLine = DOC.indexOf('![[');

  const nestedEditors = (view: EditorView) => view.dom.querySelectorAll('.cm-note-embed__content .cm-editor');

  it('keeps the embedded content through every reveal update on the embed line, repeated', () => {
    const view = mountView(DOC, resolver, { extensions: [editorRevealHighlight()] });

    for (let i = 0; i < 3; i++) {
      view.dispatch({ effects: setRevealHighlight.of([{ from: embedLine, to: embedLine + 15 }]) });

      expect(nestedEditors(view)).toHaveLength(1);
      expect(view.dom.querySelector('.cm-note-embed__content')?.textContent).toContain('Body text.');
    }
  });

  it('leaves an expanded embed expanded through reveal updates', () => {
    const view = mountView(DOC, resolver, { extensions: [editorRevealHighlight()] });

    view.dispatch({ effects: setRevealHighlight.of([{ from: embedLine, to: embedLine + 15 }]) });
    const card = view.dom.querySelector('.cm-note-embed')!;

    expect(card.classList.contains('cm-note-embed--collapsed')).toBe(false);
    expect(card.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(false);
    expect(card.querySelector('.cm-fold-toggle')?.getAttribute('aria-label')).toBe('Collapse note');
  });

  it("respects the user's own collapse through reveal updates", () => {
    const view = mountView(DOC, resolver, { extensions: [editorRevealHighlight()] });
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Collapse note"]')!.click();

    view.dispatch({ effects: setRevealHighlight.of([{ from: embedLine, to: embedLine + 15 }]) });
    const card = view.dom.querySelector('.cm-note-embed')!;

    expect(card.classList.contains('cm-note-embed--collapsed')).toBe(true);
    expect(card.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
  });

  it("reveals the host's embed line only: the embed wrapper is the revealed line's child and the nested editor gets no reveal class", () => {
    const view = mountView(DOC, resolver, { extensions: [editorRevealHighlight()] });

    view.dispatch({ effects: setRevealHighlight.of([{ from: embedLine, to: embedLine + 15 }]) });

    const revealed = view.dom.querySelectorAll('.cm-reveal-line--visible');
    expect(revealed).toHaveLength(1);
    expect(revealed[0]!.querySelector(':scope > .cm-note-embed')).not.toBeNull();
    expect(view.dom.querySelector('.cm-note-embed__content .cm-reveal-line')).toBeNull();
  });
});

describe('embed highlight CSS: only the outer wrapper is ever highlighted', () => {
  const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('paints nothing on the embedded content on hover', () => {
    expect(css).not.toMatch(/:hover\s*>\s*\.cm-note-embed__content/);
    expect(css).not.toMatch(/\.cm-note-embed__content\s*\{[^}]*--md-reveal-highlight-surface/);
    expect(css).not.toMatch(/\.cm-note-embed__content[^{]*:hover[^{]*\{[^}]*background/);
  });

  it('moves the reveal flash from the revealed line onto the embed wrapper, with the reveal colour token', () => {
    const lineRule = css.match(/\.cm-reveal-line--visible:has\(>\s*\.cm-note-embed\)\s*\{([^}]*)\}/)?.[1] ?? '';
    const wrapperRule = css.match(/\.cm-reveal-line--visible\s*>\s*\.cm-note-embed\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(lineRule).toMatch(/background-color\s*:\s*transparent/);
    expect(wrapperRule).toMatch(/background-color\s*:\s*var\(--md-reveal-highlight-surface\)/);
  });
});
