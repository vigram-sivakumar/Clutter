import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpaceFolderStatus } from '../../core/vault/providers/probeSpaceFolder';
import { reconcilePendingRename, type SpaceIdReading } from './reconcilePendingRename';
import { SpaceLifecycleGuard } from './spaceLifecycleGuard';
import {
  defaultSpaceStorage,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  withPendingRename,
  withRenamedActiveSpace,
  withoutPendingRename,
  withRenamedInactiveSpace,
  withReplacedSpace,
  withoutActiveSpace,
  withoutSpace,
  type SpaceRegistry,
  type SpaceRegistryStorage,
} from './spaceRegistry';

export interface SpaceRegistryDeps {
  /**
   * The Space opened when none has been configured. Only the web runtime passes one (its in-memory
   * vault); the desktop app passes none, so a first run starts with an empty registry.
   */
  defaultPath?: string;
  /** Read-only check of whether a folder can be opened as a Space, and if not, whether it is confirmed missing. */
  probe(path: string): Promise<SpaceFolderStatus>;
  /** The folder picker; `null` means cancelled. Absent where there is none. */
  pick?: () => Promise<string | null>;
  /**
   * Vets a folder the picker returned before it is activated: `null` accepts it, a message refuses it
   * (shown as a notice; nothing changes). Absent, every picked folder goes on to the open.
   */
  accept?: (path: string) => Promise<string | null>;
  storage?: SpaceRegistryStorage | null;
  /**
   * The Space id stored in the folder at `path` (read-only): its id, `null` for a folder with no Space profile, or
   * `'unreadable'`. Lets startup verify identity at both paths of an unfinished rename; without it nothing can be
   * verified, and such a rename is left undecided.
   */
  readSpaceId?(path: string): Promise<SpaceIdReading>;
  /** Carries saved state over to a renamed folder (idempotent); lets startup retry it before finishing a rename. */
  migrateState?(oldRoot: string, newRoot: string): Promise<boolean>;
}

export type RemoveActiveSpaceResult = 'switching' | 'closed' | 'failed' | 'busy' | 'none';

