import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type {
  ActiveView,
  FilteredView,
  FilteredViewKind,
  Workspace,
} from '../../workspace/Workspace';
import type { DailyNotesSidebarState } from '../daily-notes/DailyNotesSidebarState';

/**
 * Every sidebar tab a persisted `activeSidebarTab` may restore to. A stored
 * value outside this list (a tab since removed, a hand-edited file) is
 * ignored, leaving `Workspace`'s own default in place. `Sidebar.tsx` types
 * its tab values as `SidebarTab`, so a tab added there without being added
 * here fails to compile instead of silently never restoring.
 */
export const SIDEBAR_TABS = ['notes', 'daily-notes', 'tasks', 'tags', 'search'] as const;
export type SidebarTab = (typeof SIDEBAR_TABS)[number];

/**
 * Exhaustive over `FilteredViewKind` (a `Record`, not an array) so a new
 * filtered view added to `Workspace` fails to compile here until it is
 * consciously accepted as restorable.
 */
const FILTERED_VIEW_KINDS: Record<FilteredViewKind, true> = {
  workspace: true,
  favorites: true,
  'tasks-all': true,
  'tasks-unscheduled': true,
  tag: true,
  assets: true,
};

const WORKSPACE_SESSION_KEY = 'workspaceSession';
const CURRENT_VERSION = 1;
const PERSIST_DEBOUNCE_MS = 400;

/**
 * The validated contents of the `workspaceSession` key (ADR-035 §4). An
 * optional field is `undefined` when absent or malformed, meaning "leave
 * the runtime owner's own default in place" — this store never duplicates
 * those defaults.
 */
export interface WorkspaceSessionSnapshot {
  readonly activeSidebarTab?: SidebarTab;
  readonly activeView: ActiveView | null;
  readonly sidebarVisible?: boolean;
  readonly collapsedSections: readonly string[];
  readonly collapsedFolderIds: readonly string[];
  readonly dailyNotesEarlierExpanded?: boolean;
  readonly dailyNotesUpcomingExpanded?: boolean;
}

const EMPTY_SNAPSHOT: WorkspaceSessionSnapshot = {
  activeView: null,
  collapsedSections: [],
  collapsedFolderIds: [],
};

/** What `attach()` observes and snapshots — the session's runtime owners. */
export interface WorkspaceSessionOwners {
  readonly workspace: Workspace;
  readonly dailyNotesSidebarState: DailyNotesSidebarState;
  /**
   * Whether an active view may be written as restorable. The Composition
   * Root supplies "not a draft" (a page id with no Vault entry) — ADR-035
   * §6: drafts never survive a restart, so they're never persisted.
   */
  readonly isPersistableView: (view: ActiveView) => boolean;
}

/**
 * The persistence boundary for workspace session state (ADR-035): owns the
 * `workspaceSession` key of `.clutter/workspace.json` end-to-end — one
 * reader, one writer — alongside, never replacing, the file's other owners
 * (`FoldStateStore`, `CollectionViewConfigStore`, `TasksViewConfigStore`,
 * `TagExpansionStore`).
 *
 * It owns the persisted snapshot only, never the runtime state: `Workspace`
 * and `DailyNotesSidebarState` remain the runtime owners and stay free of
 * any storage dependency. The lifecycle is fixed by ADR-035 §7:
 *
 * 1. `load()` at boot — parse, migrate, validate field by field; never throws.
 * 2. `seed()` — push the restored chrome state into the runtime owners
 *    through their own setters (the active view is restored separately,
 *    by `Application.open()` via `NavigationRouter.restore()`).
 * 3. `attach()` — only after restore/fallback completes, observe the owners
 *    and persist (debounced) whenever the persisted subset changes.
 * 4. `flush()` from `Application.close()`, then `dispose()`.
 *
 * Not Gate-backed (`.clutter/*` is application infrastructure —
 * ARCHITECTURE_RULES.md rule 2). Writes go through
 * `mergeAndWriteWorkspaceStateFile`, which serializes every owner's writes
 * through one queue.
 */
