import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * A single note's persisted fold state (ADR-033). `doc` is the exact
 * Markdown source at the moment `fold` was captured — the staleness guard
 * a restore is checked against via `createEditorView.ts`'s
 * `docTextMatches`, reused unchanged since this shape (`{doc, fold}`) is
 * exactly what that function already expects. `fold` is CM6's own
 * `foldState` field's serialized shape: a flat `[from, to, from, to, ...]`
 * array, produced/consumed by `@codemirror/language`'s built-in
 * `toJSON`/`fromJSON` for that field — no custom (de)serialization needed
 * on this side.
 */
export interface PersistedFoldEntry {
  readonly doc: string;
  readonly fold: readonly number[];
}

/**
 * Owns two top-level keys of `.clutter/workspace.json` end-to-end —
 * `foldState`/`embedCollapse` — mirroring the shape `TagOperations` already
 * establishes for `.clutter/tags.json` (ADR-033). Persists per-`pageId` CM6
 * fold ranges (and the embed-collapse flag, see below). Deliberately not a
 * method on `Workspace` — `Workspace` is zero-dependency, in-memory-only
 * navigation state by explicit, twice-reaffirmed design (ADR-006,
 * ADR-021), and fold state is editor content state, not navigation state.
 * See ADR-033 for the full rationale, including why this is not merged
 * into `editorHistoryCache` (session-lifetime only, deliberately not a
 * persistence mechanism) and why this does not go through the Persistence
 * Gate (`.clutter/*` is out of the Gate's scope — ARCHITECTURE_RULES.md
 * rule 2).
 *
 * In-memory-authoritative for its own two keys, not read-merge-write per
 * call (unlike `TagOperations.updateMetadata`): this store is the sole
 * owner of `entries`/`embedCollapse` for the entire session, loaded once
 * at boot via `load()`, so every `set()` serializes those two straight
 * from memory. It no longer caches a boot-time snapshot of *other*
 * top-level keys, though: `.clutter/workspace.json` gained a second
 * independent writer (`CollectionViewConfigStore`'s `collectionViewConfig`
 * key), so `persist()` layers its own two keys onto whatever the file
 * freshly holds via `mergeAndWriteWorkspaceStateFile` instead — see that
 * function's own doc comment for why a cached snapshot is no longer safe
 * once a second writer exists.
 */
