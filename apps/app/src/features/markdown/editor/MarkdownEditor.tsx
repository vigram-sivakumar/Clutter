import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';

import {
  createEditorView,
  docTextMatches,
  hasEstablishedEditingPosition,
  serializeEditorHistory,
  serializeFoldState,
  syncMarkdownIntoView,
} from './codemirror/createEditorView';
import {
  getCachedEditorSession,
  setCachedEditorSession,
} from './codemirror/editorHistoryCache';
import { buildEditorExtensions } from './codemirror/buildEditorExtensions';
import { computeEmbedRemovalRange } from './codemirror/mediaPresentation/embedRemovalRange';
import { ImageOptionsMenu } from './codemirror/image/ImageOptionsMenu';
import type { OnImageClick, OnOpenImageMenu } from './codemirror/image/ImageWidget';
import type { OnOpenPdfMenu, OnPdfEmbedClick } from './codemirror/pdf/PdfEmbedWidget';
import { PdfEmbedMoreActions, type PdfEmbedMoreActionsAnchor } from './codemirror/pdf/PdfEmbedMoreActions';
import { NoteEmbedMoreActions, type NoteEmbedMoreActionsAnchor } from './codemirror/embed/NoteEmbedMoreActions';
import type { OnOpenNoteEmbedMenu } from './codemirror/embed/NoteEmbedWidget';
import { FencedCodeActionsMenu, type FencedCodeActionsMenuAnchor } from './codemirror/fencedCode/FencedCodeActionsMenu';
import type { OnOpenFencedCodeMenu } from './codemirror/fencedCode/FencedCodeActionsButtonWidget';
import { computeFencedCodeRemovalRange } from './codemirror/fencedCode/fencedCodeRemovalRange';
import {
  resolveFencedCodeInfoRange,
  resolveFencedCodeText,
  resolveFencedCodeTextRange,
  resolveFencedCodeOpeningLine,
} from './codemirror/fencedCode/fencedCodeInfoRange';
import { resolveFileExtension } from './codemirror/fencedCode/fencedCodeFileExtension';
import { formatCode, resolveFormatterParser } from './codemirror/fencedCode/codeFormatting';
import { getImageUiState, presentationOnlyEdit, setImageUiState, type ImageDisplayMode } from './codemirror/image/imageUiState';
import { getImagePresentation, computeImagePresentationUpdate } from './codemirror/mediaPresentation/mediaPresentationUpdate';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import { downloadTextFile } from '@shared/helpers/downloadTextFile';
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from './MarkdownEditor.types';

export type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from './MarkdownEditor.types';
export type { ResolveDate, DateResolution } from './codemirror/date/dateResolution';
export type { ResolveTag, TagResolution } from './codemirror/tag/tagResolution';
export type { GetTagSuggestions } from './codemirror/tag/tagSuggestion';
export type {
  ResolveWikiLink,
  WikiLinkResolution,
} from './codemirror/wikilink/wikiLinkResolution';
export type {
  GetWikiLinkSuggestions,
  WikiLinkSuggestion,
  WikiLinkPageSuggestion,
  WikiLinkCreateSuggestion,
} from './codemirror/wikilink/wikiLinkSuggestion';
export type {
  GetEmbedSuggestions,
  EmbedSuggestion,
  EmbedResourceSuggestion,
} from './codemirror/embed/embedSuggestion';
export type {
  ResolveEmbedImage,
  EmbedImageResolution,
} from './codemirror/embed/embedImageResolution';
export type {
  ResolveEmbedPdf,
  EmbedPdfResolution,
} from './codemirror/pdf/embedPdfResolution';
export type { OnPdfEmbedClick } from './codemirror/pdf/PdfEmbedWidget';
export type { ResolveImageResource } from './codemirror/image/imageResourceResolution';
export type { ResolveImageSrc, ImageSrcResolution } from './codemirror/image/imageSrcResolution';
import './MarkdownEditor.css';
// Shared embed/media CSS — genuinely used by more than one embed widget
// (Image, PDF, and/or Note), so no single widget's own `.ts` module
// imports it; imported once, centrally, from here instead. Each widget's
// own embed-specific CSS is imported directly by that widget's own module
// (ImageWidget.ts, PdfEmbedWidget.ts, NoteEmbedWidget.ts) instead of here.
import './codemirror/mediaPresentation/embedLayout.css';
import './codemirror/mediaPresentation/invalidEmbedCard.css';
// The inline media widgets' own floating controls (ImageWidget.ts and
// PdfEmbedWidget.ts's broken/invalid card, raw CM6 DOM) style themselves
// via `.cm-media-controls`/`.cm-media-control` — MarkdownEditor.css only
// carries this file's own CM6-specific rules on top of those classes now;
// the shared chrome itself lives here, imported explicitly so the inline
// widgets' styling doesn't depend on whichever other component happens to
// import it (currently ImageOverlay, but that's an implementation detail
// this file's own raw-DOM consumers shouldn't rely on transitively).
import './codemirror/mediaPresentation/MediaFloatingControls.css';

