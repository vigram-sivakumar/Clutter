import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { BrowserRecoveryStorage } from '../core/recovery/RecoveryStorage';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

import {
  Application,
  type SpaceProfileChange,
} from '../core/application/Application';
import { readLaunchSidebarTab } from '../features/settings/sidebar-setting/defaultSidebarTab';
import { readStartupBehavior } from '../features/settings/startup-setting/startupPreference';
import { VaultRootMissingError } from '../core/vault/providers/VaultRootMissingError';
import { normalizeAllTablesInMarkdown } from '../features/markdown/editor/codemirror/table/tableColumnNormalization';

import { useToast } from '../components/toast/ToastProvider';
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
import { WelcomeBackground } from './WelcomeBackground';
import { GradientGrainy } from '../components/gradient-grainy/GradientGrainy';
import { scheduleAfterFirstPaint } from './scheduleAfterFirstPaint';
import { createWindowCloseHandler, QUIT_MENU_EVENT, type UnsavedCloseChoice } from './windowCloseHandler';
import { UnsavedCloseDialog } from './UnsavedCloseDialog';
import type { UnsavedAction } from './unsavedCloseCopy';
import { WelcomeScreenDialog } from '../components/welcome-screen/WelcomeScreenDialog';
import { Dialog } from '../components/dialog/Dialog';
import {
  SpaceDetails,
  draftForExistingFolder,
  type CreateFolderResult,
  type NewSpaceDraft,
} from '../components/space-details/SpaceDetails';
import { pickSpaceFolder } from './spaces/pickSpaceFolder';
import { ActiveSpaceSettingsDialog } from './ActiveSpaceSettingsDialog';
import { ShortcutsProvider, useShortcutHandler } from './shortcuts/ShortcutsProvider';
import { useNativeSettingsMenu } from './useNativeSettingsMenu';
import {
  SettingsDialogStateProvider,
  useSharedSettingsDialogState,
} from '../features/settings/SettingsDialogState';
import { spacePageId } from '../features/settings/settings-sidebar/SettingsSidebar';
import { SpacesContext, type SpacesApi } from './spaces/SpacesContext';
import { localCoverImageUrlResolver } from '../core/vault/providers/LocalCoverImageUrlResolver';
import {
  listSpaces,
  normalizeSpacePath,
  spaceName,
} from './spaces/spaceRegistry';
import { openVaultFileSystem } from '../core/vault/providers/openVaultFileSystem';
import { migrateRenamedRootState } from '../core/application/space/migrateRenamedRootState';
import { readSpaceIdFrom } from './spaces/readSpaceId';
import { renameActiveSpaceFolder, type RenameOutcome } from './spaces/renameActiveSpace';
import { renameInactiveSpaceFolder, type InactiveRenameOutcome } from './spaces/renameInactiveSpace';
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
    ? readSpaceProfile(openVaultFileSystem(path), path)
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
 * What fills the app frame behind the first-run Welcome dialog: the animated grainy gradient, or the Unsplash
 * artwork (`WelcomeBackground`, kept intact). One word to switch back.
 */
// The web runtime has no application data directory: it keeps recovery snapshots in the browser's own storage, which
// lets the unsaved-work recovery flow be exercised in a plain browser. (The desktop app uses the data directory.)
if (typeof localStorage !== 'undefined') {
  Application.webRecoveryStorage = new BrowserRecoveryStorage();
}

const WELCOME_BACKDROP: 'gradient' | 'image' = 'gradient';

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

/**
 * The Settings dialog's open/closed state and page are held out here, above everything that is replaced when a Space
 * closes and another opens, so Settings stays open across a rename (and across a switch from inside it).
 */
export function AppShell() {
  return (
    <SettingsDialogStateProvider>
      <ShortcutsProvider>
        <AppShellContent />
      </ShortcutsProvider>
    </SettingsDialogStateProvider>
  );
}

