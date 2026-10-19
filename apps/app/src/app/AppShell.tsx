import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import {
  Application,
  type SpaceProfileChange,
} from '../core/application/Application';
import { VaultRootMissingError } from '../core/vault/providers/VaultRootMissingError';
import { normalizeAllTablesInMarkdown } from '../features/markdown/editor/codemirror/table/tableColumnNormalization';

import { Toast } from '../components/toast/Toast';
import { probeSpaceFolder } from '../core/vault/providers/probeSpaceFolder';
import {
  createSpaceFolder,
  renameSpaceFolder,
  isTooBroadForSpace,
  resolveSpaceParent,
} from '../core/vault/providers/spaceFolders';

import { AppLayout } from './layouts/app-layout/AppLayout';
import { useFrontendReady } from './frontendReady';
import { StartupFrame } from './StartupFrame';
import { scheduleAfterFirstPaint } from './scheduleAfterFirstPaint';
import { createWindowCloseHandler } from './windowCloseHandler';
import { WelcomeScreenDialog } from '../components/welcome-screen/WelcomeScreenDialog';
import { Dialog } from '../components/dialog/Dialog';
import {
  SpaceDetails,
  draftForExistingFolder,
  type CreateFolderResult,
  type NewSpaceDraft,
} from '../components/space-details/SpaceDetails';
import { pickSpaceFolder } from './spaces/pickSpaceFolder';
import { SpacesContext, type SpacesApi } from './spaces/SpacesContext';
import { localCoverImageUrlResolver } from '../core/vault/providers/LocalCoverImageUrlResolver';
import {
  listSpaces,
  normalizeSpacePath,
  spaceName,
} from './spaces/spaceRegistry';
import { LocalVaultProvider } from '../core/vault/providers/LocalFileSystem';
import {
  readSpaceProfile,
  type SpaceProfile,
} from '../core/application/space/SpaceProfileStore';
import { ActiveSpaceAvatarContext } from '../components/space-avatar/ActiveSpaceAvatarContext';
import type {
  SpaceAvatarChoice,
  SpaceAvatarProps,
} from '../components/space-avatar/SpaceAvatar';
import { useSpaceRegistry } from './spaces/useSpaceRegistry';
import type { NarrowSidebarOverride } from './layouts/app-layout/useSidebarVisibility';
import { MissingSpaceDialog } from '@components/missing-space-dialog/MissingSpaceDialog';

/** A Space's own profile, read without opening it (read-only, never throws). The web runtime has none. */
async function readProfileAt(path: string): Promise<SpaceProfile | null> {
  return isTauri()
    ? readSpaceProfile(new LocalVaultProvider(path), path)
    : null;
}

/** The avatar a Space carries, ready to show: an image's Space-relative reference becomes its absolute path. */
function displayAvatar(
  path: string,
  profile: SpaceProfile | null
): SpaceAvatarChoice | undefined {
  const avatar = profile?.avatar;
  if (!avatar) return undefined;
  return avatar.type === 'image'
    ? { type: 'image', src: `${path}/${avatar.src}` }
    : avatar;
}

/**
 * A Space avatar's image is the absolute path of a file the user picked (it lives outside every Space), so
 * it loads through the Tauri file resolver. Where there is none (the web runtime) it is `null`, which
 * shows the Space's initial instead.
 */
function resolveSpaceAvatarImage(path: string): string | null {
  try {
    return localCoverImageUrlResolver.toLoadableUrl(path);
  } catch {
    return null;
  }
}

/**
 * The first-run Welcome screen's background (a remote image, so it needs the network; offline it is just
 * the plain themed surface).
 */
const WELCOME_BACKGROUND_IMAGE =
  'https://images.unsplash.com/flagged/photo-1572392640988-ba48d1a74457?q=80&w=1364&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D';

