import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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
// safe to unwire. The old list-marker implementation is the one exception:
// `listMarkerDecoration.ts`, `list/listLineDecoration.ts`,
// `list/listIndentWhitespaceDecoration.ts`, and `task/taskCheckboxMouseHandlers.ts`
// were deleted outright (2026-08-28 list reset), not left dormant — list
// rendering is being rebuilt from scratch against a different architecture;
// see docs/editor-architecture-decisions.md for the research that preceded
// the reset.
import { dateMouseHandlers } from './codemirror/date/dateMouseHandlers';
// import { emojiListMarkDecoration } from './codemirror/emoji-list/emojiListMarkDecoration';
import { markdownEnterKeymap } from './codemirror/enter/markdownEnterKeymap';
import { markdownIndentKeymap } from './codemirror/indent/markdownIndentKeymap';
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
import { markdownLanguageExtension } from './codemirror/markdownLanguage';
// import { tableDecoration } from './codemirror/table/tableDecoration';
// taskCheckboxMouseHandlers.ts was deleted alongside the rest of the old
// list-marker implementation (2026-08-28 list reset) — see the wiring
// site below for why, and what needs rebuilding.
import { tagMouseHandlers } from './codemirror/tag/tagMouseHandlers';
import { wikiLinkAutocomplete } from './codemirror/wikilink/wikiLinkAutocomplete';
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
import './MarkdownEditor.css';

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
    resolveTag,
    getTagSuggestions,
    resolveDate,
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
        // strikethroughMarkerDecoration(),
        // listMarkerDecoration(),
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
        // Click-driven checkbox toggling is disabled, not just its visual
        // widget — `taskCheckboxMouseHandlers.ts` was deleted alongside the
        // rest of the old list-marker implementation (2026-08-28 list
        // reset): its click-position resolution was built specifically
        // around `listMarkerDecoration.ts`'s combined marker range, which
        // no longer exists. `taskCheckboxActivation.ts`'s own toggle logic
        // is untouched and still fully covered by its own tests — only the
        // mouse-click entry point onto it needs rebuilding, against
        // whatever the new list architecture's own marker-range concept
        // turns out to be, once task lists are reached.
        // taskCheckboxMouseHandlers(() => onFlushRef.current?.()),
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
        tagMouseHandlers(() => resolveTagRef.current),
        dateMouseHandlers(() => resolveDateRef.current),
        // Explicit Markdown Link ([label](url)) and bare-URL/Autolink
        // click-to-navigate — no injected resolver needed (unlike
        // WikiLink/Tag/Date), since opening a URL has no Vault/app-layer
        // dependency. See link/linkActivation.ts and link/urlActivation.ts.
        linkMouseHandlers(),
        urlMouseHandlers(),
        semanticCompletion(
          () => getWikiLinkSuggestionsRef.current,
          () => getTagSuggestionsRef.current
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

  return <div ref={containerRef} />;
});