export class WorkspaceSessionStore {
  private owners: WorkspaceSessionOwners | null = null;
  private unsubscribers: Array<() => void> = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  /** The last serialized value written (or loaded) — writes are skipped when unchanged. */
  private lastPersisted: string | null = null;

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    private readonly restored: WorkspaceSessionSnapshot
  ) {}

  /**
   * An empty store — `Application`'s constructor default, for the many
   * tests that construct `Application` directly. Real boot always goes
   * through `load()` (see `Application.bootstrap()`).
   */
  static empty(fileSystem: VaultFileSystem, rootPath: string): WorkspaceSessionStore {
    return new WorkspaceSessionStore(fileSystem, rootPath, EMPTY_SNAPSHOT);
  }

  /**
   * Reads `.clutter/workspace.json` once, at boot. A missing file, invalid
   * JSON, a non-object `workspaceSession`, or a `version` newer than this
   * app understands all yield an empty snapshot (logged via
   * `console.warn`, never thrown — a corrupted file must never block boot).
   * Otherwise each field is validated independently: a malformed field
   * falls back to its default without discarding its valid siblings.
   */
  static async load(fileSystem: VaultFileSystem, rootPath: string): Promise<WorkspaceSessionStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);
    return new WorkspaceSessionStore(fileSystem, rootPath, parseWorkspaceStateFile(contents));
  }

  /** The session restored at load time (ADR-035 §4) — not live state. */
  get restoredSession(): WorkspaceSessionSnapshot {
    return this.restored;
  }

  /**
   * Pushes the restored chrome state into the runtime owners (ADR-035 §7
   * step 5). Must run before `attach()`, so these setter calls are never
   * mistaken for user changes. `folderExists` filters out collapsed-folder
   * ids no longer in the booted Vault; since every later write snapshots
   * the runtime owners, those stale ids drop off disk on the next write.
   * Does not touch the active view.
   */
  seed(
    workspace: Workspace,
    dailyNotesSidebarState: DailyNotesSidebarState,
    folderExists: (folderId: string) => boolean
  ): void {
    const session = this.restored;

    if (session.activeSidebarTab !== undefined) {
      workspace.setActiveSidebarTab(session.activeSidebarTab);
    }

    if (session.sidebarVisible !== undefined) {
      workspace.setSidebarVisible(session.sidebarVisible);
    }

    for (const sectionId of session.collapsedSections) {
      workspace.setSectionExpanded(sectionId, false);
    }

    for (const folderId of session.collapsedFolderIds) {
      if (folderExists(folderId)) {
        workspace.setFolderExpanded(folderId, false);
      }
    }

    if (session.dailyNotesEarlierExpanded !== undefined) {
      dailyNotesSidebarState.setEarlierExpanded(session.dailyNotesEarlierExpanded);
    }

    if (session.dailyNotesUpcomingExpanded !== undefined) {
      dailyNotesSidebarState.setUpcomingExpanded(session.dailyNotesUpcomingExpanded);
    }
  }

  /**
   * Starts observing the runtime owners (ADR-035 §7 step 8) — called only
   * once startup restoration/fallback has completed. Schedules one
   * debounced check immediately, so a session whose restore fell back
   * (e.g. the saved page was deleted) is rewritten even if the user changes
   * nothing else. Calling it again is a no-op.
   */
  attach(owners: WorkspaceSessionOwners): void {
    if (this.owners) {
      return;
    }

    this.owners = owners;
    this.unsubscribers = [
      owners.workspace.subscribe(() => this.schedulePersist()),
      owners.dailyNotesSidebarState.subscribe(() => this.schedulePersist()),
    ];
    this.schedulePersist();
  }

  /**
   * Writes any pending change now, cancelling the debounce — called from
   * `Application.close()`. The snapshot is taken at write time, so a draft
   * promoted to a real page since the last change (no `Workspace`
   * notification of its own) is still persisted as restorable here.
   */
  async flush(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    await this.persist();
  }

  /** Stops observing and cancels any pending write (without writing it). */
  dispose(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }

    this.unsubscribers = [];
    this.owners = null;
  }

  private schedulePersist(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Fire-and-forget, best-effort — the same posture every `.clutter/*`
   * writer documents: a final write lost to an abrupt process kill is
   * accepted. Skipped entirely when the persisted subset is unchanged,
   * since `Workspace.notify()` also fires for state this store doesn't
   * persist (open pages, history, draft-title refreshes).
   */
  private async persist(): Promise<void> {
    if (!this.owners) {
      return;
    }

    const serialized = serializeSession(this.owners);
    const json = JSON.stringify(serialized);

    if (json === this.lastPersisted) {
      return;
    }

    this.lastPersisted = json;

    try {
      await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
        [WORKSPACE_SESSION_KEY]: serialized,
      });
    } catch (error) {
      // Let the next change retry rather than believing this one landed.
      this.lastPersisted = null;
      console.warn('WorkspaceSessionStore: failed to persist workspace session.', error);
    }
  }
}

