import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import {
  withRenamedActiveSpace,
  withoutPendingRename,
  type PendingRename,
  type SpaceRegistry,
} from './spaceRegistry';

/** What is known about a Space id at a path: its id, `null` when the folder has no Space profile, or unreadable. */
export type SpaceIdReading = string | null | 'unreadable';

export interface ReconcileDeps {
  probe(path: string): Promise<SpaceFolderStatus>;
  /** The Space id stored in the folder at `path`, read-only. Only called for a path that probed as available. */
  readSpaceId(path: string): Promise<SpaceIdReading>;
  /**
   * Carries the renamed Space's saved state (keyed by path-derived ids) over from `oldRoot` to `newRoot`; resolves
   * whether it is consistent. Idempotent, so a recovery may run it again after the rename completed in an earlier
   * run: ids already moved are not touched twice. Absent, there is nothing to carry over.
   */
  migrateState?(oldRoot: string, newRoot: string): Promise<boolean>;
}

export interface ReconcileResult {
  readonly registry: SpaceRegistry;
  /** Whether `registry` differs from what was stored, so the caller persists it before anything opens. */
  readonly changed: boolean;
  /**
   * Set when the active path must not be opened as it stands (it is missing, or not verified to be the Space that was
   * being renamed). The caller treats it as a lost active Space, so the existing recovery runs instead of an open.
   */
  readonly blockedActivePath: string | null;
  /** Something the user should be told, in the registry's own wording. */
  readonly notice?: string;
}

/**
 * Settles a rename that was started and not finished (the app quit or crashed part-way), BEFORE any Space opens.
 *
 * Path existence alone proves nothing: a recreated or copied folder can sit at either path. So both paths are
 * inspected, and the Space id recorded when the rename began is compared at each. A matching id is a consistency
 * check, not proof — a copied Space carries the same id — so two matches are ambiguous and decide nothing.
 *
 * A path that is merely unavailable or unreadable is never read as "missing", and never decides anything: the
 * record is kept for a later retry. Neither folder is ever deleted, moved, renamed or overwritten here, and a record
 * is cleared only when the outcome is established: the registry then reads the same whichever way the crash fell.
 */
export async function reconcilePendingRename(registry: SpaceRegistry, deps: ReconcileDeps): Promise<ReconcileResult> {
  const pending = registry.pendingRename;
  if (pending === undefined) return keep(registry);
  // The record is about an entry that is no longer registered: nothing left for it to decide.
  if (!registry.paths.includes(pending.from)) return resolved(registry, 'the record is stale');

  const [fromStatus, toStatus] = await Promise.all([deps.probe(pending.from), deps.probe(pending.to)]);
  const [fromId, toId] = await Promise.all([
    fromStatus === 'available' ? deps.readSpaceId(pending.from) : null,
    toStatus === 'available' ? deps.readSpaceId(pending.to) : null,
  ]);
  const matches = (id: string | null | 'unreadable'): boolean => pending.spaceId !== null && id === pending.spaceId;

  // Anything but a definite answer — a path that is unavailable (not "missing"), or an id that can't be read (not
  // "no profile") — decides nothing: the record is kept for a later retry and neither path is declared authoritative.
  // The old path is held back from opening only when it was READ and is not the recorded Space.
  if (fromStatus === 'unavailable' || toStatus === 'unavailable' || fromId === 'unreadable' || toId === 'unreadable') {
    const fromIsSomethingElse = fromStatus === 'available' && fromId !== 'unreadable' && !matches(fromId);

    return retained(
      registry,
      fromIsSomethingElse ? pending.from : null,
      `Clutter couldn’t check “${pending.from}” and “${pending.to}” well enough to finish renaming a space`
    );
  }

  if (fromStatus === 'available' && matches(fromId)) {
    // The original is where it was: the rename never happened (or happened and was undone).
    if (toStatus === 'missing') return resolved(registry);
    if (!matches(toId)) {
      // Something else sits at the destination: an empty folder a crash left behind, or an unrelated Space.
      return resolved(
        registry,
        undefined,
        toId === null ? undefined : `A different space already exists at “${pending.to}”, so the rename was not finished`
      );
    }
    // Both claim to be this Space. A matching id is not a matching folder — a copy carries the same id — so nothing
    // here can tell which is which: neither is opened, neither is changed, and the record is kept.
    return ambiguous(registry, pending, `Two folders hold this space: “${pending.from}” and “${pending.to}”. Neither was opened or changed`);
  }

  if (toStatus === 'available' && matches(toId)) {
    // The destination is the Space (verified by id), and the old path is gone or belongs to something else. Before
    // the registry moves — and so before anything can open it — the saved state is carried over, or the carry-over
    // is retried if the rename finished in an earlier run and the registry write did not. It is idempotent.
    if (deps.migrateState && !(await deps.migrateState(pending.from, pending.to))) {
      return retained(
        registry,
        registry.activePath === pending.from ? pending.from : null,
        `“${pending.to}” was renamed, but Clutter couldn’t carry this space’s saved settings over yet. It will try again next time`
      );
    }

    // The old folder, if there is one, is not touched — only no longer registered.
    return {
      registry: withRenamedActiveSpace(registry, pending.to),
      changed: true,
      blockedActivePath: null,
      ...(fromStatus === 'available'
        ? { notice: `“${pending.from}” now holds a different space, so this one was opened from “${pending.to}”` }
        : {}),
    };
  }

  // Nothing verifies as the Space at either path. The registry and the record are kept, and the old path is not
  // opened: it is missing, or it is not the Space that was being renamed.
  return {
    registry,
    changed: false,
    blockedActivePath: registry.activePath === pending.from ? pending.from : null,
    notice:
      fromStatus === 'missing' && toStatus === 'missing'
        ? `Clutter couldn’t find “${pending.from}” or “${pending.to}” to finish renaming a space`
        : `Clutter couldn’t confirm which folder is this space (“${pending.from}” or “${pending.to}”)`,
  };
}

function keep(registry: SpaceRegistry): ReconcileResult {
  return { registry, changed: false, blockedActivePath: null };
}

/** Settled: the record goes, the active path stays and opens normally. */
function resolved(registry: SpaceRegistry, _why?: string, notice?: string): ReconcileResult {
  return { registry: withoutPendingRename(registry), changed: true, blockedActivePath: null, ...(notice && { notice }) };
}

/** Undecided: keep the registry and the record, and open nothing that is not verified. */
function retained(registry: SpaceRegistry, block: string | null, notice: string): ReconcileResult {
  return {
    registry,
    changed: false,
    blockedActivePath: block !== null && registry.activePath === block ? block : null,
    notice,
  };
}

/** Ambiguous: nothing opens (the active Space is held back like a lost one), and the registry and the record stay. */
function ambiguous(registry: SpaceRegistry, pending: PendingRename, notice: string): ReconcileResult {
  return {
    registry,
    changed: false,
    blockedActivePath: registry.activePath === pending.from ? pending.from : null,
    notice,
  };
}
