import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpaceFolderStatus } from '../../core/vault/providers/probeSpaceFolder';
import {
  defaultSpaceStorage,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  withReplacedSpace,
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
}

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
  /** A user-facing message about the last refused or failed switch; cleared by `dismissNotice`. */
  notice: { id: number; text: string } | null;
  dismissNotice(): void;
  /**
   * "New space": shows the folder picker and vets the choice. Resolves the chosen folder's normalized path,
   * or `null` when the picker was cancelled or the folder refused (a refusal is shown as a notice).
   * Changes nothing — the folder is only a candidate until the caller confirms it with `switchSpace`.
   * Absent where there is no picker.
   */
  chooseSpace?: () => Promise<string | null>;
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
   * First-run / recovery selection: like `switchSpace`, but resolves whether the folder was accepted
   * for opening, and the previous registry (and missing-folder report) can be put back with
   * `cancelSelection` if the open then fails. Nothing is persisted until `confirmOpened`.
   */
  selectSpace(path: string): Promise<boolean>;
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

  const say = useCallback((text: string) => setNotice({ id: Date.now(), text }), []);

  // Startup: probe the stored active Space. A confirmed-missing folder is reported
  // (`activeSpaceMissing`) instead of letting a bootstrap run — the shell then tries the next available
  // registered Space (`fallbackCandidates`) and shows the Welcome dialog only if none opens. Any other
  // failure (permission, scope) is left to the caller's existing open-error handling. This never
  // writes: the registry — a missing path included — stays as stored until a Space has actually opened.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activePath = registryRef.current.activePath;
      if (activePath !== null && (await probe(activePath)) === 'missing' && !cancelled) {
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

  const switchSpace = useCallback(
    (path: string, replaces?: string) => activate(path, false, replaces),
    [activate]
  );
  const removeSpace = useCallback(
    (path: string) => {
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
    [say]
  );
  const selectSpace = useCallback((path: string) => activate(path, true), [activate]);

  const cancelSelection = useCallback(() => {
    const pending = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    if (!pending) return;
    setRegistry(pending.previous);
    setMissingPath(pending.previousMissing);
  }, []);

  const chooseSpace = useCallback(async (): Promise<string | null> => {
    const picked = await pick?.();
    if (!picked) return null;
    const refusal = await accept?.(picked);
    if (refusal) {
      say(refusal);
      return null;
    }
    return normalizeSpacePath(picked);
  }, [pick, accept, say]);

  const confirmOpened = useCallback(() => {
    lastOpenedRef.current = registryRef.current;
    pendingSelectionRef.current = null;
    if (!saveSpaceRegistry(storageRef.current, registryRef.current)) {
      say('This space is open, but Clutter couldn’t save it, so it won’t be reopened next launch');
    }
  }, [say]);

  const openFailed = useCallback(
    (reason: string) => {
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
    selectSpace,
    cancelSelection,
    confirmOpened,
    openFailed,
  };
}
