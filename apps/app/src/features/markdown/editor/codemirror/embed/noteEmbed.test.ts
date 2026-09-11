// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { embedLivePreview } from './embedLivePreview';
import type { ResolveEmbedImage } from './embedImageResolution';
import type { ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import type { PageEmbedResolution, ResolvePageEmbed } from '../../../render/blocks/pageEmbedResolution';
import type { NoteEmbedAncestry } from './noteEmbedAncestry';
import { trimEmptyEdgeLines, type OnOpenNoteEmbedMenu } from './NoteEmbedWidget';

/** Every fixture here targets a page (never a real Vault resource) — both resolvers always decline, matching real production wiring. */
const declineImage: ResolveEmbedImage = () => ({ status: 'unresolved', alt: '' });
const declinePdf: ResolveEmbedPdf = () => ({ status: 'non-pdf' });

function mountView(
  doc: string,
  resolvePageEmbed: ResolvePageEmbed,
  options: {
    onOpenPage?: (pageId: string) => void;
    onOpenNoteEmbedMenu?: OnOpenNoteEmbedMenu;
    ancestry?: NoteEmbedAncestry;
  } = {}
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      markdownLanguageExtension(),
      embedLivePreview({
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
      }),
    ],
  });
  return new EditorView({ state, parent });
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

  it('the title has no click handler and does nothing when clicked', () => {
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

    expect(onOpenPage).not.toHaveBeenCalled();
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

describe('note embeds have no CM6 fold toggle/folding inside their own nested content — the embed always reads as one continuous, fully-expanded passage', () => {
  // `.cm-fold-toggle` is no longer a "never appears inside a note embed at
  // all" signal as of the embed's own collapse control (positioned like
  // `FoldToggleWidget`, sharing its class — see `NoteEmbedWidget.ts`'s own
  // "Positioned like the standalone fold toggle" doc comment): exactly one
  // legitimately exists per embed, as `.cm-note-embed__header`'s own first
  // child. These tests scope past that to `.cm-note-embed__content
  // .cm-content` — the nested read-only `EditorView`'s own content — which
  // is where a genuine CM6 heading/list/fenced-code toggle would have to
  // render if `createEditorView`'s `readOnly` gate weren't correctly
  // omitting `foldToggleDecoration()`/`codeFolding()` there.
  it('a note embed\'s own nested view has no CM6 fold toggle for its heading, through the real embedLivePreview → NoteEmbedWidget → createEditorView pipeline (not just a direct createEditorView call)', () => {
    const view = mountView(
      '![[Other Note]]',
      resolverFor({
        'Other Note': { status: 'resolved', pageId: 'page-other', title: 'Other Note', markdown: '# Heading\n\nBody', icon: 'note', emoji: null },
      })
    );

    const card = view.dom.querySelector('.cm-note-embed')!;
    expect(card.querySelector(':scope > .cm-note-embed__content > .cm-content .cm-fold-toggle')).toBeNull();
    // The embed's own collapse control is still exactly one real
    // `.cm-fold-toggle`, living in the header, not the nested content.
    expect(card.querySelector(':scope > .cm-note-embed__header > .cm-fold-toggle')).not.toBeNull();
    // The nested view's own content is real, not the top-level editor's —
    // confirms this checked the embed's own toggle-less nested view, not
    // merely the absence of a toggle somewhere unrelated.
    expect(card.querySelector('.cm-content')?.textContent).toContain('Heading');
  });

  it('a note embedded inside another note embed also has no CM6 fold toggle for its own heading — the same behavior at every nesting depth, with no depth-specific logic', () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '# Outer heading\n\n![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: '# Inner heading\n\nInner body', icon: 'note', emoji: null },
      })
    );

    const outerCard = view.dom.querySelector('.cm-note-embed')!;
    expect(outerCard.querySelector(':scope > .cm-note-embed__content > .cm-content .cm-fold-toggle')).toBeNull();

    const innerCard = outerCard.querySelector('.cm-note-embed')!;
    expect(innerCard).not.toBeNull();
    // Deliberately `:scope >`, not a bare descendant selector — a bare
    // `.cm-note-embed__content .cm-content .cm-fold-toggle` matches
    // against the *full document* ancestor chain, not one scoped to
    // `innerCard`'s own subtree, so it would incorrectly also match the
    // inner embed's own header toggle via the *outer* embed's
    // `.cm-note-embed__content .cm-content` ancestors sitting above
    // `innerCard` in the real DOM (confirmed directly — a first version
    // of this test using the bare form failed for exactly this reason).
    expect(innerCard.querySelector(':scope > .cm-note-embed__content > .cm-content .cm-fold-toggle')).toBeNull();
    // The inner embed's own collapse control is still present.
    expect(innerCard.querySelector(':scope > .cm-note-embed__header > .cm-fold-toggle')).not.toBeNull();
    expect(innerCard.querySelector('.cm-content')?.textContent).toContain('Inner heading');
  });
});

