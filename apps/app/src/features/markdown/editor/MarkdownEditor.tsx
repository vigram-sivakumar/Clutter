import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';

import {
  createEditorView,
  docTextMatches,
  hasEstablishedEditingPosition,
  serializeEditorHistory,
  syncMarkdownIntoView,
} from './codemirror/createEditorView';
import {
  getCachedEditorSession,
  setCachedEditorSession,
} from './codemirror/editorHistoryCache';
import { semanticCompletion } from './codemirror/completion';
// Visual decoration imports below are commented out alongside their usage
// further down — temporary keyboard-behavior-only configuration. See the
// disabling comments at each call site for what each one did and why it's
// safe to unwire. The old list-marker implementation was one exception:
// `listMarkerDecoration.ts`, `list/listLineDecoration.ts`,
// `list/listIndentWhitespaceDecoration.ts`, and `task/taskCheckboxMouseHandlers.ts`
// were deleted outright (2026-08-28 list reset), not left dormant — list
// rendering is being rebuilt from scratch against a different architecture;
// see docs/editor-architecture-decisions.md for the research that preceded
// the reset. `listMarkerDecoration()` (wired below) is the first slice of
// that rebuild — bullet (`-`/`*`/`+`) markers only, built on the shared
// `liveMarkDecoration` mechanism rather than the old bespoke ViewPlugin.
// Ordered lists, task checklists, and hanging-indent/line-level list
// decoration remain unimplemented; leading indentation for nested bullets
// is already handled, construct-agnostically, by `leadingIndentDecoration.ts`.
import { dateAutocomplete } from './codemirror/date/dateAutocomplete';
import { dateMouseHandlers } from './codemirror/date/dateMouseHandlers';
// import { emojiListMarkDecoration } from './codemirror/emoji-list/emojiListMarkDecoration';
import { markdownEnterKeymap } from './codemirror/enter/markdownEnterKeymap';
import { markdownIndentKeymap } from './codemirror/indent/markdownIndentKeymap';
import { orderedListStructuralNormalization } from './codemirror/list/orderedListStructuralNormalization';
import { formatShortcutsKeymap } from './codemirror/format/formatShortcutsKeymap';
import { blockquoteLineDecoration } from './codemirror/highlight/blockquoteLineDecoration';
import { blockquoteMarkerDecoration } from './codemirror/highlight/blockquoteMarkerDecoration';
// import { emphasisMarkerDecoration } from './codemirror/highlight/emphasisMarkerDecoration';
import { headingMarkerDecoration } from './codemirror/highlight/headingMarkerDecoration';
import { createInlineLivePreviewParticipants } from './codemirror/highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './codemirror/highlight/inlineLivePreviewRegion';
import { leadingIndentDecoration } from './codemirror/highlight/leadingIndentDecoration';
import { linkMouseHandlers } from './codemirror/link/linkMouseHandlers';
import { urlMouseHandlers } from './codemirror/link/urlMouseHandlers';
import { listMarkerCaretAssoc, listMarkerDecoration } from './codemirror/list/listMarkerDecoration';
import { taskCheckboxDecoration } from './codemirror/task/taskCheckboxDecoration';
import { taskCheckboxMouseHandlers } from './codemirror/task/taskCheckboxMouseHandlers';
import { taskCompletionMetadataDecoration } from './codemirror/task/taskCompletionMetadataDecoration';
// The liveMarkDecoration-based marker decorations still dormant here
// (emphasis, strikethrough — plus blockquote/list, which stay on
// liveMarkDecoration permanently per ODR §4.10) carry the
// still-undecided liveMarkSelectionSnap transactionFilter. Heading is
// wired below (re-enabled alongside horizontalRuleDecoration) — its
// liveMarkSelectionSnap wiring comes bundled from the same
// liveMarkDecoration() factory call, unchanged. Highlight,
// InlineCode, Tag, and Date's own liveMarkDecoration/
// semanticTokenDecorations-based modules were retired outright (not left
// dormant) once inlineLivePreviewRegion() took over their inline
// visibility — see docs/editor-research/inline-live-preview-region-odr-v1.md.
// WikiLink's own at-rest widget went through the same path, but its
// engaged-state behavior now lives outside inlineLivePreviewRegion
// entirely, in wikiLinkLivePreview.ts (see that file's doc comment).
// import { strikethroughMarkerDecoration } from './codemirror/highlight/strikethroughMarkerDecoration';
import { horizontalRuleDecoration } from './codemirror/hr/horizontalRuleDecoration';
import { computeImageDeletionRange } from './codemirror/image/imageDeletion';
import { ImageOptionsMenu } from './codemirror/image/ImageOptionsMenu';
import type { OnImageClick, OnOpenImageMenu } from './codemirror/image/ImageWidget';
import { ImageOverlay, type ImageOverlayImage } from './codemirror/image/ImageOverlay';
import { imageLivePreview } from './codemirror/image/imageLivePreview';
import { embedLivePreview } from './codemirror/embed/embedLivePreview';
import type { OnOpenPdfMenu, OnPdfEmbedClick } from './codemirror/pdf/PdfEmbedWidget';
import { PdfEmbedMoreActions, type PdfEmbedMoreActionsAnchor } from './codemirror/pdf/PdfEmbedMoreActions';
import { getImageUiState, presentationOnlyEdit, setImageUiState, type ImageDisplayMode } from './codemirror/image/imageUiState';
import { getImagePresentation, computeImagePresentationUpdate } from './codemirror/mediaPresentation/mediaPresentationUpdate';
import { markdownLanguageExtension } from './codemirror/markdownLanguage';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
// import { tableDecoration } from './codemirror/table/tableDecoration';
// taskCheckboxMouseHandlers.ts was deleted alongside the rest of the old
// list-marker implementation (2026-08-28 list reset) and rebuilt in the
// task visual-rendering slice (2026-08-31) — see the wiring site below.
import { tagAutocomplete } from './codemirror/tag/tagAutocomplete';
import { tagMouseHandlers } from './codemirror/tag/tagMouseHandlers';
import { wikiLinkAutocomplete } from './codemirror/wikilink/wikiLinkAutocomplete';
import { embedAutocomplete } from './codemirror/embed/embedAutocomplete';
import { wikiLinkLivePreview } from './codemirror/wikilink/wikiLinkLivePreview';
import { wikiLinkMouseHandlers } from './codemirror/wikilink/wikiLinkMouseHandlers';
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
// The inline image widget's own floating controls (ImageWidget.ts, raw CM6
// DOM) style themselves via `.cm-image-controls`/`.cm-image-control` —
// MarkdownEditor.css only carries this file's own CM6-specific rules on
// top of those classes now; the shared chrome itself lives here, imported
// explicitly so the inline widget's styling doesn't depend on whichever
// other component happens to import it (currently ImageOverlay, but that's
// an implementation detail this file's own raw-DOM consumer shouldn't rely
// on transitively).
import './codemirror/image/ImageFloatingControls.css';

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
    onEdit,
    onFlush,
    resolveWikiLink,
    getWikiLinkSuggestions,
    getEmbedSuggestions,
    resolveEmbedImage,
    resolveEmbedPdf,
    onPdfEmbedClick,
    resolveImageSrc,
    resolveTag,
    getTagSuggestions,
    resolveDate,
    onSetCoverImage,
    onDownloadImage,
    resolveImageResource,
    onArchiveResource,
    onRevealResourceInFinder,
    onCopyResourcePath,
    onDownloadResource,
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

  // Same freshness pattern, for Embed's live-preview rendering accessor below.
  const resolveEmbedImageRef = useRef(resolveEmbedImage);
  resolveEmbedImageRef.current = resolveEmbedImage;

  // Same freshness pattern, for Embed's PDF-branch live-preview rendering
  // accessor below (Stage 2 — see embedLivePreview.ts's own doc comment).
  const resolveEmbedPdfRef = useRef(resolveEmbedPdf);
  resolveEmbedPdfRef.current = resolveEmbedPdf;
  const onPdfEmbedClickRef = useRef<OnPdfEmbedClick | undefined>(onPdfEmbedClick);
  onPdfEmbedClickRef.current = onPdfEmbedClick;

  // Same freshness pattern, for standard Image's own live-preview local-
  // path resolution accessor below.
  const resolveImageSrcRef = useRef(resolveImageSrc);
  resolveImageSrcRef.current = resolveImageSrc;

  // Image's lightbox — local, presentational state (unlike
  // resolveWikiLink/resolveTag/resolveDate above, opening an overlay for
  // an already-resolved image URL needs no Vault/PageOperations access,
  // so it's owned entirely inside this component rather than composed in
  // the app layer). Same freshness-ref pattern as every other accessor
  // here: the extension is built once at mount and reads this getter
  // fresh per click, so the setState setter identity (already stable,
  // guaranteed by React) never needs the extension itself rebuilt.
  const [imageOverlay, setImageOverlay] = useState<ImageOverlayImage | null>(null);
  // Same freshness pattern as resolveEmbedImageRef above — this one IS an
  // injected Vault-backed boundary function (unlike opening the overlay
  // itself, which needs none): resolving "does this image have a local
  // VaultResource behind it" is what gates ImageOverlay's own More Actions
  // control (see imageResourceResolution.ts's doc comment).
  const resolveImageResourceRef = useRef(resolveImageResource);
  resolveImageResourceRef.current = resolveImageResource;
  const onImageClickRef = useRef<OnImageClick>((url, alt, copyUrl) => {
    const resource = resolveImageResourceRef.current?.(copyUrl ?? url);
    setImageOverlay({ url, alt, resourceId: resource?.resourceId, copyUrl });
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
    button.classList.toggle('cm-image-control--active', open);
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
  } | null>(null);

  function setPdfMenuButtonOpen(button: HTMLElement, open: boolean) {
    button.classList.toggle('cm-image-control--active', open);
    button.setAttribute('aria-expanded', String(open));
  }

  const onOpenPdfMenuRef = useRef<OnOpenPdfMenu>(({ anchor, resourceId }) => {
    setPdfMenu((current) => {
      const closingSame = current !== null && current.anchor.current === anchor;
      if (current) {
        setPdfMenuButtonOpen(current.anchor.current, false);
      }
      if (!closingSame) {
        setPdfMenuButtonOpen(anchor, true);
      }
      return closingSame ? null : { anchor: { current: anchor }, resourceId };
    });
  });

  const closePdfMenu = () => {
    if (pdfMenu) {
      setPdfMenuButtonOpen(pdfMenu.anchor.current, false);
    }
    setPdfMenu(null);
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

  // ImageOverlay's own "Set as cover image" — same rule as
  // handleSetCoverImage above (copyUrl, the vault-relative embed path, when
  // present; otherwise the raw url), just reading imageOverlay's state
  // instead of imageMenu's.
  const handleSetCoverImageFromOverlay = () => {
    if (!imageOverlay) {
      return;
    }
    onSetCoverImage?.(imageOverlay.copyUrl ?? imageOverlay.url);
  };

  // Same copyUrl-vs-url rule as handleSetCoverImage above — reads
  // imageMenu's state (the inline size/options menu), not imageOverlay's
  // (ImageOverlay's own Download is a separate, resourceId-based prop —
  // see ImageOverlay.tsx's onDownloadResource).
  const handleDownloadImage = () => {
    if (!imageMenu) {
      return;
    }
    onDownloadImage?.(imageMenu.copyUrl ?? imageMenu.url);
  };

  const handleDeleteImage = () => {
    const view = viewRef.current;
    if (!imageMenu || !view) {
      return;
    }
    const { from, to } = computeImageDeletionRange(view.state, imageMenu.pos);
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
      extensions: [
        // Still CodeMirror's own keyboard behavior for Delete/Arrow keys —
        // no Clutter interception there. Enter, Backspace, and (2026-08-28)
        // Tab/Shift-Tab are the exceptions. Enter/Backspace:
        // markdownEnterKeymap() below, in place of the markdownKeymap that
        // markdownLanguageExtension() deliberately no longer installs
        // (addKeymap: false) — Backspace identically (deleteMarkupBackward),
        // Enter differing only in the empty-continuation policy documented
        // in that file. Tab/Shift-Tab: markdownIndentKeymap() — a
        // construct-aware replacement for `createEditorView.ts`'s own
        // generic `indentMore`/`indentLess` (`indentWithTab`), scoped this
        // milestone to plain paragraphs and single-line list items only;
        // every other construct (heading, blockquote, code, tables, …)
        // still falls through to that same generic behavior, unchanged —
        // see markdownIndentKeymap.ts's own doc comment for exactly which
        // constructs are, and aren't, handled yet.
        markdownLanguageExtension(),
        markdownEnterKeymap(),
        markdownIndentKeymap(),
        // Transaction-level ordered-list membership renumbering
        // (2026-08-31) — fires on *any* document-changing transaction
        // (Enter, Backspace, Delete, selection-delete, raw edits),
        // regardless of which command produced it, complementing
        // Tab/Shift-Tab's own (markdownIndentKeymap above) and Space's
        // own (wired inside markdownEnterKeymap) narrower, command-scoped
        // normalization. See
        // codemirror/list/orderedListStructuralNormalization.ts's own
        // doc comment for the full rationale and the transactionFilter
        // composition/idempotence guarantees.
        orderedListStructuralNormalization(),
        // --- Temporarily unwired: purely visual Live Preview decorations ---
        // Every extension below this line, up to the next "--- end ---"
        // marker, was checked for behavioral coupling (keymap registration,
        // EditorView.atomicRanges, transactionFilter) before being disabled.
        // None of them have any — confirmed by grepping each file. Nothing
        // deleted or rewritten; uncomment to restore. See the accompanying
        // report for the full per-extension classification.
        // emphasisMarkerDecoration(),
        // The single authoritative inline Live Preview visibility
        // mechanism — Emphasis, StrongEmphasis, Strikethrough, Highlight,
        // InlineCode (marker-hiding), plus WikiLink, Tag, Date
        // (widget-replace, Phase 3) — per
        // docs/editor-research/inline-live-preview-region-odr-v1.md.
        // Replaces the previously separate per-construct plugins: an
        // independent traversal per construct could each decide
        // engagement only for its own node kinds, so a caret between an
        // outer and inner delimiter (`~~__Text__~~`) revealed the outer
        // construct while the inner stayed concealed. Visibility now
        // resolves per nested *region*, not per construct. Resolvers are
        // threaded through as stable getter closures (same freshness
        // pattern as onEdit/onFlush below), so the extension is never
        // rebuilt when a resolver changes. `atomicRanges` is derived from
        // the same single traversal, scoped to the widget-replace family
        // only (ODR §10 Phase 3) — ordinary marks never atomic, widgets
        // atomic only at rest. `Task` is deliberately not a participant:
        // its checkbox rendering is fused into block-level
        // listMarkerDecoration/'physical-line' engagement, out of scope
        // per ODR §4.10 (the ODR's own §10 Phase 3 text naming Task is a
        // recorded erratum, not implemented). Adding a participant is a
        // registry entry in inlineLivePreviewParticipants.ts — never a
        // change here or to another construct (ODR §4.8).
        inlineLivePreviewRegion(
          createInlineLivePreviewParticipants({
            resolveTag: () => resolveTagRef.current,
            resolveDate: () => resolveDateRef.current,
          })
        ),
        // WikiLink's own standalone visibility mechanism — not a
        // participant above. Its required behavior (the folder-qualified
        // path must never be visible, engaged or not) is not an instance
        // of inlineLivePreviewRegion's reveal-on-engage contract, so it
        // isn't governed by that shared traversal at all. See
        // wikilink/wikiLinkLivePreview.ts's own doc comment.
        wikiLinkLivePreview(() => resolveWikiLinkRef.current),
        // Image's own standalone visibility mechanism — not a participant
        // above (see inlineLivePreviewParticipants.ts's own comment).
        // Required behavior: the rendered image must never be replaced by
        // raw Markdown just because the caret enters it; only its own
        // edit/source control does that, and even then the image stays
        // rendered alongside the now-editable source. See
        // image/imageLivePreview.ts's own doc comment.
        imageLivePreview(
          () => onImageClickRef.current,
          () => onOpenImageMenuRef.current,
          () => resolveImageSrcRef.current
        ),
        // Resource embed rendering — shares ImageWidget/the image overlay/
        // options menu wholesale with the standard-image extension above
        // (see embed/embedLivePreview.ts's own doc comment for why this is
        // a separate ViewPlugin keyed on the `Embed` node rather than a
        // change to imageLivePreview.ts itself).
        embedLivePreview(
          () => resolveEmbedImageRef.current,
          () => onImageClickRef.current,
          () => onOpenImageMenuRef.current,
          () => resolveEmbedPdfRef.current,
          () => onPdfEmbedClickRef.current,
          () => onOpenPdfMenuRef.current
        ),
        // strikethroughMarkerDecoration(),
        // Bullet (-/*/+) marker rendering only — the first slice of the
        // list-rendering rebuild (2026-08-28 reset, see the comment near
        // this file's top). Built on liveMarkDecoration, same mechanism as
        // headingMarkerDecoration()/blockquoteMarkerDecoration() above.
        // Ordered lists are still unrendered; a future slice adds them
        // alongside line/hanging-indent decoration (listLineDecoration(),
        // not yet reimplemented). Task checklists are rendered separately
        // below, via taskCheckboxDecoration() — deliberately not folded
        // into this function: `listMarkerDecoration.ts`'s own glyph-paint
        // mechanism (real 1-char marker, transparent text + `::before`)
        // cannot cleanly collapse `TaskMarker`'s fixed 3-character source
        // range to one visual glyph; the checkbox needs a real
        // `Decoration.replace`/`WidgetType`, matching WikiLink/Tag/Date's
        // own at-rest widget mechanism instead. `listMarkerDecoration.ts`
        // itself is unchanged — its own `hasTaskChild` check still
        // excludes task items from bullet-glyph rendering, unaffected.
        listMarkerDecoration(),
        // TEMPORARY PROTOTYPE — fixes ArrowRight's caret-rendering
        // asymmetry at a bullet item's content-start position; see
        // listMarkerDecoration.ts's own doc comment on listMarkerCaretAssoc.
        listMarkerCaretAssoc(),
        // Task checklist visual rendering (2026-08-31): the checkbox
        // widget (`☐`/`☑`, replacing the raw `[ ]`/`[x]` — TaskMarker
        // itself stays in the document) plus concealment of the outer
        // list marker for task items only, and separately, permanent
        // concealment of `@completed:<date>` inline metadata. See
        // taskCheckboxDecoration.ts's own doc comment for why this is a
        // real Decoration.replace/WidgetType/atomicRanges construct, not
        // an extension of listMarkerDecoration()'s glyph-paint mechanism.
        taskCheckboxDecoration(),
        taskCompletionMetadataDecoration(),
        // listLineDecoration(),
        // listIndentWhitespaceDecoration(),
        // emojiListMarkDecoration(),
        blockquoteMarkerDecoration(),
        blockquoteLineDecoration(),
        headingMarkerDecoration(),
        // tok-heading1-6 content classing is now emitted directly by
        // inlineLivePreviewRegion() above (see its own doc comment) —
        // folded into the same shared decoration source rather than a
        // second, independent syntaxHighlighting() extension, so it
        // composes correctly with Highlight/Emphasis/Link/etc. nested
        // inside a heading. No separate registration needed here.
        horizontalRuleDecoration(),
        leadingIndentDecoration(),
        formatShortcutsKeymap(),
        // tableDecoration(),
        // --- end purely-visual decorations ---
        // Reuses the exact same onFlush callback already wired to blur
        // below (PageOperations.requestSave, via SaveCoordinator) — a
        // checkbox toggle is instant, single-click feedback a user expects
        // to see reflected everywhere (the sidebar) immediately, unlike
        // ordinary typing, which should keep using the normal debounced
        // autosave. See taskCheckboxActivation.ts's own doc comment.
        // Rebuilt (2026-08-31, task visual-rendering slice) on the exact
        // same generic tokenMouseHandlers mechanism WikiLink/Tag/Date
        // already use below — not a new click-resolution mechanism, and
        // not coupled to listMarkerDecoration.ts's own marker range at
        // all (that coupling was the old, deleted implementation's own
        // design, not repeated here).
        taskCheckboxMouseHandlers(() => onFlushRef.current?.()),
        // Kept: click activation is product interaction (open/toggle),
        // not cursor behavior, and works independently of the decorations
        // above (it reads the syntax tree directly, not the rendered
        // widget). `*SelectionSnap()` was removed in the cursor/selection
        // behavior reset — it existed only to correct a drag-selection
        // endpoint landing inside an at-rest widget's rendered footprint,
        // which requires that widget to actually render; with the
        // decorations above off, it had nothing left to compensate for
        // and was overriding CM6's own default selection placement on
        // plain, fully-editable raw Markdown text. See
        // `semanticToken/tokenSelectionSnap.ts`'s own doc comment and
        // docs/editor-architecture-decisions.md for the full record.
        wikiLinkMouseHandlers(() => resolveWikiLinkRef.current),
        wikiLinkAutocomplete(),
        embedAutocomplete(),
        tagMouseHandlers(() => resolveTagRef.current),
        tagAutocomplete(),
        dateMouseHandlers(() => resolveDateRef.current),
        dateAutocomplete(),
        // Explicit Markdown Link ([label](url)) and bare-URL/Autolink
        // click-to-navigate — no injected resolver needed (unlike
        // WikiLink/Tag/Date), since opening a URL has no Vault/app-layer
        // dependency. See link/linkActivation.ts and link/urlActivation.ts.
        linkMouseHandlers(),
        urlMouseHandlers(),
        semanticCompletion(
          () => getWikiLinkSuggestionsRef.current,
          () => getTagSuggestionsRef.current,
          () => getEmbedSuggestionsRef.current
        ),
      ],
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
      <ImageOverlay
        image={imageOverlay}
        onClose={() => setImageOverlay(null)}
        onArchiveResource={onArchiveResource}
        onRevealResourceInFinder={onRevealResourceInFinder}
        onCopyResourcePath={onCopyResourcePath}
        onDownloadResource={onDownloadResource}
        resourceMoveDestinations={resourceMoveDestinations}
        onMoveResource={onMoveResource}
        onCreateFolder={onCreateFolder}
        onSetCoverImage={onSetCoverImage ? handleSetCoverImageFromOverlay : undefined}
      />
      <ImageOptionsMenu
        anchor={imageMenu?.anchor ?? null}
        currentMode={imageMenuCurrentMode}
        onClose={closeImageMenu}
        onSelectMode={handleSelectImageDisplayMode}
        onCopyLink={handleCopyImageLink}
        onSetCoverImage={onSetCoverImage ? handleSetCoverImage : undefined}
        onDownload={handleDownloadImage}
        onDelete={handleDeleteImage}
      />
      <PdfEmbedMoreActions
        anchor={pdfMenu?.anchor ?? null}
        resourceId={pdfMenu?.resourceId ?? null}
        onClose={closePdfMenu}
        onArchiveResource={onArchiveResource}
        onRevealResourceInFinder={onRevealResourceInFinder}
        onCopyResourcePath={onCopyResourcePath}
        resourceMoveDestinations={resourceMoveDestinations}
        onMoveResource={onMoveResource}
        onCreateFolder={onCreateFolder}
      />
    </>
  );
});
