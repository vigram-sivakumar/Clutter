import type { StateEffect } from '@codemirror/state';

import type { EditorHistorySnapshot } from './createEditorView';

/**
 * In-memory `pageId -> CachedEditorSession` cache, keyed by the same
 * `activePageId` React already uses as `<MarkdownEditor key={activePageId}>`
 * (`PageHost.tsx`) — this is the state that `key` prop's remount currently
 * discards on every page switch. See docs/editor-architecture-decisions.md's
 * "Per-document CM6 undo/redo history preservation" entry for the
 * investigation this implements (verified end-to-end against the real
 * `@codemirror/state`/`commands` APIs before this was written): each
 * `EditorState.toJSON({history: historyField})` snapshot (built by
 * `createEditorView.ts`'s `captureEditorHistory`) round-trips through
 * `EditorState.fromJSON(..., {history: historyField})` with its own
 * undo/redo history *and* selection fully intact, with zero cross-document
 * leakage — confirmed directly, not assumed from the API shape.
 *
 * **`scrollEffect` (2026-08-28)** — scroll position is a view-level
 * concern, not part of `EditorState`, so it's cached alongside
 * `history` rather than inside it: `EditorView.scrollSnapshot()`
 * (CM6's own documented mechanism for exactly this — "capture the
 * current... scroll position", intended to be handed to a later
 * `EditorViewConfig.scrollTo`) is captured at the same unmount moment as
 * `history` and applied at the same mount moment, gated behind the
 * *same* stale-document check as history (see `createEditorView.ts`'s
 * `restoreHistory`/`restoreScrollEffect` doc comments) — a session is
 * restored as one unit or not at all, never partially. `StateEffect`
 * instances are plain in-memory JS objects, not required to be
 * JSON-serializable for this cache's purposes (this cache is never itself
 * serialized to a string — see "session-lifetime" below), so it's stored
 * as the live effect object, not a JSON snapshot of one.
 *
 * **`domScrollTop` (2026-08-28) — a *second*, separate scroll mechanism,
 * necessary because `scrollSnapshot()` alone does not work in this app's
 * actual layout.** Confirmed directly, in the real running app, not
 * assumed: `EditorView.scrollSnapshot()`/`scrollTo` operate exclusively
 * on `view.scrollDOM` (CM6's own internal `.cm-scroller` element — its
 * own doc comment: "this only affects the editor's own scrollable
 * element, not parents"). In Clutter's real page layout, `.cm-scroller`
 * is never itself the scrolling element — `EditorView.lineWrapping` lets
 * the editor's content grow to its full height, and the *page shell's*
 * own container (`Page.tsx`'s `.page__content`, `overflow-y: auto`) is
 * what actually scrolls. Measured directly: scrolling a 40-line document
 * left `.cm-scroller.scrollTop` at `0` throughout, while
 * `.page__content.scrollTop` moved to `409.5`. `scrollSnapshot()` was
 * kept anyway (harmless, correct per its documented contract, and would
 * become meaningful if `.cm-scroller` ever *does* become the real
 * scrolling element) — but delivering an actually-working "restore scroll
 * position" outcome needs this second, plain-DOM capture of whichever
 * ancestor is genuinely scrollable, found generically (`overflow-y: auto`
 * or `scroll`) rather than hardcoded to `.page__content`'s class name, to
 * avoid coupling this feature-layer module to `Page.tsx`'s own internal
 * DOM structure. See `MarkdownEditor.tsx`'s `findScrollableAncestor`.
 *
 * Session-lifetime, in-memory only, deliberately — not a persistence
 * mechanism. `durability-model.md`'s Committed/Durable/Reconciled stages
 * are untouched by any of this; a page's actual content still flows
 * through the existing `onEdit`/`onFlush` path exactly as before. A page
 * not currently cached here — never opened this session, or explicitly
 * cleared (see `clearCachedEditorSession` below) — simply starts with
 * fresh (empty) history and default scroll, matching today's behavior
 * exactly; this cache can only ever make session preservation better than
 * the current baseline, never worse.
 *
 * **Deliberately a plain `Map` with no eviction policy.** Assessed, not
 * assumed: a real editing session opens at most a handful to a few dozen
 * distinct pages in a sitting (this app's own daily-notes-plus-notes
 * model doesn't encourage hundreds of simultaneously-recent pages the way
 * e.g. a browser's tab history might), and each entry's dominant cost is
 * the `history` blob — proportional to how much *unsaved-in-this-
 * session* edit history that one page accumulated, not to document size.
 * A genuinely pathological session (thousands of pages touched, each with
 * a long edit history, never reloading the app) would grow this
 * unboundedly, but that's a real-world-unlikely combination worth
 * revisiting only if it's ever actually observed, not designing an LRU
 * against speculatively. `clearCachedEditorSession` (page deletion, see
 * its own call site in `PageHost.tsx`'s `onDelete`) is the only eviction
 * this cache needs today.
 */
export interface CachedEditorSession {
  /** The closed editor's history, selection and document — see `createEditorView.ts`'s `captureEditorHistory`. */
  readonly history: EditorHistorySnapshot;
  /** `EditorView.scrollSnapshot()`'s result, captured at the same moment as `history`. */
  readonly scrollEffect: StateEffect<unknown>;
  /**
   * The real scrolling ancestor's `scrollTop` (see the module doc comment's
   * `domScrollTop` section for why this exists alongside `scrollEffect`).
   * `undefined` when no scrollable ancestor was found (e.g. in a test
   * harness with no real layout) — never a fabricated `0`, so a restore
   * can distinguish "nothing to restore" from "restore to the top".
   */
  readonly domScrollTop: number | undefined;
}

const cache = new Map<string, CachedEditorSession>();

/**
 * Looks up a page's cached session (from a prior `setCachedEditorSession`
 * call, at that page's last unmount). `undefined` means "no cache entry"
 * — the caller falls back to creating a fresh `EditorState` with default
 * scroll, exactly as it always has.
 */
export function getCachedEditorSession(pageId: string): CachedEditorSession | undefined {
  return cache.get(pageId);
}

/**
 * Stores a page's session (history + scroll) for later restoration —
 * called from `MarkdownEditor`'s mount-effect cleanup, right before
 * `view.destroy()`.
 */
export function setCachedEditorSession(pageId: string, session: CachedEditorSession): void {
  cache.set(pageId, session);
}

/**
 * Drops a page's cached session outright — called when a page is permanently
 * deleted (the one truly destructive, non-reversible page action; archive
 * and restore deliberately do *not* call this, since an archived page can
 * come back and its prior editing session is still meaningful history to
 * have). The app layer's `useDeletedPageEditorCacheCleanup` calls it for
 * every permanent-delete path (a single note, a folder's subtree, Empty
 * trash, the automatic cleanup), only after the delete succeeded: this
 * feature-layer cache module cannot be imported from `core/application`
 * without pointing the dependency direction this codebase enforces the
 * wrong way, so `Application` announces the deletion and the app layer
 * bridges it.
 *
 * Best effort: an editor that is still mounted can write its entry back as
 * it unmounts. The delete has already succeeded by the time this runs, so
 * that unmount normally happens first; and a re-populated entry for a
 * deleted page is inert (its id is never looked up again), so the worst
 * case is a no-op, never incorrect behavior.
 */
export function clearCachedEditorSession(pageId: string): void {
  cache.delete(pageId);
}

/** Test-only: empties the cache so tests don't leak state into each other. */
export function __clearAllCachedEditorHistoryForTests(): void {
  cache.clear();
}