describe("a note embed's own extra content indent applies only when it's nested inside another note embed, never at the top level", () => {
  // jsdom applies no real CSS from imported stylesheets — reading the rule
  // text directly, the same convention `imageLivePreview.test.ts`'s own
  // CSS tripwires already establish for this codebase, rather than a
  // `getComputedStyle` check that would silently pass against jsdom's own
  // unstyled defaults regardless of what the real rule says.
  it("the .cm-note-embed__content left-padding rule is scoped under .cm-content[contenteditable='false'] — the bare, unscoped .cm-note-embed__content rule (top-level styling, e.g. margin-bottom) never carries padding-left itself", () => {
    const css = readFileSync(join(__dirname, 'NoteEmbedWidget.css'), 'utf8');
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const bareMatch = cssWithoutComments.match(/^\.cm-note-embed__content\s*\{([^}]*)\}/m);
    expect(bareMatch, 'bare .cm-note-embed__content rule not found').not.toBeNull();
    expect(bareMatch![1]).not.toMatch(/padding-left\s*:/);

    const match = cssWithoutComments.match(
      /\.cm-content\[contenteditable='false'\]\s+\.cm-note-embed__content\s*\{([^}]*)\}/
    );
    expect(match, "scoped .cm-content[contenteditable='false'] .cm-note-embed__content rule not found").not.toBeNull();
    expect(match![1]).toMatch(/padding-left\s*:/);
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

  it('renders expanded by default: content visible, dividers and header present, button reads "Collapse note"', () => {
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
    expect(card.querySelectorAll('.cm-note-embed__divider')).toHaveLength(2);
    expect(card.querySelector('.cm-note-embed__title')?.textContent).toBe('Other Note');
    expect(collapseButtonOf(card).getAttribute('aria-label')).toBe('Collapse note');
  });

  it('clicking Collapse hides the body only — top divider, header/title, and bottom divider all stay visible', () => {
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
    // The dividers, header, icon, and title are separate DOM elements from
    // `.cm-note-embed__content` — hiding it must not remove or hide them.
    expect(card.querySelectorAll('.cm-note-embed__divider')).toHaveLength(2);
    expect((card.querySelector('.cm-note-embed__divider') as HTMLElement | null)?.hidden).toBeFalsy();
    expect(card.querySelector('.cm-note-embed__header')).not.toBeNull();
    expect(card.querySelector('.cm-note-embed__title')?.textContent).toBe('Other Note');
    expect(card.querySelector('.cm-note-embed__icon-wrap')).not.toBeNull();
    expect(collapseButtonOf(card).getAttribute('aria-label')).toBe('Expand note');
  });

  it('clicking Expand after Collapse restores the content exactly as it was', () => {
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

  it('a note embedded inside another note embed collapses independently, at any depth, with the read-only nested editor left fully expanded internally (no Phase 1 fold toggles inside it)', () => {
    const view = mountView(
      '![[Outer]]',
      resolverFor({
        Outer: { status: 'resolved', pageId: 'page-outer', title: 'Outer', markdown: '# Heading\n\nbody\n\n![[Inner]]', icon: 'note', emoji: null },
        Inner: { status: 'resolved', pageId: 'page-inner', title: 'Inner', markdown: 'Inner body', icon: 'note', emoji: null },
      })
    );

    const outerCard = view.dom.querySelector('.cm-note-embed')!;
    const innerCard = outerCard.querySelector('.cm-note-embed')!;

    // No CM6 fold toggle anywhere inside the nested read-only view's own
    // content, collapsed or not — createEditorView's own `readOnly` gate
    // already omits `foldToggleDecoration()`/`codeFolding()` entirely,
    // unrelated to and unaffected by this collapse mechanism. (The outer
    // embed's own `.cm-fold-toggle` collapse control, and the inner
    // embed's own, both legitimately exist elsewhere in this tree — see
    // the "no CM6 fold toggle inside their own nested content" describe
    // block above for that distinction.)
    expect(outerCard.querySelector(':scope > .cm-note-embed__content > .cm-content .cm-fold-toggle')).toBeNull();

    collapseButtonOf(innerCard).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(innerCard.querySelector<HTMLElement>('.cm-note-embed__content')!.hidden).toBe(true);
    // The outer embed's own content (which contains this inner card) is a
    // structurally different element from the inner embed's own content —
    // collapsing the inner one must not collapse the outer one.
    const outerOwnContent = outerCard.querySelector(':scope > .cm-note-embed__content') as HTMLElement;
    expect(outerOwnContent.hidden).toBe(false);
  });
});