/** The on-disk shape of `workspaceSession`, version 1 (ADR-035 §4). */
interface PersistedWorkspaceSessionV1 {
  readonly version: 1;
  readonly navigation: {
    readonly activeSidebarTab: string;
    readonly activeView: ActiveView | null;
  };
  readonly sidebar: {
    readonly visible: boolean;
    readonly collapsedSections: readonly string[];
    readonly notes: { readonly collapsedFolderIds: readonly string[] };
    readonly dailyNotes: {
      readonly earlierExpanded: boolean;
      readonly upcomingExpanded: boolean;
    };
  };
}

function serializeSession(owners: WorkspaceSessionOwners): PersistedWorkspaceSessionV1 {
  const { workspace, dailyNotesSidebarState, isPersistableView } = owners;
  const activeView = workspace.activeView;

  return {
    version: CURRENT_VERSION,
    navigation: {
      activeSidebarTab: workspace.activeSidebarTab,
      activeView: activeView && isPersistableView(activeView) ? activeView : null,
    },
    sidebar: {
      visible: workspace.isSidebarVisible,
      collapsedSections: workspace.collapsedSections,
      notes: { collapsedFolderIds: workspace.collapsedFolders },
      dailyNotes: {
        earlierExpanded: dailyNotesSidebarState.earlierExpanded,
        upcomingExpanded: dailyNotesSidebarState.upcomingExpanded,
      },
    },
  };
}