export interface SpaceRegistryState {
  registry: SpaceRegistry;
  /** False until startup has checked that the stored active Space is still openable. */
  ready: boolean;
  /**
   * The configured active Space's folder is confirmed missing and no other registered Space could be
   * opened instead. The registry is untouched (kept for a later recovery flow); nothing is opened.
   */
  activeSpaceMissing: boolean;
  /**
   * Registered Spaces (other than the active one) whose folder is *confirmed* missing as of the last
   * check. A permission or scope failure is not "missing" and never appears here. Entries stay in the
   * registry — this only says which are not usable right now. Never written to storage.
   */
  missingPaths: ReadonlySet<string>;
  /** Re-checks every other registered Space's folder (one probe each); the result lands in `missingPaths`. */
  refreshAvailability(): Promise<void>;
  /**
   * The registered Spaces that could replace `lostPath`, in the order to try them: registry order,
   * starting after the lost one and wrapping around, keeping only folders that probe as `available`
   * right now (a confirmed-missing or inaccessible folder is never offered). Probes only; changes and
   * persists nothing — opening one goes through the normal `selectSpace` flow.
   */
  fallbackCandidates(lostPath: string): Promise<string[]>;
  /** Shows `text` to the user through the registry's own notice (for outcomes the shell reports on its behalf). */
  notify(text: string): void;
  /**
   * A Space that is not open had its folder renamed to `to`: its entry moves to the new path and the active Space is
   * untouched. Remembered at once, onto the registry as of the last Space that opened (as `removeSpace` is), so a switch
   * in flight is never persisted early. `false` when `from` is the open Space or is not registered, or when the write
   * fails (the in-memory registry still follows the new path and the user is told).
   */
  renameInactiveSpace(from: string, to: string): boolean;
  /** The one lifecycle guard: switching, removing and renaming never overlap. Shared with whoever orchestrates a rename. */
  readonly lifecycle: SpaceLifecycleGuard;
  /**
   * Starts renaming the ACTIVE Space's folder: records `pendingRename` and writes it to storage synchronously, BEFORE
   * anything on disk changes. `false` (nothing recorded) when one is already recorded, nothing is active, or the
   * write fails — the caller then aborts without closing anything.
   */
  beginRename(to: string, spaceId: string | null): boolean;
  /**
   * The folder was renamed: the active entry takes `to` and the record is resolved in ONE mutation and ONE write.
   * `false` when that write failed — the folder is at `to` but storage still holds the record and the old path, so
   * the caller must NOT open anything and falls back to recovery (the record is what lets the next launch finish it).
   * Either way the in-memory registry follows the new path so nothing can ever return to the old one.
   */
  completeRename(to: string): boolean;
  /** The rename did not happen and the original is verified: clears the record. `false` if that could not be saved. */
  abandonRename(): boolean;
  /** A user-facing message about the last refused or failed switch; cleared by `dismissNotice`. */
  notice: { id: number; text: string } | null;
  dismissNotice(): void;
  /**
   * "New space": shows the folder picker and vets the choice. Resolves the chosen folder's normalized path,
   * or `null` when the picker was cancelled or the folder refused. A refusal is shown as a notice, unless the caller
   * passes `onRefusal`: a dialog the user is choosing the folder in shows it inline instead, never both.
   * Changes nothing — the folder is only a candidate until the caller confirms it with `switchSpace`.
   * Absent where there is no picker.
   */
  chooseSpace?: (onRefusal?: (message: string) => void) => Promise<string | null>;
  /**
   * Registers `path` if new and makes it active (the caller's open follows). With `replaces`, the entry of
   * that registered path (a Space the user is re-pointing) takes `path` in its place instead. Resolves whether
   * the folder was accepted; a refusal is shown as a notice. Nothing is persisted until `confirmOpened`.
   */
  switchSpace(path: string, replaces?: string): Promise<boolean>;
  /**
   * "Remove space" for a Space whose folder is gone: forgets its entry — and only that; nothing on disk is
   * touched. Remembered at once, onto the registry as of the last Space that opened, so a switch still in
   * flight is never persisted early. The active Space can't be removed; an unregistered path changes nothing.
   */
  removeSpace(path: string): void;
  /**
   * "Remove space" for the ACTIVE Space (the registry entry only; nothing on disk is touched).
   * - Another registered Space is available: switches to it through the normal switch (`activate`); the old entry
   *   is forgotten only once that Space has actually opened (`confirmOpened`), so a failed switch removes nothing.
   *   Resolves `'switching'`.
   * - None is available (the last openable Space): `closeApplication` flushes and closes the open Application;
   *   then the entry is forgotten and no Space is active, the remaining (unavailable) entries kept. `'closed'`,
   *   or `'failed'` — nothing removed, a notice shown — when the close threw.
   * A repeated call while one is in progress is `'busy'`; with no active Space it is `'none'`.
   */
  removeActiveSpace(closeApplication: () => Promise<void>): Promise<RemoveActiveSpaceResult>;
  /**
   * First-run / recovery selection: like `switchSpace`, but resolves whether the folder was accepted
   * for opening, and the previous registry (and missing-folder report) can be put back with
   * `cancelSelection` if the open then fails. Nothing is persisted until `confirmOpened`.
   */
  selectSpace(path: string): Promise<boolean>;
  /**
   * Drops a removal that is waiting for its replacement Space to open, releasing the lifecycle guard; the entry it
   * would have forgotten stays registered. For a failed open that no other callback reports.
   */
  abortPendingRemoval(): void;
  /** Undoes the last `selectSpace` that has not been confirmed. */
  cancelSelection(): void;
  /**
   * The active Space opened: this registry is now the one to restore at the next launch.
   * If it can't be written, the user is told it won't be remembered (the Space stays open).
   */
  confirmOpened(): void;
  /**
   * The active Space failed to open. When an earlier Space had opened, the registry goes back
   * to it (so the current Space is never lost) and this returns `true`; otherwise `false`.
   */
  openFailed(reason: string): boolean;
}

function unavailableMessage(path: string): string {
  return `Can’t open “${path}”. The folder is missing, unreadable, or outside the allowed location`;
}

