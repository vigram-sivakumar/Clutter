import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Application } from '../core/application/Application';
import { normalizeAllTablesInMarkdown } from '../features/markdown/editor/codemirror/table/tableColumnNormalization';

import { TauriDragStrip } from '../components/tauri-drag-strip/TauriDragStrip';
import {
  SpaceDetails,
  type NewSpaceDraft,
} from '../components/space-details/SpaceDetails';
import { WelcomeScreen } from '../components/welcome-screen/WelcomeScreen';

import { AppLayout } from './layouts/app-layout/AppLayout';
import { useFrontendReady } from './frontendReady';

// Outside Tauri (npm run dev:web), this is just a namespace string for an
// in-memory vault (Application.bootstrap() picks InMemoryVaultFileSystem
// when !isTauri()) — never a real desktop path.
const WEB_DEV_VAULT_PATH = '/web-dev-vault';

/**
 * One native window and one webview for the app's whole lifetime
 * (src-tauri/src/startup.rs only decides its shape — small and fixed for
 * the welcome screen, full-size for the workspace). Welcome → workspace is
 * a state change here, not a new window, so nothing reloads or flashes.
 */
export function AppShell() {
  if (!isTauri()) {
    return <WorkspaceShell vaultPath={WEB_DEV_VAULT_PATH} />;
  }
  return <ConfiguredShell />;
}

function ConfiguredShell() {
  // undefined: still asking Rust; null: no usable space → onboarding.
  const [vaultPath, setVaultPath] = useState<string | null | undefined>(
    undefined
  );

  // The window starts hidden; show it once the screen is decided (welcome or
  // workspace) and rendered — not while still waiting on Rust, and not for
  // the workspace's own vault bootstrap, which WorkspaceShell handles itself.
  useFrontendReady(vaultPath !== undefined);

  useEffect(() => {
    invoke<string | null>('get_configured_space')
      .then(setVaultPath)
      .catch((error) => {
        console.error('Failed to read configured space:', error);
        setVaultPath(null);
      });
  }, []);

  if (vaultPath === undefined) {
    return <div>Loading vault…</div>;
  }
  if (vaultPath === null) {
    return <Onboarding onSpaceOpened={setVaultPath} />;
  }
  return <WorkspaceShell vaultPath={vaultPath} />;
}

// Onboarding. "Select a folder" opens the chosen folder as the space
// directly. "Create a new space" lands on SpaceDetails with a draft (name +
// parent folder) held only in this state; Create there makes the folder and
// opens it. Either way the space is handed to ConfiguredShell.
function Onboarding({
  onSpaceOpened,
}: {
  onSpaceOpened: (path: string) => void;
}) {
  const [draft, setDraft] = useState<NewSpaceDraft | null>(null);

  // Shape the window for onboarding only once the welcome screen has actually
  // painted — when arriving from a deleted space the window is still
  // workspace-sized until now, so the content shows first, then it shrinks.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        invoke('show_welcome_shape').catch((error) =>
          console.error('Failed to shape the welcome window:', error)
        );
      })
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <TauriDragStrip />
      {draft ? (
        <SpaceDetails
          draft={draft}
          onNameChange={(name) => setDraft({ ...draft, name })}
          onParentChange={(parent) => setDraft({ ...draft, ...parent })}
          onSpaceOpened={onSpaceOpened}
        />
      ) : (
        <WelcomeScreen onCreateSpace={setDraft} onSpaceOpened={onSpaceOpened} />
      )}
    </>
  );
}

function WorkspaceShell({ vaultPath }: { vaultPath: string }) {
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let openedApplication: Application | null = null;
    let unlistenCloseRequested: (() => void) | null = null;

    async function loadVault() {
      try {
        // Table-column normalization applies to what's written to disk
        // (the durable representation), not to the live editing session —
        // see `PageOperations`'s own constructor doc comment for why this
        // is injected here, the one place UI and the Composition Root
        // already meet, rather than imported inside `core/application/`.
        const application = await Application.bootstrap(
          vaultPath,
          normalizeAllTablesInMarkdown
        );

        // An effect already cleaned up (React StrictMode's dev double-mount)
        // must not open() — that starts a vault watcher, and the cancelled
        // instance's close() would then stop the live instance's watcher.
        if (cancelled) {
          void application.close();
          return;
        }

        await application.open();

        if (cancelled) {
          void application.close();
          return;
        }

        openedApplication = application;
        setApplication(application);

        // Intercept the actual window/app close so dirty content isn't
        // silently lost (autosave-execution-model.md §7) — today, nothing
        // called Application.close() when the user actually quits; this
        // effect's own unmount cleanup below only fires on component
        // unmount, which doesn't correspond to the OS window closing.
        // Application itself stays unaware of the Tauri window API by
        // design (M8's audit) — this handler's only job is triggering the
        // already-existing, already-orderly close() at the right moment,
        // then letting the window actually finish closing. There is no
        // native window to intercept in the web runtime (a browser tab
        // close can't be gated the same way, and the in-memory web vault
        // has nothing durable to protect on close anyway).
        if (isTauri()) {
          unlistenCloseRequested = await getCurrentWindow().onCloseRequested(
            async (event) => {
              event.preventDefault();
              await application.close();
              await getCurrentWindow().destroy();
            }
          );
        }
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

    loadVault();

    return () => {
      cancelled = true;
      unlistenCloseRequested?.();
      void openedApplication?.close();
    };
  }, [vaultPath]);

  if (isLoading) {
    return <div>Loading vault…</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!application) {
    return <div>No vault loaded</div>;
  }

  return <AppLayout application={application} />;
}