function warn(message: string): void {
  console.warn(`WorkspaceSessionStore: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorkspaceStateFile(contents: string): WorkspaceSessionSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    warn(`${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with no restored session.`);
    return EMPTY_SNAPSHOT;
  }

  if (!isRecord(parsed)) {
    warn(`${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with no restored session.`);
    return EMPTY_SNAPSHOT;
  }

  const raw = parsed[WORKSPACE_SESSION_KEY];

  if (raw === undefined) {
    return EMPTY_SNAPSHOT;
  }

  if (!isRecord(raw)) {
    warn(`"${WORKSPACE_SESSION_KEY}" is not an object — discarding it.`);
    return EMPTY_SNAPSHOT;
  }

  const migrated = migrateToCurrentVersion(raw);
  return migrated ? parseCurrentVersion(migrated) : EMPTY_SNAPSHOT;
}

/**
 * Brings a stored `workspaceSession` up to `CURRENT_VERSION` (ADR-035 §5).
 * A missing `version` reads as 1. A version newer than this app knows (a
 * downgrade) is discarded — defaults apply and the next write replaces it.
 * Only additive changes are expected to skip a version bump; a breaking
 * reshape bumps `CURRENT_VERSION` and adds its migration step here.
 */
function migrateToCurrentVersion(raw: Record<string, unknown>): Record<string, unknown> | null {
  const version = raw.version === undefined ? 1 : raw.version;

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    warn(`"${WORKSPACE_SESSION_KEY}" has an invalid version — discarding it.`);
    return null;
  }

  if (version > CURRENT_VERSION) {
    warn(
      `"${WORKSPACE_SESSION_KEY}" was written by a newer version of Clutter (v${version}) — starting with no restored session.`
    );
    return null;
  }

  // version === CURRENT_VERSION (1) — no migration steps exist yet.
  return raw;
}

function parseCurrentVersion(raw: Record<string, unknown>): WorkspaceSessionSnapshot {
  const navigation = parseSection(raw, 'navigation');
  const sidebar = parseSection(raw, 'sidebar');
  const notes = sidebar ? parseSection(sidebar, 'notes', 'sidebar.notes') : undefined;
  const dailyNotes = sidebar ? parseSection(sidebar, 'dailyNotes', 'sidebar.dailyNotes') : undefined;

  return {
    activeSidebarTab: parseField(navigation?.activeSidebarTab, 'navigation.activeSidebarTab', parseSidebarTab),
    activeView: parseField(navigation?.activeView, 'navigation.activeView', parseActiveView) ?? null,
    sidebarVisible: parseField(sidebar?.visible, 'sidebar.visible', parseBoolean),
    collapsedSections:
      parseField(sidebar?.collapsedSections, 'sidebar.collapsedSections', parseStringArray) ?? [],
    collapsedFolderIds:
      parseField(notes?.collapsedFolderIds, 'sidebar.notes.collapsedFolderIds', parseStringArray) ?? [],
    dailyNotesEarlierExpanded: parseField(
      dailyNotes?.earlierExpanded,
      'sidebar.dailyNotes.earlierExpanded',
      parseBoolean
    ),
    dailyNotesUpcomingExpanded: parseField(
      dailyNotes?.upcomingExpanded,
      'sidebar.dailyNotes.upcomingExpanded',
      parseBoolean
    ),
  };
}

function parseSection(
  parent: Record<string, unknown>,
  key: string,
  label: string = key
): Record<string, unknown> | undefined {
  const value = parent[key];

  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    warn(`"${label}" is not an object — using defaults for it.`);
    return undefined;
  }

  return value;
}

/**
 * Field-level validation (ADR-035 §5): an absent field is simply
 * `undefined`; a present-but-malformed one is warned about and also
 * `undefined`, so it falls back to its default alone.
 */
function parseField<T>(
  value: unknown,
  label: string,
  parse: (value: unknown) => T | undefined
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = parse(value);

  if (parsed === undefined) {
    warn(`"${label}" is malformed — using its default.`);
  }

  return parsed;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseSidebarTab(value: unknown): SidebarTab | undefined {
  return (SIDEBAR_TABS as readonly unknown[]).includes(value) ? (value as SidebarTab) : undefined;
}

/** Non-string entries are dropped individually; a non-array is malformed. */
function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * `null` is a valid stored value ("nothing to restore") but is returned as
 * `undefined` here so the caller's `?? null` handles both alike. Shape
 * validation only — whether the view still exists is checked against the
 * Vault at restore time (`NavigationRouter.restore()`).
 */
function parseActiveView(value: unknown): ActiveView | undefined {
  if (value === null || !isRecord(value)) {
    return undefined;
  }

  if (value.type === 'page' || value.type === 'folder') {
    return typeof value.id === 'string' && value.id.length > 0
      ? { type: value.type, id: value.id }
      : undefined;
  }

  if (value.type === 'filtered-view') {
    const view = parseFilteredView(value.view);
    return view ? { type: 'filtered-view', view } : undefined;
  }

  return undefined;
}

function parseFilteredView(value: unknown): FilteredView | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string' || !(value.kind in FILTERED_VIEW_KINDS)) {
    return undefined;
  }

  if (value.kind === 'tag') {
    return typeof value.tagName === 'string' && value.tagName.length > 0
      ? { kind: 'tag', tagName: value.tagName }
      : undefined;
  }

  return { kind: value.kind as Exclude<FilteredViewKind, 'tag'> };
}
