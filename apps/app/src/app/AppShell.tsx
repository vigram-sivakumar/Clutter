import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Application } from '../core/application/Application';
import { VaultRootMissingError } from '../core/vault/providers/VaultRootMissingError';
import { normalizeAllTablesInMarkdown } from '../features/markdown/editor/codemirror/table/tableColumnNormalization';

import { Toast } from '../components/toast/Toast';
import { probeSpaceFolder } from '../core/vault/providers/probeSpaceFolder';
import {
  createSpaceFolder,
  isTooBroadForSpace,
  resolveSpaceParent,
} from '../core/vault/providers/spaceFolders';

import { AppLayout } from './layouts/app-layout/AppLayout';
import { useFrontendReady } from './frontendReady';
import { StartupFrame } from './StartupFrame';
import { scheduleAfterFirstPaint } from './scheduleAfterFirstPaint';
import { createWindowCloseHandler } from './windowCloseHandler';
import { WelcomeScreenDialog } from '../components/welcome-screen/WelcomeScreenDialog';
import { pickSpaceFolder } from './spaces/pickSpaceFolder';
import { SpacesContext, type SpacesApi } from './spaces/SpacesContext';
import { listSpaces, normalizeSpacePath, spaceName } from './spaces/spaceRegistry';
import { ActiveSpaceAvatarContext } from '../components/space-avatar/ActiveSpaceAvatarContext';
import type { SpaceAvatarProps } from '../components/space-avatar/SpaceAvatar';
import { useSpaceRegistry } from './spaces/useSpaceRegistry';

/**
 * The first-run Welcome screen's background (a remote image, so it needs the network; offline it is just
 * the plain themed surface).
 */
const WELCOME_BACKGROUND_IMAGE =
  'https://images.unsplash.com/flagged/photo-1572392640988-ba48d1a74457?q=80&w=1364&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D';

const TOO_BROAD_MESSAGE =
  'That folder is too broad to be a space (your home folder or the disk root). Choose a more specific folder.';

/** Why an error rejected an open. The fs plugin rejects with plain strings, not `Error`s. */
function failureReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error !== '') return error;
  return 'Failed to open vault';
}

/** A picked folder is accepted unless it is too broad to scan and write into (see `isTooBroadForSpace`). */
async function acceptPickedSpace(path: string): Promise<string | null> {
  return (await isTooBroadForSpace(path)) ? TOO_BROAD_MESSAGE : null;
}

/** Closes an Application that never became (or no longer is) the open one; a failed close is only logged. */
async function discardApplication(application: Application): Promise<void> {
  try {
    await application.close();
  } catch (closeError) {
    console.warn('Failed to close a discarded Application:', closeError);
  }
}