export class FoldStateStore {
  private readonly entries: Map<string, PersistedFoldEntry>;
  /**
   * ADR-033's second amendment — the outer "collapse this whole embedded
   * note card" toggle (`NoteEmbedWidget.ts`'s own chevron, backed by
   * `ImageUiState.collapsed` in the *host* document's `imageUiStateField`
   * — a completely different mechanism from CM6's `foldState`, confirmed
   * by direct investigation; see that ADR amendment for the full account).
   * Keyed `hostPageId -> embeddedPageId -> collapsed`, deliberately a
   * second, independent map — never merged into `entries` above — so a
   * write to one can never race-clobber the other: `MarkdownEditor.tsx`'s
   * unmount cleanup writes `entries` (the host's own top-level fold) and
   * `NoteEmbedWidget`'s collapse-toggle click writes this map, and both
   * can fire for the *same* `hostPageId` in either order without either
   * write ever seeing (or needing to merge into) the other's data — they
   * are simply two separate in-memory structures serialized together.
   */
  private readonly embedCollapse: Map<string, Map<string, boolean>>;

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    entries: Map<string, PersistedFoldEntry>,
    embedCollapse: Map<string, Map<string, boolean>>
  ) {
    this.entries = entries;
    this.embedCollapse = embedCollapse;
  }

  /**
   * An empty store with no persisted entries — `Application`'s constructor
   * default, for the many existing tests that construct `Application`
   * directly without exercising fold-state persistence. Real boot always
   * goes through `load()` instead (see `Application.bootstrap()`).
   */
  static empty(fileSystem: VaultFileSystem, rootPath: string): FoldStateStore {
    return new FoldStateStore(fileSystem, rootPath, new Map(), new Map());
  }

  /**
   * Reads `.clutter/workspace.json` once, at boot — tolerant of a missing
   * file (fresh vault, or a vault predating this feature: falls back to
   * `EMPTY_WORKSPACE_STATE_FILE_CONTENTS`) and of malformed JSON or a
   * malformed `foldState` shape (caught and discarded, per-entry where
   * possible, logged via `console.warn`, never thrown — ADR-033's Failure
   * behavior section: a corrupted persisted file must never block the app
   * from starting).
   */
  static async load(fileSystem: VaultFileSystem, rootPath: string): Promise<FoldStateStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `FoldStateStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with empty fold state.`
      );
      return new FoldStateStore(fileSystem, rootPath, new Map(), new Map());
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `FoldStateStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with empty fold state.`
      );
      return new FoldStateStore(fileSystem, rootPath, new Map(), new Map());
    }

    const { foldState, embedCollapse: rawEmbedCollapse } = parsed as Record<string, unknown>;
    const entries = new Map<string, PersistedFoldEntry>();

    if (foldState !== undefined) {
      if (typeof foldState !== 'object' || foldState === null || Array.isArray(foldState)) {
        console.warn(
          `FoldStateStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "foldState" is not an object — discarding it.`
        );
      } else {
        for (const [pageId, rawEntry] of Object.entries(foldState as Record<string, unknown>)) {
          const entry = parseFoldEntry(rawEntry);
          if (entry) {
            entries.set(pageId, entry);
          } else {
            console.warn(
              `FoldStateStore: discarding malformed persisted fold entry for page "${pageId}".`
            );
          }
        }
      }
    }

    const embedCollapse = new Map<string, Map<string, boolean>>();

    if (rawEmbedCollapse !== undefined) {
      if (typeof rawEmbedCollapse !== 'object' || rawEmbedCollapse === null || Array.isArray(rawEmbedCollapse)) {
        console.warn(
          `FoldStateStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "embedCollapse" is not an object — discarding it.`
        );
      } else {
        for (const [hostPageId, rawHostEntry] of Object.entries(rawEmbedCollapse as Record<string, unknown>)) {
          const hostMap = parseEmbedCollapseHostEntry(rawHostEntry);
          if (hostMap) {
            embedCollapse.set(hostPageId, hostMap);
          } else {
            console.warn(
              `FoldStateStore: discarding malformed persisted embed-collapse entry for host page "${hostPageId}".`
            );
          }
        }
      }
    }

    return new FoldStateStore(fileSystem, rootPath, entries, embedCollapse);
  }

  /**
   * A page's persisted fold entry, or `undefined` if none exists —
   * `createEditorView.ts`'s `restoreFoldJSON` option is validated against
   * the current document with the same `docTextMatches` check history
   * restoration already uses, so a stale entry (content changed since
   * capture) is simply never restored, not returned as invalid here.
   */
  get(pageId: string): PersistedFoldEntry | undefined {
    return this.entries.get(pageId);
  }

  /**
   * Records `pageId`'s current fold state and persists the whole store —
   * called from `MarkdownEditor.tsx`'s unmount cleanup, alongside (but
   * independent of) `editorHistoryCache.ts`'s `setCachedEditorSession`.
   * Fire-and-forget: the caller (a React effect cleanup, which cannot be
   * async) does not await this — a lost write on an abrupt process kill is
   * an accepted, rare edge case (the same shape TagOperations' writes
   * already accept), not one this store adds new coordination to guard.
   */
  set(pageId: string, entry: PersistedFoldEntry): void {
    this.entries.set(pageId, entry);
    void this.persist();
  }

  /**
   * Drops a page's persisted fold entry outright — mirrors
   * `editorHistoryCache.ts`'s `clearCachedEditorSession`, for the same
   * page-deletion call site (`PageHost.tsx`'s `onDelete`), so a deleted
   * page's fold state doesn't linger in `.clutter/workspace.json`
   * indefinitely. Also drops `pageId`'s own `embedCollapse` entries (the
   * embeds *it* hosts) — a deleted page can no longer host anything. Does
   * *not* scrub `pageId` out of some *other* host's `embedCollapse` map
   * (i.e. a since-deleted page that used to be embedded elsewhere): the
   * same accepted-staleness posture `clearCachedEditorSession` itself
   * documents — an orphaned entry is inert, never looked up again in a
   * way that produces incorrect behavior, not worth a second cross-host
   * scan to prevent.
   */
  clear(pageId: string): void {
    const hadEntry = this.entries.delete(pageId);
    const hadEmbedCollapse = this.embedCollapse.delete(pageId);
    if (hadEntry || hadEmbedCollapse) {
      void this.persist();
    }
  }

  /**
   * The persisted "is this embed collapsed" flag for `embeddedPageId` as
   * rendered inside `hostPageId`'s own document — `undefined` when never
   * toggled (the ordinary default: expanded). See this class's own
   * `embedCollapse` field doc comment for why this is a wholly separate
   * map from `entries`/`get`/`set` above, not a field folded into
   * `PersistedFoldEntry`.
   */
  getEmbedCollapse(hostPageId: string, embeddedPageId: string): boolean | undefined {
    return this.embedCollapse.get(hostPageId)?.get(embeddedPageId);
  }

  /**
   * Records whether `embeddedPageId`'s embed card is currently collapsed
   * within `hostPageId`'s own document, and persists the whole store.
   * Called directly from `NoteEmbedWidget.ts`'s collapse-toggle click
   * handler — unlike CM6 fold state (only ever capturable at `destroy()`,
   * since it has no single discrete "user action" moment to hook), the
   * collapse toggle already has one (the click itself), so this writes
   * immediately rather than waiting for the widget to be torn down.
   * Fire-and-forget, same acceptance as `set()` above.
   */
  setEmbedCollapse(hostPageId: string, embeddedPageId: string, collapsed: boolean): void {
    let hostMap = this.embedCollapse.get(hostPageId);
    if (!hostMap) {
      hostMap = new Map();
      this.embedCollapse.set(hostPageId, hostMap);
    }
    hostMap.set(embeddedPageId, collapsed);
    void this.persist();
  }

  /**
   * Writes `foldState`/`embedCollapse` via `mergeAndWriteWorkspaceStateFile`
   * — reading the file's other top-level keys fresh immediately before
   * writing, rather than from a boot-time snapshot — so a concurrent write
   * from `CollectionViewConfigStore` (a second, independent owner of a
   * sibling key in this same file) is never clobbered by this store
   * persisting a stale copy of it, and vice versa. See that function's own
   * doc comment for the full rationale.
   */
  private async persist(): Promise<void> {
    const foldState: Record<string, PersistedFoldEntry> = {};
    for (const [pageId, entry] of this.entries) {
      foldState[pageId] = entry;
    }
    const embedCollapse: Record<string, Record<string, boolean>> = {};
    for (const [hostPageId, hostMap] of this.embedCollapse) {
      embedCollapse[hostPageId] = Object.fromEntries(hostMap);
    }

    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      foldState,
      embedCollapse,
    });
  }
}

function parseFoldEntry(raw: unknown): PersistedFoldEntry | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const { doc, fold } = raw as { doc?: unknown; fold?: unknown };

  if (typeof doc !== 'string') {
    return undefined;
  }

  if (
    !Array.isArray(fold) ||
    fold.length % 2 !== 0 ||
    !fold.every((value) => typeof value === 'number')
  ) {
    return undefined;
  }

  return { doc, fold };
}

function parseEmbedCollapseHostEntry(raw: unknown): Map<string, boolean> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result = new Map<string, boolean>();
  for (const [embeddedPageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean') {
      result.set(embeddedPageId, value);
    }
  }
  return result;
}