/**
 * Walks up from `el` to find the nearest ancestor that's actually the
 * page's scrolling element — `overflow-y: auto`/`scroll` in its computed
 * style, checked generically rather than matching a specific class name
 * (e.g. `Page.tsx`'s own `.page__content`) to avoid coupling this
 * feature-layer component to a particular page shell's internal DOM
 * structure; any host that scrolls its content via a CSS-overflow
 * ancestor works automatically. See `editorHistoryCache.ts`'s
 * `domScrollTop` doc comment for why this exists: CM6's own
 * `EditorView.scrollSnapshot()`/`scrollTo` only ever affect the editor's
 * *own* internal scroller (`.cm-scroller`), which is never the actual
 * scrolling element in this app's layout (`EditorView.lineWrapping` lets
 * editor content grow to full height; an ancestor scrolls instead) —
 * confirmed by direct measurement in the real app, not assumed.
 */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Feature-level Markdown editing surface, backed by a CodeMirror 6
 * EditorView.
 *
 * Responsibilities:
 * - Present editable Markdown content.
 * - Own future editing interactions.
 * - Raise editing events to the application layer.
 * - Expose a stable editing API to feature components.
 *
 * Plain-text CM6 foundation (§2) + Markdown/GFM/WikiLink parsing (§3–§4) +
 * the injected WikiLink resolution boundary (§5) + at-rest WikiLink
 * rendering and atomic-range wiring (§6) + engagement/selection behavior
 * (§7, this step: mouse handlers, keyboard hop/activation, selection
 * snapping) are in place.
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    pageId,
    markdown,
    focusOnOpen,
    foldStateStore,
    onEdit,
    onFlush,
    resolveWikiLink,
    getWikiLinkSuggestions,
    getEmbedSuggestions,
    getEmbedHeadingSuggestions,
    resolveEmbedImage,
    resolveEmbedPdf,
    onPdfEmbedClick,
    resolvePageEmbed,
    onOpenPage,
    onOpenImageOverlay,
    resolveImageSrc,
    resolveTag,
    getTagSuggestions,
    resolveDate,
    onSetCoverImage,
    onDownloadImage,
    onDownloadPdfResource,
    resolveImageResource,
    onArchiveResource,
    onRevealResourceInFinder,
    onCopyResourcePath,
    resourceMoveDestinations,
    onMoveResource,
    onCreateFolder,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // The scroll ancestor's last known scrollTop, tracked continuously via
  // a `scroll` listener (see the mount effect below) rather than read
  // live at unmount. Necessary, not merely defensive — confirmed directly
  // (real-browser debugging): whatever navigation triggers a page switch
  // resets the scroll ancestor's `scrollTop` to `0` *before* this
  // component's own unmount cleanup runs (observed identically via
  // `document.querySelector('.page__content').scrollTop` and this exact
  // element reference — not an identity mismatch), so a live read at
  // unmount always captures the just-reset `0`, never the position the
  // user actually left the page scrolled to. Tracking on every scroll
  // event means the ref already holds the last real, pre-reset value by
  // the time unmount runs, regardless of when that external reset
  // happens relative to React's own commit/cleanup ordering.
  const lastKnownScrollTopRef = useRef<number | undefined>(undefined);
  // Resolved once, right after mount (see the mount effect below), and
  // reused as-is at unmount — deliberately not re-queried via
  // findScrollableAncestor(container) a second time at unmount. Observed
  // directly (real-browser debugging, not theorized): re-querying at
  // unmount intermittently returned null even though the exact same
  // ancestor was found correctly moments earlier at mount and is provably
  // still in the DOM (a manual query from the console at the same moment
  // finds it fine) — consistent with a transient computed-style state
  // during whatever page-switch transition is in flight right as
  // unmount's cleanup runs. Caching the reference sidesteps needing to
  // pin down that transition's exact timing.
  const scrollAncestorRef = useRef<HTMLElement | null>(null);

  // The view's listeners are wired once at mount (below); these refs let
  // them always call whatever onEdit/onFlush is current on a given
  // render, the same freshness React's own onInput/onBlur props gave the
  // previous contentEditable implementation for free.
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  // Read by the decoration layer's ViewPlugin on every rebuild via the
  // accessor passed below — same freshness pattern as onEdit/onFlush,
  // now with an actual reader.
  const resolveWikiLinkRef = useRef(resolveWikiLink);
  resolveWikiLinkRef.current = resolveWikiLink;

  // Same freshness pattern, for the completion source's accessor below.
  const getWikiLinkSuggestionsRef = useRef(getWikiLinkSuggestions);
  getWikiLinkSuggestionsRef.current = getWikiLinkSuggestions;

  // Same freshness pattern, for Embed's completion source accessor below.
  const getEmbedSuggestionsRef = useRef(getEmbedSuggestions);
  getEmbedSuggestionsRef.current = getEmbedSuggestions;

  // Same freshness pattern, for Embed's heading-suggestion accessor below.
  const getEmbedHeadingSuggestionsRef = useRef(getEmbedHeadingSuggestions);
  getEmbedHeadingSuggestionsRef.current = getEmbedHeadingSuggestions;

  // Same freshness pattern, for Embed's live-preview rendering accessor below.
  const resolveEmbedImageRef = useRef(resolveEmbedImage);
  resolveEmbedImageRef.current = resolveEmbedImage;

  // Same freshness pattern, for Embed's PDF-branch live-preview rendering
  // accessor below (Stage 2 — see embedLivePreview.ts's own doc comment).
  const resolveEmbedPdfRef = useRef(resolveEmbedPdf);
  resolveEmbedPdfRef.current = resolveEmbedPdf;
  const onPdfEmbedClickRef = useRef<OnPdfEmbedClick | undefined>(onPdfEmbedClick);
  onPdfEmbedClickRef.current = onPdfEmbedClick;

  // Same freshness pattern, for the note-embed branch's own resolver/
  // open-source-note accessors below (embedLivePreview.ts, via
  // buildEditorExtensions.ts).
  const resolvePageEmbedRef = useRef(resolvePageEmbed);
  resolvePageEmbedRef.current = resolvePageEmbed;
  const onOpenPageRef = useRef(onOpenPage);
  onOpenPageRef.current = onOpenPage;

  // Same freshness pattern — ADR-033's amendment: a resolved note embed's
  // own nested view restores/persists CM6 fold state keyed by the
  // *embedded* page's own pageId, through this same store (never a second
  // mechanism). `foldStateStore` itself doesn't change mid-session, but
  // the ref keeps this consistent with every other injected accessor here.
  const foldStateStoreRef = useRef(foldStateStore);
  foldStateStoreRef.current = foldStateStore;

  // Same freshness pattern, for standard Image's own live-preview local-
  // path resolution accessor below.
  const resolveImageSrcRef = useRef(resolveImageSrc);
  resolveImageSrcRef.current = resolveImageSrc;

  // Same freshness pattern as resolveEmbedImageRef above — this one IS an
  // injected Vault-backed boundary function (unlike opening the overlay
  // itself, which needs none): resolving "does this image have a local
  // VaultResource behind it" is what gates ImageOverlay's own More Actions
  // control (see imageResourceResolution.ts's doc comment).
  const resolveImageResourceRef = useRef(resolveImageResource);
  resolveImageResourceRef.current = resolveImageResource;
  // Opening the overlay itself is no longer local state — it's the shared
  // `AppLayout`-owned resource overlay (see MarkdownEditor.types.ts's
  // `onOpenImageOverlay` doc comment). Same freshness-ref pattern as every
  // other accessor here: the extension is built once at mount and reads
  // this getter fresh per click.
  const onOpenImageOverlayRef = useRef(onOpenImageOverlay);
  onOpenImageOverlayRef.current = onOpenImageOverlay;
  // Same freshness pattern — read fresh per click so the overlay's own
  // "Set as cover image" always calls whatever onSetCoverImage is current,
  // not whatever it was when onImageClickRef's closure was first built.
  const onSetCoverImageRef = useRef(onSetCoverImage);
  onSetCoverImageRef.current = onSetCoverImage;
  const onImageClickRef = useRef<OnImageClick>((url, alt, copyUrl) => {
    const resource = resolveImageResourceRef.current?.(copyUrl ?? url);
    onOpenImageOverlayRef.current?.(
      { url, alt, resourceId: resource?.resourceId, copyUrl },
      onSetCoverImageRef.current ? { onSetCoverImage: () => onSetCoverImageRef.current?.(copyUrl ?? url) } : undefined
    );
  });

  // Image's size/options menu — same local, presentational-state pattern
  // as imageOverlay above. `anchor` is a plain {current: HTMLElement}
  // bridging ImageWidget's raw-DOM trigger button into Overlay's
  // RefObject<HTMLElement> contract (see ImageOptionsMenu.tsx's own doc
  // comment) — not a React-created ref, since the trigger button lives in
  // CM6's DOM, not React's.
  const [imageMenu, setImageMenu] = useState<{
    anchor: { current: HTMLElement };
    pos: number;
    to: number;
    alt: string;
    url: string;
    copyUrl?: string;
  } | null>(null);
  /**
   * Sets/clears the size button's own active styling plus its container's
   * `[data-menu-open]` (`MarkdownEditor.css`'s "entire controls area
   * remains visible while the menu is open" rule) via **direct DOM
   * mutation** on the exact button/container elements already in hand —
   * never a CM6 dispatch. This is deliberate, not a shortcut: an earlier
   * version routed this through `imageUiState.ts`'s `setImageUiState`
   * effect, diffed by `ImageWidget.eq()` the same way `revealed`/
   * `displayMode` are, and that broke the menu's own positioning — the
   * `Overlay` this menu renders through is anchored directly to this same
   * `sizeButton` element, and the instant `eq()` saw a change it made CM6
   * destroy and recreate the widget's DOM, detaching the very button the
   * already-open `Overlay` was anchored to (its `getBoundingClientRect()`
   * then reads `{0,0,0,0}`, placing the menu at the viewport's top-left
   * corner). See `imageUiState.ts`'s own doc comment for the full record.
   * Plain DOM mutation has no such risk: it touches nothing CM6's own
   * decoration diffing looks at, so the button's identity — and therefore
   * `Overlay`'s anchor — is untouched by opening or closing this menu.
   */
  function setImageMenuButtonOpen(button: HTMLElement, open: boolean) {
    button.classList.toggle('cm-media-control--active', open);
    button.setAttribute('aria-expanded', String(open));
    button.closest('.cm-image-container')?.setAttribute('data-menu-open', String(open));
  }

  const onOpenImageMenuRef = useRef<OnOpenImageMenu>(({ anchor, pos, to, alt, url, copyUrl }) => {
    // Clicking the size button for the image whose menu is already open
    // closes it — the same toggle affordance OverflowMenu's own trigger
    // button gives (onOpenChange(!open)) — rather than always reopening.
    setImageMenu((current) => {
      const closingSame = current !== null && current.pos === pos;
      if (current) {
        setImageMenuButtonOpen(current.anchor.current, false);
      }
      if (!closingSame) {
        setImageMenuButtonOpen(anchor, true);
      }
      return closingSame ? null : { anchor: { current: anchor }, pos, to, alt, url, copyUrl };
    });
  });

  const closeImageMenu = () => {
    if (imageMenu) {
      setImageMenuButtonOpen(imageMenu.anchor.current, false);
    }
    setImageMenu(null);
  };

  // The inline PDF embed's own floating "More actions" control — same
  // bridged-anchor/toggle pattern as imageMenu above, a separate piece of
  // state since a PDF embed's menu is the Resource menu
  // (`PdfEmbedMoreActions`), not the image size/options menu.
  const [pdfMenu, setPdfMenu] = useState<{
    anchor: PdfEmbedMoreActionsAnchor;
    resourceId: string;
    pos: number;
  } | null>(null);

  function setPdfMenuButtonOpen(button: HTMLElement, open: boolean) {
    button.classList.toggle('cm-media-control--active', open);
    button.setAttribute('aria-expanded', String(open));
  }

  const onOpenPdfMenuRef = useRef<OnOpenPdfMenu>(({ anchor, resourceId, pos }) => {
    setPdfMenu((current) => {
      const closingSame = current !== null && current.anchor.current === anchor;
      if (current) {
        setPdfMenuButtonOpen(current.anchor.current, false);
      }
      if (!closingSame) {
        setPdfMenuButtonOpen(anchor, true);
      }
      return closingSame ? null : { anchor: { current: anchor }, resourceId, pos };
    });
  });

  const closePdfMenu = () => {
    if (pdfMenu) {
      setPdfMenuButtonOpen(pdfMenu.anchor.current, false);
    }
    setPdfMenu(null);
  };

  // "Remove" — only ever edits this note's own Markdown text (never the
  // underlying PDF resource); see embedRemovalRange.ts's own doc comment
  // for the Remove-vs-Archive product rule this enforces. Distinct from
  // the resource-level "Archive" item in the same menu (PdfEmbedMoreActions).
  const handleRemovePdfEmbed = () => {
    const view = viewRef.current;
    if (!pdfMenu || !view) {
      return;
    }
    const { from, to } = computeEmbedRemovalRange(view.state, pdfMenu.pos);
    view.dispatch({ changes: { from, to, insert: '' } });
  };

  const handleDownloadPdfResource = () => {
    if (!pdfMenu) {
      return;
    }
    onDownloadPdfResource?.(pdfMenu.resourceId);
  };

  // The inline note embed's own floating "More actions" control — same
  // bridged-anchor/toggle pattern as pdfMenu above. A note embed has no
  // backing VaultResource, so this menu (NoteEmbedMoreActions) is only
  // ever Turn into WikiLink + Remove, never a resource menu.
  const [noteEmbedMenu, setNoteEmbedMenu] = useState<{
    anchor: NoteEmbedMoreActionsAnchor;
    pos: number;
    to: number;
  } | null>(null);

  function setNoteEmbedMenuButtonOpen(button: HTMLElement, open: boolean) {
    button.classList.toggle('cm-media-control--active', open);
    button.setAttribute('aria-expanded', String(open));
    // Same `[data-menu-open]` mechanism as `setImageMenuButtonOpen` above —
    // keeps `.cm-note-embed__controls` visible for the duration the menu is
    // open, since `NoteEmbedMoreActions`'s `Overlay` is a portal outside
    // `.cm-note-embed`'s own DOM subtree, so `:focus-within` alone doesn't
    // survive focus moving into it.
    button.closest('.cm-note-embed')?.setAttribute('data-menu-open', String(open));
  }

  const onOpenNoteEmbedMenuRef = useRef<OnOpenNoteEmbedMenu>(({ anchor, pos, to }) => {
    setNoteEmbedMenu((current) => {
      const closingSame = current !== null && current.anchor.current === anchor;
      if (current) {
        setNoteEmbedMenuButtonOpen(current.anchor.current, false);
      }
      if (!closingSame) {
        setNoteEmbedMenuButtonOpen(anchor, true);
      }
      return closingSame ? null : { anchor: { current: anchor }, pos, to };
    });
  });

  const closeNoteEmbedMenu = () => {
    if (noteEmbedMenu) {
      setNoteEmbedMenuButtonOpen(noteEmbedMenu.anchor.current, false);
    }
    setNoteEmbedMenu(null);
  };

  // "Turn into WikiLink" — strips only the embed's own leading `!`
  // (`![[Note]]` → `[[Note]]`; `scanEmbed.ts`'s own doc comment confirms
  // the Embed node's `from` always points exactly at that `!`), a plain
  // text edit in the current note. The source note is never touched.
  const handleTurnNoteEmbedIntoWikiLink = () => {
    const view = viewRef.current;
    if (!noteEmbedMenu || !view) {
      return;
    }
    view.dispatch({ changes: { from: noteEmbedMenu.pos, to: noteEmbedMenu.pos + 1, insert: '' } });
  };

  // "Remove" — only ever edits this note's own Markdown text (never the
  // underlying source note); see embedRemovalRange.ts's own doc comment
  // for the Remove-vs-source-note product rule this enforces.
  const handleRemoveNoteEmbed = () => {
    const view = viewRef.current;
    if (!noteEmbedMenu || !view) {
      return;
    }
    const { from, to } = computeEmbedRemovalRange(view.state, noteEmbedMenu.pos);
    view.dispatch({ changes: { from, to, insert: '' } });
  };

  // A fenced code block's own floating "More actions" control — same
  // bridged-anchor/toggle pattern as noteEmbedMenu above. Offers Format
  // code (`handleFormatFencedCode` below, gated on formattability), Change
  // Language (submenu, `handleChangeFencedCodeLanguage` below), Download,
  // and Remove (`handleRemoveFencedCode` below). Copy stays its own
  // dedicated, persistent button — high-frequency enough to warrant
  // always-visible chrome, per `MarkdownEditor.css`'s own doc comment.
  const [fencedCodeMenu, setFencedCodeMenu] = useState<{
    anchor: FencedCodeActionsMenuAnchor;
    nodeFrom: number;
    nodeTo: number;
    currentRawInfo: string;
  } | null>(null);

  // Re-resolves the opening-fence line and its Actions/Copy buttons fresh
  // from `fencedCodeFrom` (via `resolveFencedCodeOpeningLine`'s
  // `view.domAtPos`) on every call — never a DOM node captured earlier.
  // This is the fix for a real bug (not speculative hardening): the
  // button widgets both render at the same computed position
  // (`CodeInfo.to`), so any edit to the info string — exactly what
  // "Change Language" does — moves that position, and CM6 tears down
  // and rebuilds the widget DOM there rather than migrating it, even
  // when `WidgetType.eq()` says the widget is unchanged. A previous
  // version of this function took the already-clicked button element
  // directly and walked up via `.closest(...)`; confirmed live (via a
  // temporary trace) that the anchor captured when the menu opened had
  // `isConnected: false` immediately after a language change, so that
  // cleanup silently found nothing and Copy stayed stuck visible
  // forever. See `resolveFencedCodeOpeningLine`'s own doc comment for
  // the full trace.
  function setFencedCodeMenuButtonOpen(view: EditorView, fencedCodeFrom: number, open: boolean) {
    const line = resolveFencedCodeOpeningLine(view, fencedCodeFrom);
    const actionsButton = line?.querySelector<HTMLElement>('.cm-code-block-actions');
    actionsButton?.classList.toggle('cm-media-control--active', open);
    actionsButton?.setAttribute('aria-expanded', String(open));
    // Keeps Copy visible too (not just Actions) for the duration the menu
    // is open — Copy/Actions are both hidden by default now (shared-hover
    // reveal, see `MarkdownEditor.css`'s own doc comment), and
    // `FencedCodeActionsMenu`'s `Overlay` is a portal outside this line's
    // own DOM subtree, so neither the hover class nor `:focus-within`
    // survives the pointer/focus moving into it.
    line
      ?.querySelector('.cm-code-block-copy')
      ?.classList.toggle('cm-code-block-copy--menu-open', open);
  }

  const onOpenFencedCodeMenuRef = useRef<OnOpenFencedCodeMenu>(({ anchor, nodeFrom, nodeTo }) => {
    setFencedCodeMenu((current) => {
      // Compared by stable position, not DOM identity — see
      // `setFencedCodeMenuButtonOpen`'s own doc comment for why a raw
      // element reference can't be trusted here.
      const closingSame = current !== null && current.nodeFrom === nodeFrom;
      const view = viewRef.current;
      if (current && view) {
        setFencedCodeMenuButtonOpen(view, current.nodeFrom, false);
      }
      if (!closingSame && view) {
        setFencedCodeMenuButtonOpen(view, nodeFrom, true);
      }
      if (closingSame) {
        return null;
      }
      // Resolved fresh right now, at open time, purely to seed the
      // Change Language submenu's checkmark — re-resolved again,
      // independently, at actual selection time (see
      // `handleChangeFencedCodeLanguage` below), never trusted as still
      // current by then.
      const info = view ? resolveFencedCodeInfoRange(view.state, nodeFrom) : null;
      return { anchor: { current: anchor }, nodeFrom, nodeTo, currentRawInfo: info?.rawInfo ?? '' };
    });
  });

  const closeFencedCodeMenu = () => {
    const view = viewRef.current;
    if (fencedCodeMenu && view) {
      setFencedCodeMenuButtonOpen(view, fencedCodeMenu.nodeFrom, false);
    }
    setFencedCodeMenu(null);
  };

  // "Remove" — deletes the entire fenced code block (opening marker,
  // content, closing marker); see `fencedCodeRemovalRange.ts`'s own doc
  // comment for the exact range/blank-line rule. Plain CM6 undo restores
  // it, same as every other edit.
  const handleRemoveFencedCode = () => {
    const view = viewRef.current;
    if (!fencedCodeMenu || !view) {
      return;
    }
    const { from, to } = computeFencedCodeRemovalRange(
      view.state,
      fencedCodeMenu.nodeFrom,
      fencedCodeMenu.nodeTo
    );
    view.dispatch({ changes: { from, to, insert: '' } });
  };

  // "Change Language" — rewrites only the info string (`CodeInfo`, e.g.
  // `js` in ` ```js `), never the code content. Re-resolves the exact
  // range fresh from `fencedCodeMenu.nodeFrom` rather than trusting
  // anything captured when the menu opened (the document may well have
  // changed since — same "never trust a captured range" contract every
  // other fenced-code control follows). Writes the lowercase canonical
  // name (`javascript`, not `JavaScript`) — ordinary Markdown fence-info
  // convention, and still an exact match for
  // `fencedCodeLanguageDescriptions` either way
  // (`LanguageDescription.of` lowercases its own alias list internally).
  // The existing `codeLanguages`/highlighting/label machinery picks up
  // the new language automatically on the next parse — nothing else to
  // wire.
  const handleChangeFencedCodeLanguage = (languageName: string) => {
    const view = viewRef.current;
    if (!fencedCodeMenu || !view) {
      return;
    }
    const info = resolveFencedCodeInfoRange(view.state, fencedCodeMenu.nodeFrom);
    if (!info) {
      return;
    }
    view.dispatch({
      changes: { from: info.from, to: info.to, insert: languageName.toLowerCase() },
    });
  };

  // "Download code" — exports only the block's own `CodeText` (never the
  // fences or the info string) via the native Save dialog. The filename
  // suggestion (language → extension, `code.js`/`code.py`/... or `.txt`
  // when unrecognized) is resolved once, synchronously, up front — it's
  // only ever a courtesy default the Save dialog itself lets the user
  // rename, so there's no staleness concern computing it before the
  // dialog opens, unlike the code content itself: `downloadTextFile`'s own
  // `getContent` callback isn't invoked until after the user has actually
  // picked a destination, and re-reads `viewRef.current` fresh at that
  // point too, not just the document position — the same "never trust
  // anything captured before an async gap" contract
  // `resolveFencedCodeBlockWrapper`'s own doc comment established applies
  // to the view instance itself, not only DOM nodes: the dialog can stay
  // open for as long as the user takes to choose a destination, during
  // which the editor could in principle be torn down (e.g. switching
  // notes) and `view` would otherwise be a stale reference.
  const handleDownloadFencedCode = () => {
    const view = viewRef.current;
    if (!fencedCodeMenu || !view) {
      return;
    }
    const nodeFrom = fencedCodeMenu.nodeFrom;
    const info = resolveFencedCodeInfoRange(view.state, nodeFrom);
    const extension = resolveFileExtension(info?.rawInfo ?? '');
    void downloadTextFile(() => {
      const currentView = viewRef.current;
      return currentView ? resolveFencedCodeText(currentView.state, nodeFrom) : '';
    }, `code${extension}`);
  };

  // "Format code" — moved from its own dedicated, persistent button
  // (`FencedCodeFormatButtonWidget`) into this menu as part of the
  // wrapper-removal migration (2026-09-16): with Copy/Actions no longer
  // needing hover to reveal them, a third always-visible control was
  // judged unnecessary chrome; Format is secondary/occasional enough to
  // fit the menu's own existing category (Change Language, Download,
  // Remove). Re-resolves `CodeText` fresh at click time — the same
  // "never trust a captured range" contract every fenced-code control
  // follows — since the menu itself may have stayed open across an edit.
  // A genuine parse/syntax error in the code (invalid/incomplete content
  // for the declared language) leaves the document untouched, same as
  // before — the standalone button's own visible error-icon feedback has
  // no equivalent surface once this is a menu item; disclosed here as a
  // known simplification rather than left silent.
  const handleFormatFencedCode = () => {
    const view = viewRef.current;
    if (!fencedCodeMenu || !view) {
      return;
    }
    const nodeFrom = fencedCodeMenu.nodeFrom;
    const info = resolveFencedCodeInfoRange(view.state, nodeFrom);
    const parserName = resolveFormatterParser(info?.rawInfo ?? '');
    const range = resolveFencedCodeTextRange(view.state, nodeFrom);
    if (!parserName || !range) {
      return;
    }
    const code = view.state.sliceDoc(range.from, range.to);
    formatCode(parserName, code).then(
      (formatted) => {
        const currentView = viewRef.current;
        if (!currentView || formatted === code) {
          return;
        }
        // Re-resolved fresh, not the `range` captured above, in case the
        // document changed during the async format — only replace when
        // the block still holds exactly the text that was sent for
        // formatting, matching the previous button's own staleness guard.
        const currentRange = resolveFencedCodeTextRange(currentView.state, nodeFrom);
        if (!currentRange || currentView.state.sliceDoc(currentRange.from, currentRange.to) !== code) {
          return;
        }
        currentView.dispatch({
          changes: { from: currentRange.from, to: currentRange.to, insert: formatted },
        });
      },
      () => {
        // Parse/syntax error — document left untouched, matching the
        // previous button's own non-destructive failure behavior. Its
        // visible error-icon feedback has no equivalent surface now that
        // this is a menu item rather than a persistent button — a
        // disclosed simplification, not an oversight.
      }
    );
  };

  const handleSelectImageDisplayMode = (mode: ImageDisplayMode) => {
    const view = viewRef.current;
    if (!imageMenu || !view) {
      return;
    }
    const ui = getImageUiState(view.state, imageMenu.pos, imageMenu.to);
    // Persists mode into the Markdown source alongside the ephemeral CM6
    // state, one transaction — closing the gap `imageUiState.ts`'s own
    // `displayMode` doc comment used to describe as "an explicit, separate,
    // not-yet-decided later concern." Without this, a selected mode
    // would render correctly for the rest of this session but silently
    // fall back to Fill the moment the note is reopened (a fresh
    // `EditorState`), and a subsequent resize commit would have no
    // persisted mode of its own to preserve. Width/alignment are read fresh
    // and passed through unchanged — this dispatch's only intended effect
    // is the mode field.
    //
    // `presentationOnlyEdit` (flicker fix): this transaction's `changes`
    // rewrite the image's own `|width,alignment,mode` pipe segment, which
    // lives inside the Image node's own range — without this marker,
    // `imageUiState.ts`'s pessimistic `broken`-forcing block would treat
    // it as a genuine content edit and flash the working image through
    // its broken card before a recovery probe resolved it back, which is
    // what actually caused the reported "image disappears and then
    // renders again" flicker. See that effect's own doc comment for the
    // full mechanism.
    const current = getImagePresentation(view.state, imageMenu.to);
    const changes = computeImagePresentationUpdate(view.state, imageMenu.to, { ...current, mode });
    // `setImageUiState`'s own `pos`/`to` must be given in *this
    // transaction's post-change* coordinate space — `imageUiStateField.
    // update()` inserts an effect's `pos`/`to` directly into `next`
    // (already `value.map(tr.changes)`, i.e. post-change), with no
    // mapping of its own applied (correctly so: every *other* dispatch
    // site fires effect-only, with no `changes` at all, so pre-change and
    // post-change coordinates are identical there and no mapping is ever
    // needed). `imageMenu.pos`/`imageMenu.to` are resolved against
    // `view.state` *before* this dispatch — the pre-change document — so
    // passing them through unmapped was a real, confirmed bug: `changes`
    // rewrites the pipe segment *inside* the node's own range, which
    // almost always changes its length (`fit` vs `fill` alone differ by a
    // character, and adding/removing the segment entirely is a bigger
    // delta), so the stale pre-change `to` silently corrupts the stored
    // RangeSet entry — not throwing immediately, but the *next* transaction
    // to touch the field (`value.map(tr.changes)`, at the top of `update`)
    // calls `mapPos` on that stale position against a changeset whose own
    // recorded pre-change length no longer reaches it, throwing exactly
    // "Position N is out of range for changeset of length M." Mapping both
    // through the same `changes` this transaction is already dispatching
    // (via `EditorState.changes()`, which builds the identical `ChangeSet`
    // CM6 itself will apply) keeps every position in the one coordinate
    // space the field actually expects.
    const mappedChanges = view.state.changes(changes);
    view.dispatch({
      effects: [
        setImageUiState.of({
          pos: mappedChanges.mapPos(imageMenu.pos),
          to: mappedChanges.mapPos(imageMenu.to, 1),
          state: { ...ui, displayMode: mode },
        }),
        presentationOnlyEdit.of(null),
      ],
      changes,
    });
  };

  const handleCopyImageLink = () => {
    if (!imageMenu) {
      return;
    }
    // `copyUrl`, when present, is what a local Resource embed wants copied
    // instead of `url` (which for an embed is the resolved, loadable file
    // URL, not the vault-relative text the Markdown itself carries) — see
    // OpenImageMenuParams.copyUrl's own doc comment. `undefined` for a
    // standard Markdown image, where `url` already is the right value.
    void copyTextToClipboard(imageMenu.copyUrl ?? imageMenu.url);
  };

  const handleSetCoverImage = () => {
    if (!imageMenu) {
      return;
    }
    onSetCoverImage?.(imageMenu.copyUrl ?? imageMenu.url);
  };

  // Same copyUrl-vs-url rule as handleSetCoverImage above — reads
  // imageMenu's state (the inline size/options menu). ImageOverlay's own
  // "Set as cover image" is handled by onImageClickRef's own
  // onOpenImageOverlay call instead (ImageOverlay itself is no longer
  // rendered by this component — see MarkdownEditor.types.ts's
  // `onOpenImageOverlay` doc comment).
  const handleDownloadImage = () => {
    if (!imageMenu) {
      return;
    }
    onDownloadImage?.(imageMenu.copyUrl ?? imageMenu.url);
  };

  // "Remove" — only ever edits this note's own Markdown text (never the
  // underlying resource); see embedRemovalRange.ts's own doc comment for
  // the Remove-vs-Archive product rule this enforces.
  const handleRemoveImage = () => {
    const view = viewRef.current;
    if (!imageMenu || !view) {
      return;
    }
    const { from, to } = computeEmbedRemovalRange(view.state, imageMenu.pos);
    view.dispatch({ changes: { from, to, insert: '' } });
  };

  // Same freshness pattern as resolveWikiLinkRef above, for Tag's decoration/mouse/keymap accessor.
  const resolveTagRef = useRef(resolveTag);
  resolveTagRef.current = resolveTag;

  // Same freshness pattern, for Tag's completion source accessor below.
  const getTagSuggestionsRef = useRef(getTagSuggestions);
  getTagSuggestionsRef.current = getTagSuggestions;

  // Same freshness pattern, for Date's decoration/mouse/keymap accessor.
  const resolveDateRef = useRef(resolveDate);
  resolveDateRef.current = resolveDate;

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const cachedSession = getCachedEditorSession(pageId);

    const view = createEditorView({
      doc: markdown,
      parent: container,
      // Per-document CM6 undo/redo history + scroll preservation
      // (docs/editor-architecture-decisions.md's entries of that name):
      // `createEditorView` itself guards both against a stale/mismatched
      // cache entry (its own `restoreHistoryJSON`/`restoreScrollEffect`
      // doc comments) — silently falls back to a fresh state (and default
      // scroll) if the cached snapshot's embedded document no longer
      // matches `markdown`, e.g. because something changed this page's
      // content elsewhere while it was closed (`PageOperations.mutateBody()`).
      // This lookup is therefore always safe to pass through
      // unconditionally, cache hit or miss.
      restoreHistoryJSON: cachedSession?.historyJSON,
      restoreScrollEffect: cachedSession?.scrollEffect,
      // ADR-033: durable, cross-restart fold-range restoration — a
      // separate source (FoldStateStore) from restoreHistoryJSON's
      // session-lifetime cachedSession above, independently gated inside
      // createEditorView (see that option's own doc comment for why the
      // two are never merged into one restore-or-not decision).
      restoreFoldJSON: foldStateStore?.get(pageId),
      // The full rendering/interaction extension list is built by the one
      // shared factory (`buildEditorExtensions.ts`) a note embed's own
      // nested, permanently read-only `EditorView` also calls (from
      // `embedLivePreview.ts`, when a `![[Page]]` target resolves) — see
      // that factory's own doc comment for why this extraction exists and
      // exactly which extensions differ (`readOnly: false` here keeps
      // every editing keymap/autocomplete/normalization extension
      // included, unlike a note embed's own build). `readOnly` here must
      // stay in sync with the `readOnly: false` (default) this same
      // `createEditorView()` call above implicitly uses — no explicit
      // `readOnly` option is passed to `createEditorView` for the
      // top-level editor, exactly as before this extraction.
      extensions: buildEditorExtensions({
        resolveWikiLink: () => resolveWikiLinkRef.current,
        getWikiLinkSuggestions: () => getWikiLinkSuggestionsRef.current,
        getEmbedSuggestions: () => getEmbedSuggestionsRef.current,
        getEmbedHeadingSuggestions: () => getEmbedHeadingSuggestionsRef.current,
        resolveEmbedImage: () => resolveEmbedImageRef.current,
        resolveEmbedPdf: () => resolveEmbedPdfRef.current,
        resolvePageEmbed: () => resolvePageEmbedRef.current,
        onImageClick: () => onImageClickRef.current,
        onOpenImageMenu: () => onOpenImageMenuRef.current,
        onPdfEmbedClick: () => onPdfEmbedClickRef.current,
        onOpenPdfMenu: () => onOpenPdfMenuRef.current,
        onOpenPage: () => onOpenPageRef.current,
        onOpenNoteEmbedMenu: () => onOpenNoteEmbedMenuRef.current,
        onOpenFencedCodeMenu: () => onOpenFencedCodeMenuRef.current,
        resolveImageSrc: () => resolveImageSrcRef.current,
        resolveTag: () => resolveTagRef.current,
        getTagSuggestions: () => getTagSuggestionsRef.current,
        resolveDate: () => resolveDateRef.current,
        onTaskCheckboxToggled: () => onFlushRef.current?.(),
        readOnly: false,
        // Seeds this page's own id into the top-level ancestry so a note
        // that embeds itself directly (`![[ThisPage]]`) is caught on
        // first encounter, exactly like any other cycle — not just a
        // cycle discovered one level of embedding deep. See
        // `noteEmbedAncestry.ts`'s own doc comment.
        ancestry: { ancestryPageIds: new Set([pageId]), depth: 0 },
        getFoldStateStore: () => foldStateStoreRef.current,
        hostPageId: pageId,
      }),
      onDocChange: (nextMarkdown) => onEditRef.current?.(nextMarkdown),
      onBlur: () => onFlushRef.current?.(),
    });
    viewRef.current = view;

    // Applied after mount, not via createEditorView's own `scrollTo`
    // config (which is scoped to CM6's internal `.cm-scroller` — see
    // `findScrollableAncestor`'s doc comment for why that alone doesn't
    // produce a visible effect in this app's real layout): the ancestor
    // that actually scrolls is outside CM6's own DOM, so restoring its
    // `scrollTop` is a plain DOM write, done here once the view's content
    // (and therefore the ancestor's real `scrollHeight`) exists. Gated on
    // the identical doc-match check `createEditorView` already applies to
    // `restoreHistoryJSON`/`restoreScrollEffect` — a session's scroll
    // position is exactly as untrustworthy to restore as its history when
    // the underlying document changed externally while this page was
    // closed, and this is a *separate* restore path that needs its own
    // copy of that same guard, not an assumption that createEditorView's
    // internal gate already covered it.
    scrollAncestorRef.current = findScrollableAncestor(container);
    const cachedSessionMatchesDoc =
      cachedSession !== undefined && docTextMatches(cachedSession.historyJSON, markdown);
    if (scrollAncestorRef.current && cachedSession?.domScrollTop !== undefined && cachedSessionMatchesDoc) {
      scrollAncestorRef.current.scrollTop = cachedSession.domScrollTop;
      lastKnownScrollTopRef.current = cachedSession.domScrollTop;
    } else {
      lastKnownScrollTopRef.current = scrollAncestorRef.current?.scrollTop;
    }

    // Restoring the *document*'s previous selection (via `restoreHistoryJSON`
    // above) never implies restoring *focus* — `EditorState.fromJSON`
    // carries selection along automatically, but focus is a DOM/EditorView
    // concern EditorState knows nothing about (confirmed by reading CM6's
    // own state/view separation, not assumed). Priority, per
    // docs/editor-architecture-decisions.md's "Focus restoration" entry:
    // (1) a restorable cached session with real, established prior
    // engagement (`hasEstablishedEditingPosition` — not merely "a cache
    // entry exists": one gets written on *every* unmount unconditionally,
    // including a page that was opened and immediately closed untouched,
    // and React StrictMode's own dev-only mount-unmount-remount cycle,
    // which would otherwise manufacture a trivially-matching "session" out
    // of a brand-new, never-touched page's own component lifecycle —
    // caught directly: a brand-new empty-title draft's second StrictMode
    // mount found a cache entry from its own first mount's cleanup, and
    // very nearly stole focus from the title as a result) always focuses
    // the editor — the user is returning to an established editing
    // position and should be able to keep typing immediately, regardless
    // of whether that session happened to be focused when it was last
    // closed; (2) otherwise, `focusOnOpen` (computed by `PageHost.tsx`,
    // mirroring `Page.tsx`'s own "empty title -> focus title" policy: the
    // editor is the open-time focus target only when the title is *not*
    // empty) decides instead — a brand-new, empty-title page leaves the
    // title as the first editing target, exactly as before. Called after
    // the scroll restore immediately above so a focused caret settles into
    // its already-correctly-scrolled position, and only once `view` is
    // fully constructed and attached (`createEditorView`'s `new
    // EditorView({..., parent})` already attaches synchronously —
    // `view.focus()` here is not called before that has happened).
    if ((cachedSessionMatchesDoc && hasEstablishedEditingPosition(view)) || focusOnOpen) {
      view.focus();
    }

    // Sampled on a short interval, not a `scroll` event listener — a
    // deliberate choice, not the first one tried. A `scroll`-event
    // listener is the more obvious design and was implemented first, but
    // it shares a real failure mode with a live unmount-time read: the
    // browser's own scroll-position clamping (a page switch replaces this
    // page's tall content with the next page's much shorter content, and
    // `.page__content`'s `scrollTop` is clamped to fit the new,
    // now-current `scrollHeight` — confirmed directly: switching from a
    // 40-line, scrolled-to-400px page to a near-empty one left `scrollTop`
    // at `0`) *also* fires a `scroll` event, and does so as part of the
    // very same DOM mutation React's commit phase performs *before*
    // running this component's own unmount cleanup — so a listener-based
    // "last known" value is just as vulnerable to being overwritten by
    // the clamp's own event as a live read is. Polling sidesteps this
    // categorically: the interval is cleared (below) as the very first
    // step of cleanup, before anything else runs, so no poll can ever
    // observe a post-mutation, already-clamped value — the last sample
    // is always from while this page's own content (and therefore its
    // real, correct scrollHeight) was still the one in the DOM. 300ms is
    // an approximate-restoration tolerance, not a precision guarantee —
    // scroll position restoration doesn't need pixel accuracy.
    const scrollPollInterval = window.setInterval(() => {
      lastKnownScrollTopRef.current = scrollAncestorRef.current?.scrollTop;
    }, 300);

    return () => {
      // Cleared FIRST, before anything else in this cleanup — the
      // ordering is load-bearing (see scrollPollInterval's own doc
      // comment): stops any further sampling before React's own DOM
      // mutation for this switch has a chance to change what
      // scrollAncestorRef.current.scrollTop reads as.
      window.clearInterval(scrollPollInterval);

      // Captured before destroy() (which invalidates the view) — this is
      // the write side of the session cache read via
      // restoreHistoryJSON/restoreScrollEffect/domScrollTop above. Runs on
      // every unmount, including a real page switch (the common, intended
      // case) and this component's own StrictMode double-invoke in dev
      // (harmless: the second mount's own read overwrites this with the
      // same content moments later). `scrollSnapshot()` is CM6's own
      // documented capture — safe to call even if the view never
      // scrolled (captures the default/top position in that case).
      // `lastKnownScrollTopRef` (not a live read of
      // `scrollAncestorRef.current.scrollTop`) is the plain-DOM
      // counterpart that actually matters in this app's layout — see its
      // own doc comment for why a live read here is already too late.
      setCachedEditorSession(pageId, {
        historyJSON: serializeEditorHistory(view),
        scrollEffect: view.scrollSnapshot(),
        domScrollTop: lastKnownScrollTopRef.current,
      });
      // ADR-033: captured at the same unmount moment as the session
      // cache above, but written to the independent, durable
      // FoldStateStore instead — survives an app restart, not just this
      // note-switch. Optional-chained: a test call site that omits
      // foldStateStore simply doesn't persist folds, matching the
      // pre-ADR-033 baseline exactly.
      foldStateStore?.set(pageId, serializeFoldState(view));
      view.destroy();
      viewRef.current = null;
    };
    // Mounted once per pageId (React's key={activePageId} on this
    // component, in PageHost.tsx, already forces a full remount on every
    // page switch — this effect doesn't need pageId in its own deps to
    // "notice" that, matching the existing markdown-is-mount-only comment
    // below). The markdown prop's initial value seeds the view here,
    // later changes are handled by the sync effect below — matches the
    // previous implementation, where the DOM node was likewise created
    // once by JSX and only ever updated via a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    // While this editor has focus, its own document is authoritative
    // over itself — a markdown prop update here is this same editor's
    // own committed content round-tripping back through
    // onDocChange->commit()->notify()->re-render, not an external
    // change. Overwriting it in that case would clobber in-progress
    // typing and reset CM6's own undo history. Only sync from the prop
    // while genuinely unfocused, exactly as the previous contentEditable
    // implementation did via document.activeElement.
    if (view.hasFocus) {
      return;
    }

    syncMarkdownIntoView(view, markdown);
  }, [markdown]);

  const imageMenuCurrentMode = imageMenu && viewRef.current
    ? getImageUiState(viewRef.current.state, imageMenu.pos).displayMode
    : 'fill';

  return (
    <>
      <div ref={containerRef} />
      <ImageOptionsMenu
        anchor={imageMenu?.anchor ?? null}
        currentMode={imageMenuCurrentMode}
        onClose={closeImageMenu}
        onSelectMode={handleSelectImageDisplayMode}
        onCopyLink={handleCopyImageLink}
        onSetCoverImage={onSetCoverImage ? handleSetCoverImage : undefined}
        onDownload={handleDownloadImage}
        onRemove={handleRemoveImage}
      />
      <PdfEmbedMoreActions
        anchor={pdfMenu?.anchor ?? null}
        resourceId={pdfMenu?.resourceId ?? null}
        onClose={closePdfMenu}
        onRemoveEmbed={handleRemovePdfEmbed}
        onDownloadResource={onDownloadPdfResource ? handleDownloadPdfResource : undefined}
        onArchiveResource={onArchiveResource}
        onRevealResourceInFinder={onRevealResourceInFinder}
        onCopyResourcePath={onCopyResourcePath}
        resourceMoveDestinations={resourceMoveDestinations}
        onMoveResource={onMoveResource}
        onCreateFolder={onCreateFolder}
      />
      <NoteEmbedMoreActions
        anchor={noteEmbedMenu?.anchor ?? null}
        onClose={closeNoteEmbedMenu}
        onTurnIntoWikiLink={handleTurnNoteEmbedIntoWikiLink}
        onRemove={handleRemoveNoteEmbed}
      />
      <FencedCodeActionsMenu
        anchor={fencedCodeMenu?.anchor ?? null}
        onClose={closeFencedCodeMenu}
        currentRawInfo={fencedCodeMenu?.currentRawInfo}
        onChangeLanguage={handleChangeFencedCodeLanguage}
        onFormat={
          fencedCodeMenu && resolveFormatterParser(fencedCodeMenu.currentRawInfo)
            ? handleFormatFencedCode
            : undefined
        }
        onDownload={handleDownloadFencedCode}
        onRemove={handleRemoveFencedCode}
      />
    </>
  );
});