const TOO_BROAD_MESSAGE =
  'That folder is too broad to be a space (your home folder or the disk root). Choose a more specific folder';

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
  const [pendingSpace, setPendingSpace] = useState<NewSpaceDraft | null>(null);
  // Choosing a Space whose folder is missing opens the "Space not found" dialog for it, not a toast.
  const [missingSpacePath, setMissingSpacePath] = useState<string | null>(null);
  // The sidebar's temporary toggle while the window is narrow. Kept here, above the layout that is rebuilt for
  // every Space, so switching Spaces never changes whether the sidebar is shown.
  const [narrowSidebarOverride, setNarrowSidebarOverride] =
    useState<NarrowSidebarOverride>(null);
  // What each registered Space says about itself (`space` in its own `.clutter/workspace.json`), read from
  // the Spaces — never stored here. Display only; an unreadable or never-opened Space has none.
  const [profiles, setProfiles] = useState<
    Readonly<Record<string, SpaceProfile | null>>
  >({});
  const [profilesTick, refreshProfiles] = useReducer(
    (count: number) => count + 1,
    0
  );
  // The folder the open dialog was prefilled from, and the avatar it was prefilled with: a confirmed avatar
  // equal to it is no change at all (an existing Space's avatar is only touched when the user changes it).
  const prefilledRef = useRef<{
    path: string;
    avatar: SpaceAvatarChoice | undefined;
  } | null>(null);
  // Where the folder in the open dialog was before the dialog renamed it (ADR-056, "renaming a Space's
  // folder"): the registry entry to replace, in place, when the renamed folder opens.
  const renamedFromRef = useRef<string | null>(null);
  // The confirmed profile change for the Space about to open; applied inside it, once it has opened.
  const pendingProfileRef = useRef<{
    path: string;
    change: SpaceProfileChange;
  } | null>(null);
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
  // The lost Spaces whose replacement search is queued or running. The open effect never bootstraps one of
  // them: the lost folder is not a candidate, and re-opening it mid-search only fails with
  // `VaultRootMissingError` and starts a second, overlapping search. How many searches are queued, and the
  // tail of the queue (they run one at a time, see `recoverFromLostSpace`).
  const lostBeingRecoveredRef = useRef(new Set<string>());
  const recoveriesQueuedRef = useRef(0);
  const recoveryChainRef = useRef<Promise<void>>(Promise.resolve());
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
            'Failed to set up window handling. Restart Clutter to continue'
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
    if (
      vaultPath === null ||
      spaces.activeSpaceMissing ||
      missingRoot === vaultPath
    ) {
      setIsLoading(false);
      return;
    }
    const openPath: string = vaultPath;

    // Its replacement is being searched for right now (and the search is what decides what opens next).
    if (lostBeingRecoveredRef.current.has(openPath)) {
      setIsLoading(false);
      return;
    }

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
      // Whether the sidebar is open is the user's, not the Space's: the Space being switched to starts with
      // the state they have now, not with whatever its own saved session says.
      const sidebarVisible = previous?.workspace.isSidebarVisible;
      if (sidebarVisible !== undefined)
        prepared.workspace.setSidebarVisible(sidebarVisible);

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
          if (sidebarVisible !== undefined)
            restored.workspace.setSidebarVisible(sidebarVisible);
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
      // The Space's own profile, now that it is open and the user has confirmed it: its identity (the lazy
      // migration of a Space that has none) and any avatar change. A failure here never un-opens the Space.
      const pendingProfile =
        pendingProfileRef.current?.path === openPath
          ? pendingProfileRef.current
          : null;
      pendingProfileRef.current = null;
      try {
        await prepared.applySpaceProfile(pendingProfile?.change);
      } catch (profileError) {
        console.error('Saving the Space profile failed:', profileError);
      }
      refreshProfiles();
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
        const committing = commitChainRef.current.then(() =>
          commit(prepared as Application)
        );
        commitChainRef.current = committing.catch(() => {});
        await committing;
      } catch (loadError) {
        console.error('Failed to open vault:', loadError);
        // A confirmed profile change belongs to the open that just failed, never to a later one.
        if (pendingProfileRef.current?.path === openPath)
          pendingProfileRef.current = null;
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
              ? 'That folder no longer exists'
              : `Couldn’t open “${openPath}”: ${failureReason(loadError)}`
          );
          return;
        }

        if (
          loadError instanceof VaultRootMissingError &&
          applicationRef.current === null
        ) {
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
    const unsubscribe = application.onRootLost(() =>
      handleVaultLost(application)
    );
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
    return scheduleAfterFirstPaint(
      () => void application.persistParsedNoteCache()
    );
  }, [application]);

  // The active Space `lostPath` can't be used. Tries the other registered Spaces whose folders exist, in
  // registry order from the lost one's position (see `fallbackCandidates`), each through the same
  // validated open as the Welcome dialog: the registry's active path changes in memory for the attempt,
  // is persisted only if it opens, and is put back if it doesn't — then the next candidate is tried.
  // Only when none opens does the Welcome dialog show. The lost entry stays in the registry; nothing is
  // created, and a lost folder is never treated as an empty vault.
  //
  // Searches run one at a time, and the flag that keeps the opening frame up stays set until the last one
  // is done, so one search finishing can never expose the Welcome dialog while another is still opening a
  // replacement. A queued search whose loss has been overtaken (an Application is open again by the time
  // its turn comes) does nothing.
  function recoverFromLostSpace(lostPath: string): Promise<void> {
    // The same loss reported twice (the watcher hint and the focus check, say) is one search.
    if (lostBeingRecoveredRef.current.has(lostPath))
      return recoveryChainRef.current;
    recoveriesQueuedRef.current++;
    recoveringRef.current = true;
    lostBeingRecoveredRef.current.add(lostPath);
    forceRender();

    const search = async (): Promise<void> => {
      let opened = false;
      try {
        if (applicationRef.current !== null) {
          opened = true;
          return;
        }
        for (const candidate of await spaces.fallbackCandidates(lostPath)) {
          if ((await openSpaceRef.current(candidate)) === null) {
            opened = true;
            break;
          }
        }
      } finally {
        lostBeingRecoveredRef.current.delete(lostPath);
        recoveriesQueuedRef.current--;
        if (recoveriesQueuedRef.current === 0) recoveringRef.current = false;
        if (!opened) setRecoveryDoneFor(lostPath);
        forceRender();
      }
      if (opened) void spaces.refreshAvailability();
    };

    const searching = recoveryChainRef.current.then(search);
    recoveryChainRef.current = searching.catch(() => {});
    return searching;
  }

  // Effects and callbacks created in an earlier render must still call the current versions.
  const recoverRef = useRef(recoverFromLostSpace);
  recoverRef.current = recoverFromLostSpace;
  const openSpaceRef = useRef(openSpaceFromWelcome);
  openSpaceRef.current = openSpaceFromWelcome;

  // Startup with a saved active Space whose folder is confirmed missing: the same fallback.
  const startupRecoveryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!spaces.ready || !spaces.activeSpaceMissing || vaultPath === null)
      return;
    if (startupRecoveryRef.current === vaultPath) return;
    startupRecoveryRef.current = vaultPath;
    void recoverRef.current(vaultPath);
    // Once per lost path; everything it reads is a ref or a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces.ready, spaces.activeSpaceMissing]);

  // Opens `rawPath` as the first Space from the Welcome dialog. Resolves `null` once it has opened
  // (and been remembered), or a message for the dialog. The registry only changes through
  // `selectSpace`, is put back on failure, and is written only by `confirmOpened`.
  async function openSpaceFromWelcome(
    rawPath: string,
    avatar?: SpaceAvatarChoice
  ): Promise<string | null> {
    if (onboardingRef.current) return 'Already opening a space';
    const path = normalizeSpacePath(rawPath);
    const status = await probeSpaceFolder(path);
    if (status === 'missing') return 'That folder doesn’t exist';
    if (status !== 'available') {
      return 'Clutter can’t open that folder. It may not be a folder, or access was denied';
    }
    pendingProfileRef.current = {
      path,
      change: profileChangeFor(path, avatar),
    };
    return new Promise<string | null>((resolve) => {
      onboardingRef.current = {
        path,
        settle: resolve,
        restoreMissingRoot: missingRoot,
      };
      setOnboardingPending(true);
      setMissingRoot(null);
      // The configured Space is the one `bootstrap` found missing and it is now back: clearing the
      // report above is all that is needed for the open effect to run again.
      if (missingRoot === path && spaces.registry.activePath === path) return;
      void spaces.selectSpace(path).then((accepted) => {
        if (!accepted && onboardingRef.current?.path === path) {
          pendingProfileRef.current = null;
          setMissingRoot(onboardingRef.current.restoreMissingRoot);
          onboardingRef.current = null;
          setOnboardingPending(false);
          resolve('Clutter couldn’t start opening that folder');
        }
      });
    });
  }

  async function selectFolderFromWelcome(): Promise<
    NewSpaceDraft | string | null
  > {
    const picked = await pickSpaceFolder();
    if (picked === null) return null;
    // Any other folder the user can pick is fine. Access to one outside the static `$HOME/**` scope comes
    // from the picker's own grant, which the persisted-scope plugin saves for the next launch.
    const refusal = await acceptPickedSpace(picked);
    if (refusal !== null) return refusal;
    // Not opened yet: the dialog shows the space's settings first, and opens it on the user's confirm.
    return draftFromFolder(picked);
  }

  // The settings draft for an existing folder: its name, and the avatar the folder itself carries (a
  // read-only look at its own `.clutter/workspace.json`; nothing is created or written by selecting it).
  async function draftFromFolder(rawPath: string): Promise<NewSpaceDraft> {
    const path = normalizeSpacePath(rawPath);
    // The open Space can't be renamed underneath the running Application; anything else can.
    const draft: NewSpaceDraft = {
      ...draftForExistingFolder(path),
      nameLocked: path === spaces.registry.activePath,
    };
    const avatar = displayAvatar(path, await readProfileAt(path));
    prefilledRef.current = { path, avatar };
    renamedFromRef.current = null;
    return avatar ? { ...draft, avatar } : draft;
  }

  // What a confirmed avatar means for the Space: unchanged (the usual case), removed, an emoji, or a
  // new image — a path outside the Space, copied into its `Assets/` once it has opened.
  function profileChangeFor(
    path: string,
    avatar: SpaceAvatarChoice | undefined
  ): SpaceProfileChange {
    const prefilled =
      prefilledRef.current?.path === path
        ? prefilledRef.current.avatar
        : undefined;
    if (JSON.stringify(avatar) === JSON.stringify(prefilled)) return {};
    if (avatar === undefined) return { avatar: null };
    return avatar.type === 'emoji'
      ? { avatar: { type: 'emoji', emoji: avatar.emoji } }
      : { avatar: { type: 'image', sourcePath: avatar.src } };
  }

  // "New space" in the selector: the folder picker, then the Space Settings dialog. Until the user
  // confirms, the folder is only this pending draft — the registry and the active Space are untouched.
  // The draft starts from what the folder itself carries (its avatar, if it is a Space Clutter has opened).
  async function chooseSpaceForSettings() {
    const path = await spaces.chooseSpace?.();
    if (path === null || path === undefined) return;
    setPendingSpace(await draftFromFolder(path));
  }

  // The dialog's Create with a changed name: the folder is renamed in place first, and the dialog continues on
  // the renamed folder (its draft, and the avatar prefill, follow it). Nothing is registered or opened here;
  // a failed rename changes nothing at all.
  async function renamePendingSpaceFolder(
    path: string,
    name: string
  ): Promise<CreateFolderResult> {
    const renamed = await renameSpaceFolder(path, name);
    if ('error' in renamed) return renamed;
    const from = normalizeSpacePath(path);
    const to = normalizeSpacePath(renamed.path);
    renamedFromRef.current ??= from;
    if (prefilledRef.current?.path === from) {
      prefilledRef.current = { ...prefilledRef.current, path: to };
    }
    setPendingSpace(
      (current) =>
        current && {
          ...draftForExistingFolder(to),
          ...(current.avatar ? { avatar: current.avatar } : {}),
        }
    );
    return renamed;
  }

  // Confirming registers (or re-uses) the folder and starts the usual switch; the dialog closes once the
  // folder is accepted. A refused folder says why through the usual notice and the dialog stays.
  async function confirmPendingSpace(
    path: string,
    avatar?: SpaceAvatarChoice
  ): Promise<string | null> {
    const change = profileChangeFor(path, avatar);
    if (path === spaces.registry.activePath && applicationRef.current) {
      // Already the open Space: nothing to switch to, but a confirmed avatar change still applies.
      try {
        await applicationRef.current.applySpaceProfile(change);
        refreshProfiles();
        setPendingSpace(null);
        return null;
      } catch (profileError) {
        console.error('Saving the Space profile failed:', profileError);
        return 'Couldn’t save the space settings';
      }
    }
    pendingProfileRef.current = { path, change };
    // A folder the dialog renamed replaces its old registry entry in place (an unregistered one is just added).
    const replaces = renamedFromRef.current ?? undefined;
    if (await spaces.switchSpace(path, replaces)) {
      renamedFromRef.current = null;
      setPendingSpace(null);
    } else {
      pendingProfileRef.current = null;
    }
    return null;
  }

  // Re-read every registered Space's own profile when the list changes, a Space opens, its avatar is saved,
  // or the selector opens. Reads only: a folder that can't be read simply shows its initial.
  const registeredPathsKey = spaces.registry.paths.join('\n');
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        spaces.registry.paths.map(
          async (path) => [path, await readProfileAt(path)] as const
        )
      );
      if (!cancelled) setProfiles(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredPathsKey, profilesTick]);

  // "Remove space": forgets the missing Space's entry in Clutter. The folder and its files are never touched.
  function removeMissingSpace() {
    if (missingSpacePath !== null) spaces.removeSpace(missingSpacePath);
    setMissingSpacePath(null);
  }

  // "Change location": the same picker and checks as "New space". The folder that is chosen replaces the
  // missing entry in place and is opened straight away — no settings dialog. Choosing is the confirmation;
  // cancelling the picker, or a refused folder, changes nothing, and the registry only changes for good once the
  // folder has opened (a failed open puts the old entry back). The folder's own identity and avatar are read as
  // part of opening it; nothing is matched to the missing space automatically.
  async function changeMissingSpaceLocation() {
    const missing = missingSpacePath;
    setMissingSpacePath(null);
    const path = await spaces.chooseSpace?.();
    if (path === null || path === undefined || missing === null) return;
    pendingProfileRef.current = null;
    void spaces.switchSpace(path, missing);
  }

  // A Space whose folder is confirmed missing is not switched to: it opens the confirmation window instead of
  // the error toast. Checked at the moment it is chosen, so a folder that has come back opens normally; any
  // other refusal (unreadable, outside the allowed location) still explains itself through the usual notice.
  async function switchOrExplainMissing(path: string) {
    if ((await probeSpaceFolder(normalizeSpacePath(path))) === 'missing') {
      setMissingSpacePath(normalizeSpacePath(path));
      return;
    }
    void spaces.switchSpace(path);
  }

  const spacesApi = useMemo<SpacesApi>(
    () => ({
      // Every registered Space is listed, a missing one included: its name comes from its path, and its
      // avatar (kept inside the folder) is not available, so it shows its initial. Choosing it explains why
      // it can't be opened.
      spaces: listSpaces(spaces.registry).map((space) => {
        const avatar = displayAvatar(space.path, profiles[space.path] ?? null);
        const missing =
          space.path !== spaces.registry.activePath &&
          spaces.missingPaths.has(space.path);
        return {
          ...space,
          ...(avatar ? { avatar } : {}),
          ...(missing ? { missing: true } : {}),
        };
      }),
      // Only provided with an open Application, which means a Space is configured.
      activePath: spaces.registry.activePath ?? '',
      onAddSpace: spaces.chooseSpace && (() => void chooseSpaceForSettings()),
      resolveAvatarImageUrl: resolveSpaceAvatarImage,
      onSwitchSpace: (path) => {
        pendingProfileRef.current = null;
        void switchOrExplainMissing(path);
      },
      refreshAvailability: () => {
        void spaces.refreshAvailability();
        refreshProfiles();
      },
    }),
    [
      spaces.registry,
      spaces.missingPaths,
      spaces.chooseSpace,
      spaces.switchSpace,
      spaces.refreshAvailability,
      profiles,
    ]
  );

  // The open Space's avatar, for every surface that shows the Space root: the one the Space itself carries,
  // else the initial of the Space's folder name.
  const activeSpaceAvatar = useMemo<SpaceAvatarProps | null>(
    () =>
      application
        ? {
            avatar: displayAvatar(
              application.vault.root,
              profiles[application.vault.root] ?? null
            ) ?? { type: 'initial' },
            folderName: spaceName(application.vault.root),
            resolveImageUrl: resolveSpaceAvatarImage,
          }
        : null,
    [application, profiles]
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
  const lostActiveSpace =
    spaces.activeSpaceMissing ||
    (vaultPath !== null && missingRoot === vaultPath);
  if (
    !application &&
    !recovering &&
    (vaultPath === null ||
      onboardingPending ||
      (lostActiveSpace && recoveryDoneFor === vaultPath))
  ) {
    return (
      <>
        <StartupFrame backgroundImage={WELCOME_BACKGROUND_IMAGE}>
          {null}
        </StartupFrame>
        <WelcomeScreenDialog
          onSelectFolder={selectFolderFromWelcome}
          onResolveSpaceParent={resolveSpaceParent}
          onCreateFolder={createSpaceFolder}
          onOpenSpace={openSpaceFromWelcome}
          resolveImageUrl={resolveSpaceAvatarImage}
        />
      </>
    );
  }

  // Looking for a replacement for a lost active Space (or about to): the opening frame, not the dialog.
  if (
    !application &&
    (recovering || (lostActiveSpace && recoveryDoneFor !== vaultPath))
  ) {
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
        <AppLayout
          key={application.vault.root}
          application={application}
          narrowSidebarOverride={narrowSidebarOverride}
          onNarrowSidebarOverrideChange={setNarrowSidebarOverride}
        />
        {pendingSpace && (
          <Dialog
            open
            onClose={() => setPendingSpace(null)}
            dismissible={false}
            size="large"
            scrim="strong"
          >
            <SpaceDetails
              draft={pendingSpace}
              onNameChange={(name) =>
                setPendingSpace((current) => current && { ...current, name })
              }
              onRenameFolder={renamePendingSpaceFolder}
              onAvatarChange={(avatar) =>
                setPendingSpace((current) => current && { ...current, avatar })
              }
              onOpenSpace={confirmPendingSpace}
              onClose={() => setPendingSpace(null)}
              onChangeFolder={chooseSpaceForSettings}
              resolveImageUrl={resolveSpaceAvatarImage}
            />
          </Dialog>
        )}
        <MissingSpaceDialog
          open={missingSpacePath !== null}
          path={missingSpacePath ?? ''}
          name={spaceName(missingSpacePath ?? '')}
          onChangeLocation={() => void changeMissingSpaceLocation()}
          onRemove={removeMissingSpace}
          onClose={() => setMissingSpacePath(null)}
        />
        {notice}
      </ActiveSpaceAvatarContext.Provider>
    </SpacesContext.Provider>
  );
}
