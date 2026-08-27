/**
 * In-memory `pageId -> serialized EditorState` cache, keyed by the same
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
 * Session-lifetime, in-memory only, deliberately — not a persistence
 * mechanism. `durability-model.md`'s Committed/Durable/Reconciled stages
 * are untouched by any of this; a page's actual content still flows
 * through the existing `onEdit`/`onFlush` path exactly as before. A page
 * not currently cached here — never opened this session — simply starts
 * with fresh (empty) history, matching today's behavior exactly; this
 * cache can only ever make history preservation better than the current
 * baseline, never worse.
 *
 * **Deliberately a plain `Map` with no eviction policy** — kept minimal
 * for this first pass rather than introducing an LRU or hooking page
 * deletion (`PageOperations.delete`) to invalidate entries: the latter
 * would need this feature-layer module reachable from `core/application`,
 * which points the wrong direction relative to this codebase's
 * dependencies-point-downward rule. A stale entry for a deleted page is
 * inert, not harmful — nothing will ever look it up again by that id — so
 * it's a bounded-by-session-length memory cost, not a correctness
 * concern. Revisit only if a real session turns out to open enough
 * distinct pages for this to matter in practice.
 */
const cache = new Map<string, unknown>();

/**
 * Looks up a page's cached serialized state (from a prior
 * `setCachedEditorHistory` call, at that page's last unmount).
 * `undefined` means "no cache entry" — the caller falls back to creating
 * a fresh `EditorState`, exactly as it always has.
 */
export function getCachedEditorHistory(pageId: string): unknown | undefined {
  return cache.get(pageId);
}

/**
 * Stores a page's serialized state (`createEditorView.ts`'s
 * `serializeEditorHistory(view)`) for later restoration — called from
 * `MarkdownEditor`'s mount-effect cleanup, right before `view.destroy()`.
 */
export function setCachedEditorHistory(pageId: string, json: unknown): void {
  cache.set(pageId, json);
}

/**
 * Drops a page's cached history outright. Not currently called anywhere
 * (no existing lifecycle signal for page deletion reaches this
 * feature-layer module without crossing the dependency direction this
 * codebase enforces — see the module doc comment above); exported so a
 * future call site has something to call rather than reaching into the
 * module-private `cache`.
 */
export function clearCachedEditorHistory(pageId: string): void {
  cache.delete(pageId);
}

/** Test-only: empties the cache so tests don't leak state into each other. */
export function __clearAllCachedEditorHistoryForTests(): void {
  cache.clear();
}
