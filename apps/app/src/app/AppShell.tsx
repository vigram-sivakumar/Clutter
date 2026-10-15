import { useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Application } from '../core/application/Application';
import { normalizeAllTablesInMarkdown } from '../features/markdown/editor/codemirror/table/tableColumnNormalization';

import { Toast } from '../components/toast/Toast';
import { probeSpaceFolder } from '../core/vault/providers/probeSpaceFolder';

import { AppLayout } from './layouts/app-layout/AppLayout';
import { useFrontendReady } from './frontendReady';
import { StartupFrame } from './StartupFrame';
import { scheduleAfterFirstPaint } from './scheduleAfterFirstPaint';
import { createWindowCloseHandler } from './windowCloseHandler';
import { pickSpaceFolder } from './spaces/pickSpaceFolder';
import { SpacesContext, type SpacesApi } from './spaces/SpacesContext';
import { listSpaces, spaceName } from './spaces/spaceRegistry';
import { ActiveSpaceAvatarContext } from '../components/space-avatar/ActiveSpaceAvatarContext';
import type { SpaceAvatarProps } from '../components/space-avatar/SpaceAvatar';
import { useSpaceRegistry } from './spaces/useSpaceRegistry';

/** Closes an Application that never became (or no longer is) the open one; a failed close is only logged. */
async function discardApplication(application: Application): Promise<void> {
  try {
    await application.close();
  } catch (closeError) {
    console.warn('Failed to close a discarded Application:', closeError);
  }
}

export function AppShell() {
  // The Space opened on first launch, before any other has been chosen. Outside Tauri
  // (npm run dev:web), this is just a namespace string for an in-memory vault
  // (Application.bootstrap() picks InMemoryVaultFileSystem when !isTauri()) — never the real
  // desktop vault path, and there is no folder picker to add another.
  const defaultVaultPath = isTauri()
    ? '/Users/sivakuv3/Documents/Personal/Vault'
    : '/web-dev-vault';

  // Which Spaces exist and which is wanted (ADR-056). A change of `vaultPath` starts the switch
  // described at the effect below; there is exactly one open Application at a time.
  const spaces = useSpaceRegistry({
    defaultPath: defaultVaultPath,
    probe: probeSpaceFolder,
    pick: isTauri() ? pickSpaceFolder : undefined,
  });
  const vaultPath = spaces.registry.activePath;

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    // Already showing it — or the user went back to it while another was being prepared.
    if (openedPathRef.current === vaultPath) {
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

      openedPathRef.current = vaultPath;
      applicationRef.current = prepared;
      setApplication(prepared);
      setError(null);
      // Only a Space that actually opened is remembered for the next launch.
      spaces.confirmOpened();
    }

    async function run(): Promise<void> {
      let prepared: Application | null = null;
      try {
        prepared = await prepare(vaultPath);

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

        const reason = loadError instanceof Error ? loadError.message : 'Failed to open vault';
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
    // `spaces` is a fresh object each render; only a change of root or readiness starts a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, spaces.ready]);

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

  // The parsed-note cache write (ADR-053) is background housekeeping: it waits
  // until the workspace has rendered and painted, and application.open()
  // returning does not mean that. Best effort; never affects editing.
  useEffect(() => {
    if (!application) return;
    return scheduleAfterFirstPaint(() => void application.persistParsedNoteCache());
  }, [application]);

  const spacesApi = useMemo<SpacesApi>(
    () => ({
      spaces: listSpaces(spaces.registry),
      activePath: spaces.registry.activePath,
      onAddSpace: spaces.addSpace && (() => void spaces.addSpace?.()),
      onSwitchSpace: (path) => void spaces.switchSpace(path),
    }),
    [spaces.registry, spaces.addSpace, spaces.switchSpace]
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
