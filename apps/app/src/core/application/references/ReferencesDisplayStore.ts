import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * One note's saved References display preferences. Both fields are absent at
 * their default, and an entry with neither is not kept (ADR-052).
 *
 * - `hidden` is a tri-state: absent = automatic (shown when the note has
 *   references, hidden when it has none); `true` = the user chose Hide
 *   references; `false` = the user chose Show references, which keeps the
 *   section visible even when empty.
 * - `collapsed` is only ever stored as `true` (absent = expanded).
 */
export interface ReferencesDisplayEntry {
  readonly hidden?: boolean;
  readonly collapsed?: boolean;
}

/**
 * Owns the `referencesDisplay` top-level key of `.clutter/workspace.json` —
 * per-note (immutable page id) References visibility and expansion, ADR-052.
 * A sibling of `TagExpansionStore`/`FoldStateStore`: one reader, one writer,
 * loaded once at boot, in-memory authoritative, never Gate-backed
 * (`.clutter/*` is application infrastructure — ARCHITECTURE_RULES.md rule 2)
 * and never owned by `Workspace`.
 *
 * Visibility and expansion are independent: neither setter reads or writes the
 * other's field, so hiding then showing a section restores its saved
 * expansion.
 *
 * Durability is best-effort and fire-and-forget (same accepted posture as
 * ADR-033): a preference change made just before the app is terminated may
 * not reach disk, and the note then reverts to its previous saved value.
 */
export class ReferencesDisplayStore {
  private readonly entries: Map<string, ReferencesDisplayEntry>;
  private readonly listeners = new Set<() => void>();

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    entries: Map<string, ReferencesDisplayEntry>
  ) {
    this.entries = entries;
  }

  /** An empty, non-loading store — `Application`'s constructor default for tests. */
  static empty(fileSystem: VaultFileSystem, rootPath: string): ReferencesDisplayStore {
    return new ReferencesDisplayStore(fileSystem, rootPath, new Map());
  }

  /**
   * Reads `.clutter/workspace.json` once, at boot. Tolerant of a missing file,
   * malformed JSON, a malformed `referencesDisplay` key and malformed entries
   * (discarded per entry where possible, logged via `console.warn`, never
   * thrown) — a corrupted file must never block the app from starting.
   */
  static async load(fileSystem: VaultFileSystem, rootPath: string): Promise<ReferencesDisplayStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);
    const empty = () => new ReferencesDisplayStore(fileSystem, rootPath, new Map());

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `ReferencesDisplayStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with default References display.`
      );
      return empty();
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `ReferencesDisplayStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with default References display.`
      );
      return empty();
    }

    const { referencesDisplay } = parsed as Record<string, unknown>;

    if (referencesDisplay === undefined) {
      return empty();
    }

    if (typeof referencesDisplay !== 'object' || referencesDisplay === null || Array.isArray(referencesDisplay)) {
      console.warn(
        `ReferencesDisplayStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "referencesDisplay" is not an object — discarding it.`
      );
      return empty();
    }

    const entries = new Map<string, ReferencesDisplayEntry>();
    for (const [pageId, raw] of Object.entries(referencesDisplay as Record<string, unknown>)) {
      const entry = parseEntry(raw);
      if (entry === undefined) {
        console.warn(`ReferencesDisplayStore: discarding malformed References display entry for page "${pageId}".`);
      } else if (entry !== null) {
        entries.set(pageId, entry);
      }
    }

    return new ReferencesDisplayStore(fileSystem, rootPath, entries);
  }

  /** The explicit visibility choice: `true` hidden, `false` shown, `undefined` automatic. */
  getHidden(pageId: string): boolean | undefined {
    return this.entries.get(pageId)?.hidden;
  }

  /** Whether the section is collapsed — `false` (expanded) when never toggled. */
  isCollapsed(pageId: string): boolean {
    return this.entries.get(pageId)?.collapsed === true;
  }

  /** Records the user's explicit Hide (`true`) or Show (`false`) choice. Leaves `collapsed` untouched. */
  setHidden(pageId: string, hidden: boolean): void {
    this.update(pageId, (entry) => ({ ...entry, hidden }));
  }

  /** Records the section's expansion. Leaves `hidden` untouched; expanded is the default, so it is not stored. */
  setCollapsed(pageId: string, collapsed: boolean): void {
    this.update(pageId, ({ collapsed: _previous, ...rest }) => (collapsed ? { ...rest, collapsed: true } : rest));
  }

  /** Forgets a page's preferences — the page-delete counterpart, like `FoldStateStore.clear`. */
  clear(pageId: string): void {
    if (this.entries.delete(pageId)) {
      this.notify();
      void this.persist();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(pageId: string, change: (entry: ReferencesDisplayEntry) => ReferencesDisplayEntry): void {
    const current = this.entries.get(pageId) ?? {};
    const next = change(current);

    if (next.hidden === current.hidden && next.collapsed === current.collapsed) {
      return;
    }

    if (next.hidden === undefined && next.collapsed === undefined) {
      this.entries.delete(pageId);
    } else {
      this.entries.set(pageId, next);
    }

    this.notify();
    void this.persist();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Writes `referencesDisplay` via `mergeAndWriteWorkspaceStateFile`, which
   * layers it onto the file's other keys read fresh, so the sibling owners'
   * keys are never clobbered.
   */
  private async persist(): Promise<void> {
    const referencesDisplay: Record<string, ReferencesDisplayEntry> = {};
    for (const [pageId, entry] of this.entries) {
      referencesDisplay[pageId] = entry;
    }

    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, { referencesDisplay });
  }
}

/** The entry, `null` for a valid entry holding nothing (dropped), `undefined` for a malformed one. */
function parseEntry(raw: unknown): ReferencesDisplayEntry | null | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { hidden, collapsed } = raw as { hidden?: unknown; collapsed?: unknown };

  if ((hidden !== undefined && typeof hidden !== 'boolean') || (collapsed !== undefined && typeof collapsed !== 'boolean')) {
    return undefined;
  }

  const entry = {
    ...(hidden !== undefined && { hidden }),
    ...(collapsed === true && { collapsed: true as const }),
  };

  return Object.keys(entry).length === 0 ? null : entry;
}
