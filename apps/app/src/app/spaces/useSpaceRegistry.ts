import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultSpaceStorage,
  loadSpaceRegistry,
  normalizeSpacePath,
  saveSpaceRegistry,
  withActiveSpace,
  type SpaceRegistry,
  type SpaceRegistryStorage,
} from './spaceRegistry';

export interface SpaceRegistryDeps {
  defaultPath: string;
  /** Read-only check that a folder can be opened as a Space. */
  probe(path: string): Promise<boolean>;
  /** The folder picker; `null` means cancelled. Absent where there is none. */
  pick?: () => Promise<string | null>;
  storage?: SpaceRegistryStorage | null;
}

export interface SpaceRegistryState {
  registry: SpaceRegistry;
  /** False until startup has checked that the stored active Space is still openable. */
  ready: boolean;
  /** A user-facing message about the last refused or failed switch; cleared by `dismissNotice`. */
  notice: { id: number; text: string } | null;
  dismissNotice(): void;
  addSpace?: () => Promise<void>;
  switchSpace(path: string): Promise<void>;
  /** The active Space opened: this registry is now the one to restore at the next launch. */
  confirmOpened(): void;
  /**
   * The active Space failed to open. When an earlier Space had opened, the registry goes back
   * to it (so the current Space is never lost) and this returns `true`; otherwise `false`.
   */
  openFailed(reason: string): boolean;
}

function unavailableMessage(path: string): string {
  return `Can't open "${path}". The folder is missing, unreadable, or outside the allowed location.`;
}

export function useSpaceRegistry(deps: SpaceRegistryDeps): SpaceRegistryState {
  const { defaultPath, probe, pick } = deps;
  const storage = deps.storage === undefined ? defaultSpaceStorage() : deps.storage;
  const storageRef = useRef(storage);

  const [registry, setRegistry] = useState(() => loadSpaceRegistry(storage, defaultPath));
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<SpaceRegistryState['notice']>(null);
  // The registry as of the last Space that actually opened — what a failed switch returns to.
  const lastOpenedRef = useRef<SpaceRegistry | null>(null);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const say = useCallback((text: string) => setNotice({ id: Date.now(), text }), []);

  // Startup: if the stored active Space has gone missing (an unplugged drive, a deleted folder),
  // start in the first registered Space that still opens instead of recreating the missing one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = registryRef.current;
      for (const path of [current.activePath, ...current.paths.filter((p) => p !== current.activePath)]) {
        if (await probe(path)) {
          if (!cancelled && path !== current.activePath) {
            setRegistry(withActiveSpace(current, path));
            say(unavailableMessage(current.activePath));
          }
          break;
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Startup only; `probe` and `say` are stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = useCallback(
    async (rawPath: string) => {
      const path = normalizeSpacePath(rawPath);
      if (path === registryRef.current.activePath) {
        return;
      }
      if (!(await probe(path))) {
        say(unavailableMessage(path));
        return;
      }
      setRegistry((current) => withActiveSpace(current, path));
    },
    [probe, say]
  );

  const addSpace = useCallback(async () => {
    const picked = await pick?.();
    if (picked) {
      await activate(picked);
    }
  }, [pick, activate]);

  const confirmOpened = useCallback(() => {
    lastOpenedRef.current = registryRef.current;
    saveSpaceRegistry(storageRef.current, registryRef.current);
  }, []);

  const openFailed = useCallback(
    (reason: string) => {
      const lastOpened = lastOpenedRef.current;
      if (!lastOpened || lastOpened.activePath === registryRef.current.activePath) {
        return false;
      }
      say(`${unavailableMessage(registryRef.current.activePath)} (${reason})`);
      setRegistry(lastOpened);
      return true;
    },
    [say]
  );

  return {
    registry,
    ready,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    addSpace: pick ? addSpace : undefined,
    switchSpace: activate,
    confirmOpened,
    openFailed,
  };
}
