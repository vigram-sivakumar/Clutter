import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Application } from '../core/application/Application';
import { normalizeAllTablesInMarkdown } from '../features/markdown/editor/codemirror/table/tableColumnNormalization';

import { AppLayout } from './layouts/app-layout/AppLayout';
import { useFrontendReady } from './frontendReady';
import { StartupFrame } from './StartupFrame';
import { scheduleAfterFirstPaint } from './scheduleAfterFirstPaint';
import { createWindowCloseHandler } from './windowCloseHandler';

export function AppShell() {
  // TODO: Replace with the folder picker.
  // Outside Tauri (npm run dev:web), this is just a namespace string for an
  // in-memory vault (Application.bootstrap() picks InMemoryVaultFileSystem
  // when !isTauri()) — never the real desktop vault path.
  const vaultPath = isTauri()
    ? '/Users/sivakuv3/Documents/Personal/Vault'
    : '/web-dev-vault';

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

  useEffect(() => {
    let cancelled = false;
    let openedApplication: Application | null = null;

    async function loadVault() {
      try {
        // Table-column normalization applies to what's written to disk
        // (the durable representation), not to the live editing session —
        // see `PageOperations`'s own constructor doc comment for why this
        // is injected here, the one place UI and the Composition Root
        // already meet, rather than imported inside `core/application/`.
        const application = await Application.bootstrap(vaultPath, normalizeAllTablesInMarkdown);
        await application.open();

        if (cancelled) {
          void application.close();
          return;
        }

        openedApplication = application;
        applicationRef.current = application;
        setApplication(application);
      } catch (error) {
        console.error('Failed to open vault:', error);
        if (!cancelled) {
          setError(
            error instanceof Error ? error.message : 'Failed to open vault'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    bootstrapRef.current = loadVault();

    return () => {
      cancelled = true;
      applicationRef.current = null;
      void openedApplication?.close();
    };
  }, [vaultPath]);

  // The parsed-note cache write (ADR-053) is background housekeeping: it waits
  // until the workspace has rendered and painted, and application.open()
  // returning does not mean that. Best effort; never affects editing.
  useEffect(() => {
    if (!application) return;
    return scheduleAfterFirstPaint(() => void application.persistParsedNoteCache());
  }, [application]);

  if (error) {
    return <StartupFrame tone="error">{error}</StartupFrame>;
  }

  if (isLoading) {
    return <StartupFrame>Opening Clutter…</StartupFrame>;
  }

  if (!application) {
    return <StartupFrame tone="error">No vault loaded</StartupFrame>;
  }

  return <AppLayout application={application} />;
}