export function AppShell() {
  // Outside Tauri (npm run dev:web) the Space is just a namespace string for an in-memory vault
  // (Application.bootstrap() picks InMemoryVaultFileSystem when !isTauri()), and there is no folder
  // picker to add another. The desktop app has no default: until a Space is configured the registry
  // is empty and the Welcome dialog is shown.
  const defaultVaultPath = isTauri() ? undefined : '/web-dev-vault';

  // Which Spaces exist and which is wanted (ADR-056). A change of `vaultPath` starts the switch
  // described at the effect below; there is exactly one open Application at a time.
  const spaces = useSpaceRegistry({
    defaultPath: defaultVaultPath,
    probe: probeSpaceFolder,
    pick: isTauri() ? pickSpaceFolder : undefined,
    accept: isTauri() ? acceptPickedSpace : undefined,
  });
  // `null`: no Space configured (desktop first run). Nothing is bootstrapped.
  const vaultPath = spaces.registry.activePath;

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The Space path whose folder `bootstrap` found missing (it was there when startup probed it, or the
  // probe was skipped). Like `spaces.activeSpaceMissing` it shows the Welcome dialog and leaves the
  // registry untouched; it only counts while that path is still the active one.
  const [missingRoot, setMissingRoot] = useState<string | null>(null);
  // A Space chosen in the Welcome dialog is being opened. The dialog stays up (never the "Opening
  // Clutter…" frame) until it has opened; on failure the registry is put back and the reason goes
  // to the dialog instead of the full-screen error.
  const [onboardingPending, setOnboardingPending] = useState(false);
  // The active Space was lost (deleted or moved, at runtime or found missing at startup) and the shell
  // is looking for another registered Space to open in its place. While it does, neither the workspace
  // nor the Welcome dialog is shown — just the opening frame. `recoveryDoneFor` is the lost path for
  // which that search came up empty, which is what finally lets the Welcome dialog appear for it.
  // A ref read straight at render (plus a forced re-render when it changes), not state: the search must
  // suppress the Welcome dialog from the very first render in which the replacement Space starts to open,
  // whatever order React flushes the several state updates of that sequence in.
  const recoveringRef = useRef(false);
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const recovering = recoveringRef.current;
  const [recoveryDoneFor, setRecoveryDoneFor] = useState<string | null>(null);
  const onboardingRef = useRef<{
    path: string;
    settle: (message: string | null) => void;
    /** The `missingRoot` this attempt cleared, put back if the attempt fails. */
    restoreMissingRoot: string | null;
  } | null>(null);

  // The shell always renders a screen (a placeholder while the vault opens,
  // then the workspace or an error), so there is nothing to decide and it
  // never waits for vault bootstrap — only for the window-close handler below,
  // which must be registered before the native window is revealed.
  const [closeHandlerReady, setCloseHandlerReady] = useState(!isTauri());
  useFrontendReady(closeHandlerReady);

  // Read by the close handler, which is registered before bootstrap starts and
  // so can't close over an Application that doesn't exist yet.
  const applicationRef = useRef<Application | null>(null);
  const bootstrapRef = useRef<Promise<void> | null>(null);
  // The Space path `applicationRef` was opened for, the newest request (a run is stale once a newer
  // one has started), and the tail of the serialized commit steps (see the effect below).
  const openedPathRef = useRef<string | null>(null);
  const ticketRef = useRef(0);
  const commitChainRef = useRef<Promise<void>>(Promise.resolve());

  // Intercept the actual window close so dirty content isn't silently lost
  // (autosave-execution-model.md §7) — Application.close() flushes it. The
  // handler is registered here, ahead of and independent of the vault
  // bootstrap, and copes with Application not existing yet (see
  // createWindowCloseHandler). Application itself stays unaware of the Tauri
  // window API by design (M8's audit); this only triggers its already-orderly
  // close() at the right moment. There is no native window to intercept in
  // the web runtime (a browser tab close can't be gated the same way, and the
  // in-memory web vault has nothing durable to protect on close anyway).
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const handler = createWindowCloseHandler({
      getBootstrap: () => bootstrapRef.current,
      getApplication: () => applicationRef.current,
      destroyWindow: () => getCurrentWindow().destroy(),
    });
    getCurrentWindow()
      .onCloseRequested(handler)
      .then((unlistenFn) => {
        if (disposed) unlistenFn();
        else unlisten = unlistenFn;
      })
      .catch((registrationError) => {
        console.error(
          'Failed to register the window close handler:',
          registrationError
        );
        if (!disposed) {
          setError(
            'Failed to set up window handling. Restart Clutter to continue.'
          );
        }
      })
      .finally(() => {
        // Still reveal the window on failure so the error above is visible.
        if (!disposed) setCloseHandlerReady(true);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Opening or switching to the Space the registry names (ADR-056).
  //
  // The first open is the startup path: a "Opening Clutter…" frame until the workspace is ready.
  // A later switch never shows it. The next Application is bootstrapped (filesystem, scan, stores,
  // services) while the current one stays mounted and usable; only once it is built does the
  // short commit run: close the current Application (flushing its dirty content and stopping its
  // watcher, which is a single native slot that must be free), open the new one (start its
  // watcher, restore its session), and swap the UI in one render. A newer request supersedes an
  // older one that has not committed yet: the older one's built Application is closed and unused.
  useEffect(() => {
    if (!spaces.ready) return;

    // Nothing to open — no Space configured, or the configured folder is confirmed missing (and
    // bootstrap would create it): there is no Application, and the Welcome dialog is showing.
    if (vaultPath === null || spaces.activeSpaceMissing || missingRoot === vaultPath) {
      setIsLoading(false);
      return;
    }
    const openPath: string = vaultPath;

    // Already showing it — or the user went back to it while another was being prepared.
    if (openedPathRef.current === openPath) {
      ticketRef.current++;
      return;
    }

    const ticket = ++ticketRef.current;
    const isStale = () => ticketRef.current !== ticket;

    const prepare = (path: string) =>
      // Table-column normalization applies to what's written to disk (the durable representation),
      // not to the live editing session — see `PageOperations`'s own constructor doc comment for why
      // this is injected here, the one place UI and the Composition Root already meet, rather than
      // imported inside `core/application/`.
      Application.bootstrap(path, normalizeAllTablesInMarkdown);

    async function commit(prepared: Application): Promise<void> {
      if (isStale()) {
        await discardApplication(prepared);
        return;
      }

      const previous = applicationRef.current;
      const previousPath = openedPathRef.current;

      if (previous) {
        applicationRef.current = null;
        await previous.close();
      }

      try {
        await prepared.open();
      } catch (openError) {
        await discardApplication(prepared);
        if (previous && previousPath) {
          // The previous Space is already closed, so put it back before reporting the failure.
          const restored = await prepare(previousPath);
          await restored.open();
          applicationRef.current = restored;
          setApplication(restored);
        }
        throw openError;
      }

      openedPathRef.current = openPath;
      applicationRef.current = prepared;
      setApplication(prepared);
      setError(null);
      // Only a Space that actually opened is remembered for the next launch.
      spaces.confirmOpened();
      if (onboardingRef.current?.path === openPath) {
        const { settle } = onboardingRef.current;
        onboardingRef.current = null;
        setOnboardingPending(false);
        settle(null);
      }
    }

    async function run(): Promise<void> {
      let prepared: Application | null = null;
      try {
        prepared = await prepare(openPath);

        if (isStale()) {
          await discardApplication(prepared);
          return;
        }

        // Commits never overlap: each waits for the one before it.
        const committing = commitChainRef.current.then(() => commit(prepared as Application));
        commitChainRef.current = committing.catch(() => {});
        await committing;
      } catch (loadError) {
        console.error('Failed to open vault:', loadError);
        if (prepared && applicationRef.current !== prepared) {
          await discardApplication(prepared);
        }
        if (isStale()) return;

        // A Space chosen in the Welcome dialog failed to open: nothing was persisted, so put the
        // previous registry back and report the reason in the dialog, which stays open.
        const onboarding = onboardingRef.current;
        if (onboarding?.path === openPath && applicationRef.current === null) {
          onboardingRef.current = null;
          spaces.cancelSelection();
          setMissingRoot(onboarding.restoreMissingRoot);
          setOnboardingPending(false);
          onboarding.settle(
            loadError instanceof VaultRootMissingError
              ? 'That folder no longer exists.'
              : `Couldn't open "${openPath}": ${failureReason(loadError)}.`
          );
          return;
        }

        if (loadError instanceof VaultRootMissingError && applicationRef.current === null) {
          setMissingRoot(openPath);
          void recoverRef.current(openPath);
          return;
        }

        const reason = failureReason(loadError);
        // A failed switch returns the registry to the Space that is still showing. Only a failure
        // with no Space left open (the first open, or a failed return to the previous one) becomes
        // the full-screen error.
        if (applicationRef.current === null || !spaces.openFailed(reason)) {
          setError(reason);
        }
      } finally {
        if (!isStale()) {
          setIsLoading(false);
        }
      }
    }

    bootstrapRef.current = run();
    // `spaces` is a fresh object each render; only a change of root, readiness or missing-folder state starts a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, spaces.ready, spaces.activeSpaceMissing, missingRoot]);

  // Unmount: supersede any run in flight and close the open Application.
  useEffect(
    () => () => {
      ticketRef.current++;
      const open = applicationRef.current;
      applicationRef.current = null;
      openedPathRef.current = null;
      void open?.close();
    },
    []
  );

  // The open vault's folder was deleted or moved away (ADR-056 amendment). The Application has already
  // sealed its filesystem and stopped its timers; here it is discarded and the Welcome dialog takes
  // its place — no workspace, no space selector — with the registry left exactly as stored (the missing
  // path included). Ignored if that Application is no longer the open one (a stale callback).
  function handleVaultLost(lost: Application) {
    if (applicationRef.current !== lost) return;
    const lostPath = openedPathRef.current;
    applicationRef.current = null;
    openedPathRef.current = null;
    setApplication(null);
    void discardApplication(lost);
    if (lostPath !== null) {
      setMissingRoot(lostPath);
      setRecoveryDoneFor(null);
      void recoverRef.current(lostPath);
    }
  }

  // While a vault is open, check its folder still exists whenever the window comes back into view
  // (a folder is deleted or moved in another app, which means leaving this one) — plus the
  // Application's own watcher hint. No polling.
  useEffect(() => {
    if (!application || !isTauri()) return;
    const unsubscribe = application.onRootLost(() => handleVaultLost(application));
    const verify = () => {
      void application.verifyRoot();
      void spaces.refreshAvailability();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') verify();
    };
    window.addEventListener('focus', verify);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', verify);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // `handleVaultLost` only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application]);

  // The parsed-note cache write (ADR-053) is background housekeeping: it waits
  // until the workspace has rendered and painted, and application.open()
  // returning does not mean that. Best effort; never affects editing.
  useEffect(() => {
    if (!application) return;
    return scheduleAfterFirstPaint(() => void application.persistParsedNoteCache());
  }, [application]);

  // The active Space `lostPath` can't be used. Tries the other registered Spaces whose folders exist, in
  // registry order from the lost one's position (see `fallbackCandidates`), each through the same
  // validated open as the Welcome dialog: the registry's active path changes in memory for the attempt,
  // is persisted only if it opens, and is put back if it doesn't — then the next candidate is tried.
  // Only when none opens does the Welcome dialog show. The lost entry stays in the registry; nothing is
  // created, and a lost folder is never treated as an empty vault.
  async function recoverFromLostSpace(lostPath: string): Promise<void> {
    recoveringRef.current = true;
    forceRender();
    let opened = false;
    try {
      for (const candidate of await spaces.fallbackCandidates(lostPath)) {
        if ((await openSpaceRef.current(candidate)) === null) {
          opened = true;
          break;
        }
      }
    } finally {
      recoveringRef.current = false;
      if (!opened) setRecoveryDoneFor(lostPath);
      forceRender();
    }
    if (opened) void spaces.refreshAvailability();
  }

  // Effects and callbacks created in an earlier render must still call the current versions.
  const recoverRef = useRef(recoverFromLostSpace);
  recoverRef.current = recoverFromLostSpace;
  const openSpaceRef = useRef(openSpaceFromWelcome);
  openSpaceRef.current = openSpaceFromWelcome;

  // Startup with a saved active Space whose folder is confirmed missing: the same fallback.
  const startupRecoveryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!spaces.ready || !spaces.activeSpaceMissing || vaultPath === null) return;
    if (startupRecoveryRef.current === vaultPath) return;
    startupRecoveryRef.current = vaultPath;
    void recoverRef.current(vaultPath);
    // Once per lost path; everything it reads is a ref or a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces.ready, spaces.activeSpaceMissing]);

  // Opens `rawPath` as the first Space from the Welcome dialog. Resolves `null` once it has opened
  // (and been remembered), or a message for the dialog. The registry only changes through
  // `selectSpace`, is put back on failure, and is written only by `confirmOpened`.
  async function openSpaceFromWelcome(rawPath: string): Promise<string | null> {
    if (onboardingRef.current) return 'Already opening a space.';
    const path = normalizeSpacePath(rawPath);
    const status = await probeSpaceFolder(path);
    if (status === 'missing') return "That folder doesn't exist.";
    if (status !== 'available') {
      return "Clutter can't open that folder. It may not be a folder, or access was denied.";
    }
    return new Promise<string | null>((resolve) => {
      onboardingRef.current = { path, settle: resolve, restoreMissingRoot: missingRoot };
      setOnboardingPending(true);
      setMissingRoot(null);
      // The configured Space is the one `bootstrap` found missing and it is now back: clearing the
      // report above is all that is needed for the open effect to run again.
      if (missingRoot === path && spaces.registry.activePath === path) return;
      void spaces.selectSpace(path).then((accepted) => {
        if (!accepted && onboardingRef.current?.path === path) {
          setMissingRoot(onboardingRef.current.restoreMissingRoot);
          onboardingRef.current = null;
          setOnboardingPending(false);
          resolve("Clutter couldn't start opening that folder.");
        }
      });
    });
  }

  async function selectFolderFromWelcome(): Promise<string | null> {
    const picked = await pickSpaceFolder();
    if (picked === null) return null;
    // Any other folder the user can pick is fine. Access to one outside the static `$HOME/**` scope comes
    // from the picker's own grant, which the persisted-scope plugin saves for the next launch.
    const refusal = await acceptPickedSpace(picked);
    if (refusal !== null) return refusal;
    return openSpaceFromWelcome(picked);
  }

  const spacesApi = useMemo<SpacesApi>(
    () => ({
      // Registered is not available: a Space whose folder is confirmed missing is left out of the
      // selector (it stays in the registry for recovery). The open Space is always listed.
      spaces: listSpaces(spaces.registry).filter(
        (space) => space.path === spaces.registry.activePath || !spaces.missingPaths.has(space.path)
      ),
      // Only provided with an open Application, which means a Space is configured.
      activePath: spaces.registry.activePath ?? '',
      onAddSpace: spaces.addSpace && (() => void spaces.addSpace?.()),
      onSwitchSpace: (path) => void spaces.switchSpace(path),
      refreshAvailability: () => void spaces.refreshAvailability(),
    }),
    [spaces.registry, spaces.missingPaths, spaces.addSpace, spaces.switchSpace, spaces.refreshAvailability]
  );

  // The open Space's avatar, for every surface that shows the Space root. No avatar is chosen
  // yet, so it is the initial of the Space's folder name.
  const activeSpaceAvatar = useMemo<SpaceAvatarProps | null>(
    () =>
      application
        ? {
            avatar: { type: 'initial' },
            folderName: spaceName(application.vault.root),
            resolveImageUrl: (src) => application.resolveCoverImageForDisplay(src),
          }
        : null,
    [application]
  );

  const notice = spaces.notice && (
    <Toast
      toast={{ id: spaces.notice.id, text: spaces.notice.text, tone: 'error' }}
      onDismiss={spaces.dismissNotice}
      durationMs={8000}
    />
  );

  if (error) {
    return <StartupFrame tone="error">{error}</StartupFrame>;
  }

  // A Space can't be shown, and no other has opened (yet): either none is configured, or the configured
  // one's folder is confirmed missing — and the search for another registered Space (see
  // `recoverFromLostSpace`) has finished empty-handed. The themed startup surface stays mounted behind the
  // Welcome dialog. The real workspace (AppLayout) needs an Application, so it cannot mount before a Space
  // exists — and none is faked to draw it.
  const lostActiveSpace = spaces.activeSpaceMissing || (vaultPath !== null && missingRoot === vaultPath);
  if (
    !application &&
    !recovering &&
    (vaultPath === null || onboardingPending || (lostActiveSpace && recoveryDoneFor === vaultPath))
  ) {
    return (
      <>
        <StartupFrame backgroundImage={WELCOME_BACKGROUND_IMAGE}>{null}</StartupFrame>
        <WelcomeScreenDialog
          onSelectFolder={selectFolderFromWelcome}
          onResolveSpaceParent={resolveSpaceParent}
          onCreateFolder={createSpaceFolder}
          onOpenSpace={openSpaceFromWelcome}
        />
      </>
    );
  }

  // Looking for a replacement for a lost active Space (or about to): the opening frame, not the dialog.
  if (!application && (recovering || (lostActiveSpace && recoveryDoneFor !== vaultPath))) {
    return (
      <>
        <StartupFrame>Opening Clutter…</StartupFrame>
        {notice}
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <StartupFrame>Opening Clutter…</StartupFrame>
        {notice}
      </>
    );
  }

  if (!application) {
    return <StartupFrame tone="error">No vault loaded</StartupFrame>;
  }

  // Keyed by root: AppLayout reads per-Space state (view configs, overlays, pending reveals) once
  // at mount, so a different Space must mount it fresh rather than reuse the previous one's.
  return (
    <SpacesContext.Provider value={spacesApi}>
      <ActiveSpaceAvatarContext.Provider value={activeSpaceAvatar}>
        <AppLayout key={application.vault.root} application={application} />
        {notice}
      </ActiveSpaceAvatarContext.Provider>
    </SpacesContext.Provider>
  );
}