function AppShellContent() {
  const settingsDialog = useSharedSettingsDialogState();
  // A rename is running (from its start until it ends, refused or not): Space controls in Settings are disabled.
  const [renameInFlight, setRenameInFlight] = useState(false);
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
    // Identity of the folder at a path, to settle an unfinished rename before anything opens.
    readSpaceId: (path) => (isTauri() ? readSpaceIdFrom(openVaultFileSystem(path), path) : Promise.resolve(null)),
    migrateState: (oldRoot, newRoot) => migrateRenamedRootState(openVaultFileSystem(newRoot), oldRoot, newRoot),
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
  // Bumped to open the active Space again with a fresh Application when its path has not changed (a rename that
  // did not happen): the open effect otherwise only runs when the path does.
  const [reopenNonce, setReopenNonce] = useState(0);
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
  //
  // When pages still hold unsaved changes after that flush, the user is asked first (the dialog below). The
  // pending answer lives in a ref so the one-time handler registration can reach it.
  const [unsavedClose, setUnsavedClose] = useState<{ readonly count: number; readonly action: UnsavedAction } | null>(null);
  const unsavedCloseAnswerRef = useRef<((choice: UnsavedCloseChoice) => void) | null>(null);
  const confirmUnsaved = useCallback(
    (count: number, action: UnsavedAction) =>
      new Promise<UnsavedCloseChoice>((resolve) => {
        // One question at a time: a second request while one is showing answers the first as "cancel".
        unsavedCloseAnswerRef.current?.('cancel');
        unsavedCloseAnswerRef.current = resolve;
        setUnsavedClose({ count, action });
      }),
    []
  );
  const confirmUnsavedClose = useCallback((count: number) => confirmUnsaved(count, 'close'), [confirmUnsaved]);
  const answerUnsavedClose = useCallback((choice: UnsavedCloseChoice) => {
    const answer = unsavedCloseAnswerRef.current;
    unsavedCloseAnswerRef.current = null;
    setUnsavedClose(null);
    answer?.(choice);
  }, []);

  // When the page is hidden (the window is minimised or the app is put in the background), any unsaved work gets a
  // recovery snapshot now: that is when a crash or a quit is least likely to be preceded by another edit.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void applicationRef.current?.snapshotUnsavedWork();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let unlistenQuit: (() => void) | null = null;
    const handler = createWindowCloseHandler({
      getBootstrap: () => bootstrapRef.current,
      getApplication: () => applicationRef.current,
      destroyWindow: () => getCurrentWindow().destroy(),
      confirmUnsavedClose,
    });
    // ⌘Q (the native Quit item, app_menu.rs) asks for exactly the same close as the window's close button: the
    // same flush, the same unsaved-changes dialog, the same single in-flight close. The native predefined Quit
    // would end the process before the page could be asked anything.
    listen(QUIT_MENU_EVENT, () => void handler({ preventDefault() {} }))
      .then((unlistenFn) => {
        if (disposed) unlistenFn();
        else unlistenQuit = unlistenFn;
      })
      .catch((error) => console.error('Could not listen for the Quit menu item', error));
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
      unlistenQuit?.();
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
        await prepared.open({
          startup: readStartupBehavior(),
          sidebarTab: readLaunchSidebarTab(),
        });
      } catch (openError) {
        await discardApplication(prepared);
        if (previous && previousPath) {
          // The previous Space is already closed, so put it back before reporting the failure.
          const restored = await prepare(previousPath);
          if (sidebarVisible !== undefined)
            restored.workspace.setSidebarVisible(sidebarVisible);
          await restored.open({
            startup: readStartupBehavior(),
            sidebarTab: readLaunchSidebarTab(),
          });
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
        // The Space itself opened; only its avatar or settings did not save.
        spaces.notify('Couldn’t save the space settings');
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
          // A removal waiting on this open is dropped: recovery must not be held up by it.
          spaces.abortPendingRemoval();
          setMissingRoot(openPath);
          void recoverRef.current(openPath);
          return;
        }

        const reason = failureReason(loadError);
        // A failed switch returns the registry to the Space that is still showing. Only a failure
        // with no Space left open (the first open, or a failed return to the previous one) becomes
        // the full-screen error.
        if (applicationRef.current === null || !spaces.openFailed(reason)) {
          spaces.abortPendingRemoval();
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
  }, [vaultPath, spaces.ready, spaces.activeSpaceMissing, missingRoot, reopenNonce]);

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
    if (!(await confirmLeavingOpenSpace())) {
      pendingProfileRef.current = null;
      return null;
    }
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

  // Leaving the open Space closes its Application, which disposes every open note, so a note whose save failed would
  // be lost. Before any switch that does so: one flush, then, if anything is still unsaved, ask. `false` keeps the
  // Space open exactly as it was and aborts the switch.
  async function confirmLeavingOpenSpace(): Promise<boolean> {
    const open = applicationRef.current;
    if (!open) return true;
    const unsaved = await open.checkUnsavedBeforeClose();
    if (unsaved === 0) return true;
    // Switching keeps a recovery copy of the unsaved work: it is taken now, not left to the quiet-period timer, so a
    // crash or quit while the prompt is open cannot lose it. The prompt does not depend on whether the copy was written.
    await open.snapshotUnsavedWork();
    return (await confirmUnsaved(unsaved, 'switch')) === 'close';
  }

  // "Remove space" from Settings. A Space that isn't open is just forgotten. The open one is switched away from
  // first (the registry forgets it once its replacement has opened); if nothing else can open, the Application
  // is closed — flushing its pending writes — before the entry is forgotten, and Welcome takes over. The folder
  // and its files are never touched.
  function removeSpaceFromSettings(path: string) {
    if (normalizeSpacePath(path) !== spaces.registry.activePath) {
      spaces.removeSpace(path);
      return;
    }
    void (async () => {
      if (!(await confirmLeavingOpenSpace())) return;
      await spaces.removeActiveSpace(async () => {
        const open = applicationRef.current;
        if (open) {
          await open.close();
          applicationRef.current = null;
          openedPathRef.current = null;
          setApplication(null);
        }
      });
    })();
  }

  // Renames the open Space's folder (the whole sequence is `renameActiveSpaceFolder`'s). The Application it closes is
  // discarded here, so nothing can reach the old one; the open effect opens the new path (or, for a rename that did
  // not happen, the old one again, via `reopenNonce`).
  async function renameActiveSpace(newName: string): Promise<RenameOutcome> {
    setRenameInFlight(true);
    let outcome: RenameOutcome;
    try {
      outcome = await renameActiveSpaceFolder(
      {
        guard: spaces.lifecycle,
        activePath: () => spaces.registry.activePath,
        application: () => {
          const open = applicationRef.current;
          return open
            ? {
                get spaceId() {
                  return open.spaceProfile?.id ?? null;
                },
                quiesceForRename: () => open.quiesceForRename(),
                close: () => open.close(),
              }
            : null;
        },
        detachApplication: () => {
          applicationRef.current = null;
          openedPathRef.current = null;
          // The opening frame shows until the next Application (or recovery) takes over, not a "no vault" error.
          setIsLoading(true);
          setApplication(null);
        },
        registry: {
          beginRename: spaces.beginRename,
          // The Settings page for the renamed Space is keyed by its path: move the selection to the new path in the same
          // step the registry moves, so the dialog never sits on a page that no longer exists.
          completeRename: (to) => {
            const saved = spaces.completeRename(to);
            const from = spaces.registry.activePath;
            if (from !== null) settingsDialog?.replacePageId(spacePageId(from), spacePageId(to));
            return saved;
          },
          abandonRename: spaces.abandonRename,
          hasPendingRename: () => spaces.registry.pendingRename !== undefined,
        },
        renameFolder: renameSpaceFolder,
        readSpaceId: (path) => readSpaceIdFrom(openVaultFileSystem(path), path),
        destinationExists: async (path) => (await probeSpaceFolder(path)) === 'available',
        migrateState: (oldRoot, newRoot) =>
          migrateRenamedRootState(openVaultFileSystem(newRoot), oldRoot, newRoot),
        reopenActive: () => setReopenNonce((nonce) => nonce + 1),
        recoverFromLost: (lostPath) => {
          setMissingRoot(lostPath);
          setRecoveryDoneFor(null);
          void recoverRef.current(lostPath);
        },
      },
      newName
    );
    } finally {
      setRenameInFlight(false);
    }

    // The Settings page that asked for this closed with the Application it belonged to, so everything that is not a
    // refusal (nothing was closed, and the caller still shows it) is reported here.
    if (outcome.status === 'failed') {
      spaces.notify(`Couldn’t rename the space: ${outcome.message}`);
    } else if (outcome.status === 'recovery') {
      spaces.notify(`Couldn’t finish renaming the space: ${outcome.message}`);
    } else if (outcome.status === 'renamed' && outcome.warnings.includes('state-not-migrated')) {
      spaces.notify('The space was renamed, but some of its saved view settings couldn’t be carried over');
    }

    return outcome;
  }

  // Renames the folder of a Space that is not open. Nothing about the open Space is touched: it stays open, with no
  // quiescence, no close and no reopen — `renameInactiveSpaceFolder` holds the same guard as every other Space
  // operation, so it cannot overlap one.
  async function renameInactiveSpace(path: string, newName: string): Promise<InactiveRenameOutcome> {
    setRenameInFlight(true);
    let outcome: InactiveRenameOutcome;
    try {
      outcome = await renameInactiveSpaceFolder(
        {
          guard: spaces.lifecycle,
          activePath: () => spaces.registry.activePath,
          isRegistered: (candidate) => spaces.registry.paths.includes(normalizeSpacePath(candidate)),
          probe: probeSpaceFolder,
          readSpaceId: (candidate) => readSpaceIdFrom(openVaultFileSystem(candidate), candidate),
          destinationExists: async (candidate) => (await probeSpaceFolder(candidate)) === 'available',
          renameFolder: renameSpaceFolder,
          migrateState: (oldRoot, newRoot) =>
            migrateRenamedRootState(openVaultFileSystem(newRoot), oldRoot, newRoot),
          renameEntry: (from, to) => {
            const saved = spaces.renameInactiveSpace(from, to);
            // This Space's Settings page is keyed by its path: follow it in the same step as the registry.
            settingsDialog?.replacePageId(spacePageId(from), spacePageId(to));
            return saved;
          },
        },
        path,
        newName
      );
    } finally {
      setRenameInFlight(false);
    }

    // The page that asked is still open, so a refusal or a failure is shown there; what it cannot show is reported here.
    if (outcome.status === 'unconfirmed') {
      spaces.notify(outcome.message);
    } else if (outcome.status === 'renamed' && outcome.warnings.includes('state-not-migrated')) {
      spaces.notify('The space was renamed, but some of its saved view settings couldn’t be carried over');
    }

    return outcome;
  }

  // The open Space's avatar, changed from its Settings page: the same profile write the Space details dialog makes for
  // the open Space (`applySpaceProfile`; an image is copied into the Space's `Assets/`). Only the open Space's profile is
  // ever written — that is the Application's job — so another Space's avatar is not offered here.
  async function changeActiveSpaceAvatar(avatar: SpaceAvatarChoice | undefined): Promise<{ error?: string }> {
    const open = applicationRef.current;
    if (!open) return { error: 'Couldn’t save the space settings' };
    try {
      await open.applySpaceProfile({
        avatar: avatar === undefined ? null : avatar.type === 'emoji' ? { type: 'emoji', emoji: avatar.emoji } : { type: 'image', sourcePath: avatar.src },
      });
      refreshProfiles();
      return {};
    } catch (caught) {
      console.error('Saving the Space avatar failed:', caught);
      return { error: 'Couldn’t save the space settings' };
    }
  }

  // "Change location": the same picker and checks as "New space". The folder that is chosen replaces the
  // missing entry in place and is opened straight away — no settings dialog. Choosing is the confirmation;
  // cancelling the picker, or a refused folder, changes nothing, and the registry only changes for good once the
  // folder has opened (a failed open puts the old entry back). The folder's own identity and avatar are read as
  // part of opening it; nothing is matched to the missing space automatically.
  // Also the action behind "Change location" on a missing Space's Settings page, which names the Space itself
  // (`fromSettings`) instead of reading the dialog's.
  async function changeMissingSpaceLocation(fromSettings?: string) {
    const missing = fromSettings ?? missingSpacePath;
    setMissingSpacePath(null);
    const path = await spaces.chooseSpace?.();
    if (path === null || path === undefined || missing === null) return;
    pendingProfileRef.current = null;
    const opened = await spaces.switchSpace(path, missing);
    // The Space's Settings page is keyed by its path: follow it to the new location in the same step as the registry.
    if (opened) settingsDialog?.replacePageId(spacePageId(missing), spacePageId(normalizeSpacePath(path)));
  }

  // A Space whose folder is confirmed missing is not switched to: it opens the confirmation window instead of
  // the error toast. Checked at the moment it is chosen, so a folder that has come back opens normally; any
  // other refusal (unreadable, outside the allowed location) still explains itself through the usual notice.
  async function switchOrExplainMissing(path: string) {
    if ((await probeSpaceFolder(normalizeSpacePath(path))) === 'missing') {
      setMissingSpacePath(normalizeSpacePath(path));
      return;
    }
    if (!(await confirmLeavingOpenSpace())) return;
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
      // Removing the open Space needs the desktop's Welcome to fall back to; the web runtime has one fixed Space.
      onRemoveSpace: isTauri() ? removeSpaceFromSettings : undefined,
      // Plumbing only: the Space settings page does not offer it yet.
      onRenameActiveSpace: isTauri() ? renameActiveSpace : undefined,
      onRenameInactiveSpace: isTauri() ? renameInactiveSpace : undefined,
      onChangeActiveSpaceAvatar: changeActiveSpaceAvatar,
      onSwitchSpace: (path) => {
        pendingProfileRef.current = null;
        void switchOrExplainMissing(path);
      },
      onChangeMissingSpaceLocation: (path) => void changeMissingSpaceLocation(path),
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

  // A refusal or failure from the Space registry is shown once, as an error toast, and then cleared.
  const toast = useToast();
  const { notice, dismissNotice } = spaces;
  useEffect(() => {
    if (notice) {
      toast.show({ tone: 'error', text: notice.text });
      dismissNotice();
    }
  }, [notice, dismissNotice, toast]);

  // A Space can't be shown, and no other has opened (yet): either none is configured, or the configured
  // one's folder is confirmed missing — and the search for another registered Space (see
  // `recoverFromLostSpace`) has finished empty-handed.
  const lostActiveSpace =
    spaces.activeSpaceMissing ||
    (vaultPath !== null && missingRoot === vaultPath);
  const showWelcome =
    !application &&
    !recovering &&
    (vaultPath === null ||
      onboardingPending ||
      (lostActiveSpace && recoveryDoneFor === vaultPath));

  // The Settings dialog is drawn by the persistent shell below, outside whichever frame is showing, so it is not
  // torn down when a Space closes and another opens (a rename, a switch from inside Settings, a recovery). It is
  // only closed where there is no Space to show it for: the Welcome dialog, or a full-screen error.
  const settingsAvailable = !error && !showWelcome;
  const closeSettings = settingsDialog?.setOpen;
  const settingsOpen = settingsDialog?.open ?? false;
  useEffect(() => {
    if (!settingsAvailable && settingsOpen) closeSettings?.(false);
  }, [settingsAvailable, settingsOpen, closeSettings]);
  // The native Clutter menu's "Settings…" (⌘,) opens this same dialog.
  const openSettings = useCallback(() => closeSettings?.(true), [closeSettings]);
  useNativeSettingsMenu(settingsAvailable, openSettings);
  // ⌘, in the browser build (the desktop app's native Settings… item owns it there).
  useShortcutHandler('open-settings', () => {
    if (settingsAvailable) openSettings();
  });

  const renderFrame = (): ReactNode => {
  if (error) {
    return <StartupFrame tone="error">{error}</StartupFrame>;
  }

  // A Space can't be shown, and no other has opened (yet): either none is configured, or the configured
  // one's folder is confirmed missing — and the search for another registered Space (see
  // `recoverFromLostSpace`) has finished empty-handed. The themed startup surface stays mounted behind the
  // Welcome dialog. The real workspace (AppLayout) needs an Application, so it cannot mount before a Space
  // exists — and none is faked to draw it.
  if (showWelcome) {
    return (
      <>
        {WELCOME_BACKDROP === 'gradient' ? (
          <StartupFrame backdrop={<GradientGrainy />}>{null}</StartupFrame>
        ) : (
          <WelcomeBackground />
        )}
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
    return <StartupFrame>Opening Clutter…</StartupFrame>;
  }

  if (isLoading) {
    return <StartupFrame>Opening Clutter…</StartupFrame>;
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
          onChangeLocation={() => void changeMissingSpaceLocation(undefined)}
          onRemove={removeMissingSpace}
          onClose={() => setMissingSpacePath(null)}
        />
      </ActiveSpaceAvatarContext.Provider>
    </SpacesContext.Provider>
  );
  };

  return (
    <SpacesContext.Provider value={spacesApi}>
      {renderFrame()}
      <UnsavedCloseDialog
        unsavedCount={unsavedClose?.count ?? null}
        action={unsavedClose?.action ?? 'close'}
        onAnswer={answerUnsavedClose}
      />
      {settingsAvailable && (
        <ActiveSpaceSettingsDialog application={application} busy={application === null || renameInFlight} />
      )}
    </SpacesContext.Provider>
  );
}
