import type { StateEffect } from '@codemirror/state';

/**
 * In-memory `pageId -> CachedEditorSession` cache, keyed by the same
 * `activePageId` React already uses as `<MarkdownEditor key={activePageId}>`
 * (`PageHost.tsx`) — this is the state that `key` prop's remount currently
 * discards on every page switch. See docs/editor-architecture-decisions.md's
 * "Per-document CM6 undo/redo history preservation" entry for the
 * investigation this implements (verified end-to-end against the real
 * `@codemirror/state`/`commands` APIs before this was written): each
 * `EditorState.toJSON({history: historyField})` snapshot (built by
 * `createEditorView.ts`'s `serializeEditorHistory`) round-trips through
 * `EditorState.fromJSON(..., {history: historyField})` with its own
 * undo/redo history *and* selection fully intact, with zero cross-document
 * leakage — confirmed directly, not assumed from the API shape.
 *
 * **`scrollEffect` (2026-08-28)** — scroll position is a view-level
 * concern, not part of `EditorState`, so it's cached alongside
 * `historyJSON` rather than inside it: `EditorView.scrollSnapshot()`
 * (CM6's own documented mechanism for exactly this — "capture the
 * current... scroll position", intended to be handed to a later
 * `EditorViewConfig.scrollTo`) is captured at the same unmount moment as
 * `historyJSON` and applied at the same mount moment, gated behind the
 * *same* stale-document check as history (see `createEditorView.ts`'s
 * `restoreHistoryJSON`/`restoreScrollEffect` doc comments) — a session is
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
 * the `historyJSON` blob — proportional to how much *unsaved-in-this-
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
  /** `EditorState.toJSON({history: historyField})` — see `createEditorView.ts`'s `serializeEditorHistory`. */
  readonly historyJSON: unknown;
  /** `EditorView.scrollSnapshot()`'s result, captured at the same moment as `historyJSON`. */
  readonly scrollEffect: StateEffect<unknown>;
  /**
   * The real scrolling ancestor's `scrollTop` (see the module doc comment's
   * `domScrollTop` section for why this exists alongside `scrollEffect`).
   * `undefined` when no scrollable ancestor was found (e.g. in a test
   * harness with no real layout) — never a fabricated `0`, so a restore
   * can distinguish "nothing to restore" from "restore to the top".
   */
  readonly domScrollTop: number | undefined;
  /**
   * Whether `EditorView.hasFocus` was `true` at the moment this session
   * was captured (unmount). Deliberately DOM-focus, not
   * `EditorState`-derived: focus belongs to `EditorView`/the DOM and is
   * never restored by `EditorState.fromJSON` (unlike `historyJSON`, which
   * carries selection along with it automatically) — see
   * `docs/editor-architecture-decisions.md`'s "Focus restoration" entry
   * for the investigation this implements. Read by `MarkdownEditor.tsx`'s
   * mount effect to decide whether to call `view.focus()` after restoring
   * state — restoring a page that was never focused must not focus it,
   * so this can't be inferred from "a cache entry exists."
   */
  readonly wasFocused: boolean;
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
 * Drops a page's cached session outright — called from `PageHost.tsx`'s
 * `onDelete` (the one truly destructive, non-reversible page action;
 * `onArchive`/`onRestore` deliberately do *not* call this, since an
 * archived page can come back and its prior editing session is still
 * meaningful history to have). `PageHost.tsx` is the right place to call
 * this from, not `PageOperations.delete()` itself: this feature-layer
 * cache module cannot be imported from `core/application` without
 * pointing the dependency direction this codebase enforces the wrong
 * way, but `PageHost.tsx` (app layer) already legitimately depends on
 * both `core` (via `application.pageOperations`) and this feature's
 * `MarkdownEditor`, so it's the natural, already-existing bridge —  no
 * new event/subscription mechanism needed.
 *
 * **Known, accepted race, not solved here:** `pageOperations.delete()` is
 * async and (per the app's own navigation behavior) typically triggers
 * navigating away from the deleted page, which unmounts that page's
 * `MarkdownEditor` — whose own cleanup calls `setCachedEditorSession`
 * again, *after* this clear runs. If that unmount happens after this
 * call, the entry gets silently re-populated. This is judged acceptable
 * rather than worth solving with added coordination: a re-populated entry
 * for a deleted page is exactly as inert as if this function were never
 * called at all — the deleted page's id will never be looked up again
 * through normal navigation — so the race can only ever make this
 * best-effort cleanup a no-op in the worst case, never cause incorrect
 * behavior.
 */
export function clearCachedEditorSession(pageId: string): void {
  cache.delete(pageId);
}

/** Test-only: empties the cache so tests don't leak state into each other. */
export function __clearAllCachedEditorHistoryForTests(): void {
  cache.clear();
}