export function useSpaceRegistry(deps: SpaceRegistryDeps): SpaceRegistryState {
  const { defaultPath, probe, pick, accept } = deps;
  const storage = deps.storage === undefined ? defaultSpaceStorage() : deps.storage;
  const storageRef = useRef(storage);

  const [registry, setRegistry] = useState(() => loadSpaceRegistry(storage, defaultPath));
  const [ready, setReady] = useState(false);
  const [missingPath, setMissingPath] = useState<string | null>(null);
  const [missingPaths, setMissingPaths] = useState<ReadonlySet<string>>(() => new Set());
  // A newer check supersedes an older one still in flight, and nothing lands after unmount.
  const availabilityCheckRef = useRef(0);
  const mountedRef = useRef(true);
  // `refreshAvailability` must be stable (an effect and the selector depend on it), whatever `probe` is.
  const probeRef = useRef(probe);
  probeRef.current = probe;
  const [notice, setNotice] = useState<SpaceRegistryState['notice']>(null);
  // The registry as of the last Space that actually opened — what a failed switch returns to.
  const lastOpenedRef = useRef<SpaceRegistry | null>(null);
  const registryRef = useRef(registry);
  registryRef.current = registry;
  // The active Space being removed by switching away from it: forgotten once its replacement has opened.
  const pendingRemovalRef = useRef<string | null>(null);
  const lifecycleRef = useRef<SpaceLifecycleGuard | null>(null);
  lifecycleRef.current ??= new SpaceLifecycleGuard();
  const lifecycle = lifecycleRef.current;
  // Held from the start of a removal that switches away until its replacement has opened (or failed to).
  const removalReleaseRef = useRef<(() => void) | null>(null);
  const finishRemoval = () => {
    pendingRemovalRef.current = null;
    removalReleaseRef.current?.();
    removalReleaseRef.current = null;
  };

  const say = useCallback((text: string) => setNotice({ id: Date.now(), text }), []);

  // Startup: probe the stored active Space. A confirmed-missing folder is reported
  // (`activeSpaceMissing`) instead of letting a bootstrap run — the shell then tries the next available
  // registered Space (`fallbackCandidates`) and shows the Welcome dialog only if none opens. Any other
  // failure (permission, scope) is left to the caller's existing open-error handling. This never
  // writes: the registry — a missing path included — stays as stored until a Space has actually opened.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // An unfinished rename is settled first, and its outcome persisted, before anything is probed or opened.
      const stored = registryRef.current;
      let blocked: string | null = null;
      if (stored.pendingRename !== undefined) {
        const outcome = await reconcilePendingRename(stored, {
          probe,
          readSpaceId: deps.readSpaceId ?? (async () => 'unreadable' as const),
          migrateState: deps.migrateState,
        });
        if (cancelled) return;
        if (outcome.changed) {
          const repoints = outcome.registry.activePath !== stored.activePath;
          const saved = saveSpaceRegistry(storageRef.current, outcome.registry);
          if (saved || !repoints) {
            // Clearing a record needs no write to be safe: the next launch reaches the same conclusion.
            registryRef.current = outcome.registry;
            setRegistry(outcome.registry);
          } else {
            // Moving the entry could not be saved: nothing is opened from an unconfirmed registry.
            blocked = stored.activePath;
          }
        }
        if (outcome.blockedActivePath !== null) blocked = outcome.blockedActivePath;
        if (outcome.notice) say(outcome.notice);
      }
      const activePath = registryRef.current.activePath;
      if (blocked !== null) {
        setMissingPath(blocked);
      } else if (activePath !== null && (await probe(activePath)) === 'missing' && !cancelled) {
        setMissingPath(activePath);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Startup only; `probe` is stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAvailability = useCallback(async () => {
    const check = ++availabilityCheckRef.current;
    const { paths, activePath } = registryRef.current;
    // The active Space is the lifecycle's business (startup probe, loss detection), not this list's.
    const others = paths.filter((path) => path !== activePath);
    const statuses = await Promise.all(
      others.map(async (path) => [path, await probeRef.current(path)] as const)
    );
    if (!mountedRef.current || check !== availabilityCheckRef.current) return;
    const missing = statuses.filter(([, status]) => status === 'missing').map(([path]) => path);
    // Same answer as before: keep the same Set so nothing re-renders for nothing.
    setMissingPaths((current) =>
      current.size === missing.length && missing.every((path) => current.has(path)) ? current : new Set(missing)
    );
  }, []);

  const fallbackCandidates = useCallback(async (lostPath: string): Promise<string[]> => {
    const { paths } = registryRef.current;
    const lostIndex = paths.indexOf(lostPath);
    const ordered =
      lostIndex === -1 ? [...paths] : [...paths.slice(lostIndex + 1), ...paths.slice(0, lostIndex)];
    const statuses = await Promise.all(ordered.map(async (path) => [path, await probeRef.current(path)] as const));
    return statuses.filter(([, status]) => status === 'available').map(([path]) => path);
  }, []);

  // Once startup has settled, and then whenever the shell asks (selector opened, window refocused).
  useEffect(() => {
    if (ready) void refreshAvailability();
  }, [ready, refreshAvailability]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const missingPathRef = useRef(missingPath);
  missingPathRef.current = missingPath;
  const pendingSelectionRef = useRef<{ previous: SpaceRegistry; previousMissing: string | null } | null>(null);

  /** Returns whether the folder was accepted and made the active Space (the caller's open then follows). */
  const activate = useCallback(
    async (rawPath: string, recordSelection: boolean, replaces?: string): Promise<boolean> => {
      const path = normalizeSpacePath(rawPath);
      // Re-choosing the configured Space is only meaningful when it was reported missing: it has
      // since reappeared (or been created), so clear the report and let the open run.
      const reopeningMissing = path === registryRef.current.activePath && missingPathRef.current === path;
      if (path === registryRef.current.activePath && !reopeningMissing) {
        return false;
      }
      if ((await probe(path)) !== 'available') {
        say(unavailableMessage(path));
        return false;
      }
      if (recordSelection) {
        pendingSelectionRef.current = {
          previous: registryRef.current,
          previousMissing: missingPathRef.current,
        };
      }
      setMissingPaths((current) => {
        if (!current.has(path)) return current;
        const next = new Set(current);
        next.delete(path);
        return next;
      });
      if (reopeningMissing) {
        setMissingPath(null);
      } else {
        setRegistry((current) =>
          replaces === undefined ? withActiveSpace(current, path) : withReplacedSpace(current, replaces, path)
        );
      }
      return true;
    },
    [probe, say]
  );

  // While a removal or a rename holds the lifecycle guard, no other Space operation may start.
  const refuseWhileBusy = useCallback((): boolean => {
    if (lifecycle.active === null) return false;
    say(
      lifecycle.active === 'renaming'
        ? 'A space is being renamed. Try again in a moment'
        : 'A space is being removed. Try again in a moment'
    );
    return true;
  }, [lifecycle, say]);

  const switchSpace = useCallback(
    async (path: string, replaces?: string): Promise<boolean> =>
      refuseWhileBusy() ? false : activate(path, false, replaces),
    [activate, refuseWhileBusy]
  );
  const removeSpace = useCallback(
    (path: string) => {
      if (refuseWhileBusy()) return;
      setRegistry((current) => withoutSpace(current, path));
      const lastOpened = lastOpenedRef.current;
      if (!lastOpened) return; // Nothing has opened yet: `confirmOpened` writes it with the Space.
      const remembered = withoutSpace(lastOpened, path);
      if (remembered === lastOpened) return;
      lastOpenedRef.current = remembered;
      if (!saveSpaceRegistry(storageRef.current, remembered)) {
        say('Clutter couldn’t save that change, so the space may come back next launch');
      }
    },
    [say, refuseWhileBusy]
  );
  const selectSpace = useCallback(
    async (path: string): Promise<boolean> => {
      // Welcome and the lost-Space recovery choose through here, and must never be left waiting on a removal that is
      // itself waiting for a Space to open: if that open went wrong, the removal is dropped (the old entry stays) and
      // the recovery proceeds. A rename is different: it owns the Application and the registry, so this waits.
      if (lifecycle.active === 'removing' && pendingRemovalRef.current !== null) finishRemoval();
      return refuseWhileBusy() ? false : activate(path, true);
    },
    [activate, refuseWhileBusy, lifecycle]
  );

  const removeActiveSpace = useCallback(
    async (closeApplication: () => Promise<void>): Promise<RemoveActiveSpaceResult> => {
      const active = registryRef.current.activePath;
      if (active === null) return 'none';
      if (pendingRemovalRef.current !== null) return 'busy';
      const release = lifecycle.begin('removing');
      if (release === null) return 'busy';
      let keepHeld = false;
      try {
        for (const candidate of await fallbackCandidates(active)) {
          if (await activate(candidate, false)) {
            pendingRemovalRef.current = active;
            // Held until the replacement has opened (`confirmOpened`) or failed (`openFailed`, `cancelSelection`).
            removalReleaseRef.current = release;
            keepHeld = true;
            return 'switching';
          }
        }
        // Nothing else can open: close this Space (flushing pending writes) before forgetting it.
        try {
          await closeApplication();
        } catch (caught) {
          console.error('Closing the space before removing it failed:', caught);
          say('Clutter couldn’t save this space’s pending changes, so it was not removed');
          return 'failed';
        }
        const remaining = withoutActiveSpace(registryRef.current, null);
        registryRef.current = remaining;
        lastOpenedRef.current = remaining;
        setRegistry(remaining);
        if (!saveSpaceRegistry(storageRef.current, remaining)) {
          say('The space was removed, but Clutter couldn’t save that, so it may come back next launch');
        }
        return 'closed';
      } finally {
        if (!keepHeld) release();
      }
    },
    [activate, fallbackCandidates, say, lifecycle]
  );

  const cancelSelection = useCallback(() => {
    finishRemoval();
    const pending = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    if (!pending) return;
    setRegistry(pending.previous);
    setMissingPath(pending.previousMissing);
  }, []);

  const beginRename = useCallback(
    (to: string, spaceId: string | null): boolean => {
      const current = registryRef.current;
      if (current.activePath === null || current.pendingRename !== undefined) return false;
      const next = withPendingRename(current, { from: current.activePath, to, spaceId });
      // Written before anything on disk changes; if it can't be, the rename never starts.
      if (!saveSpaceRegistry(storageRef.current, next)) return false;
      registryRef.current = next;
      lastOpenedRef.current = next;
      setRegistry(next);
      return true;
    },
    []
  );

  const completeRename = useCallback(
    (to: string): boolean => {
      const next = withRenamedActiveSpace(registryRef.current, to);
      // The in-memory registry follows the new path whatever the write does, so nothing in this session can go back
      // to the old one, and a failed open never restores it (`openFailed` returns to `lastOpened`, which is this).
      registryRef.current = next;
      lastOpenedRef.current = next;
      setRegistry(next);
      const saved = saveSpaceRegistry(storageRef.current, next);
      if (!saved) {
        say('The space was renamed, but Clutter couldn’t save that. It will finish the next time Clutter starts');
      }
      return saved;
    },
    [say]
  );

  const renameInactiveSpace = useCallback(
    (from: string, to: string): boolean => {
      const next = withRenamedInactiveSpace(registryRef.current, from, to);
      if (next === registryRef.current) return false;
      registryRef.current = next;
      setRegistry(next);
      const lastOpened = lastOpenedRef.current;
      if (!lastOpened) return true; // Nothing has opened yet: `confirmOpened` writes it with the Space.
      const remembered = withRenamedInactiveSpace(lastOpened, from, to);
      lastOpenedRef.current = remembered;
      if (!saveSpaceRegistry(storageRef.current, remembered)) {
        say('The space was renamed, but Clutter couldn’t save that. It may show its old name after the next start');
        return false;
      }
      return true;
    },
    [say]
  );

  const abandonRename = useCallback((): boolean => {
    const next = withoutPendingRename(registryRef.current);
    registryRef.current = next;
    lastOpenedRef.current = next;
    setRegistry(next);
    return saveSpaceRegistry(storageRef.current, next);
  }, []);

  const chooseSpace = useCallback(async (onRefusal?: (message: string) => void): Promise<string | null> => {
    const picked = await pick?.();
    if (!picked) return null;
    const refusal = await accept?.(picked);
    if (refusal) {
      // A caller with a place of its own for the message (a dialog the user is choosing the folder in) shows it there,
      // next to the choice it is about; otherwise it is the registry's notice. Never both.
      (onRefusal ?? say)(refusal);
      return null;
    }
    return normalizeSpacePath(picked);
  }, [pick, accept, say]);

  const confirmOpened = useCallback(() => {
    // The Space being removed is forgotten together with this save, so a crash can't persist one without the other.
    // Not if the user went back to it meanwhile: it is active again, and stays.
    const removing = pendingRemovalRef.current;
    finishRemoval();
    const opened =
      removing !== null && removing !== registryRef.current.activePath
        ? withoutSpace(registryRef.current, removing)
        : registryRef.current;
    if (opened !== registryRef.current) {
      registryRef.current = opened;
      setRegistry(opened);
    }
    lastOpenedRef.current = opened;
    pendingSelectionRef.current = null;
    if (!saveSpaceRegistry(storageRef.current, opened)) {
      say('This space is open, but Clutter couldn’t save it, so it won’t be reopened next launch');
    }
  }, [say]);

  const openFailed = useCallback(
    (reason: string) => {
      // The replacement didn't open, so the Space being removed stays registered.
      finishRemoval();
      const lastOpened = lastOpenedRef.current;
      if (!lastOpened || lastOpened.activePath === registryRef.current.activePath) {
        return false;
      }
      say(`${unavailableMessage(registryRef.current.activePath ?? '')} (${reason})`);
      setRegistry(lastOpened);
      return true;
    },
    [say]
  );

  return {
    registry,
    ready,
    activeSpaceMissing: missingPath !== null && missingPath === registry.activePath,
    missingPaths,
    refreshAvailability,
    fallbackCandidates,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    chooseSpace: pick ? chooseSpace : undefined,
    switchSpace,
    removeSpace,
    removeActiveSpace,
    lifecycle,
    notify: say,
    beginRename,
    completeRename,
    abandonRename,
    renameInactiveSpace,
    selectSpace,
    cancelSelection,
    abortPendingRemoval: finishRemoval,
    confirmOpened,
    openFailed,
  };
}
