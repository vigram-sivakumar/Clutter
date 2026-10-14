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

// Outside Tauri (npm run dev:web), this is just a namespace string for an
// in-memory vault (Application.bootstrap() picks InMemoryVaultFileSystem
// when !isTauri()) — never a real desktop path.
const WEB_DEV_VAULT_PATH = '/web-dev-vault';

/**
 * Window selection happens in Rust before any webview exists
 * (src-tauri/src/startup.rs): the `initial` window opens when no usable
 * space is configured, the `main` window only when one is. So by the time
 * this runs, the window label already says which of the two we are — the
 * workspace is never started in the `initial` window.
 */
export function AppShell() {
  if (!isTauri()) {
    return <WorkspaceShell vaultPath={WEB_DEV_VAULT_PATH} />;
  }
  if (getCurrentWindow().label === 'initial') {
    return <InitialWindow />;
  }
  return <ConfiguredWorkspaceShell />;
}

// Onboarding. "Select a folder" persists the space and opens the workspace
// directly (Rust: open_space). "Create a new space" lands on SpaceDetails
// with a draft (name + parent folder) held only in this state — no folder
// exists until the later confirm step creates it.
function InitialWindow() {
  const [draft, setDraft] = useState<NewSpaceDraft | null>(null);

  return (
    <>
      <TauriDragStrip />
      {draft ? (
        <SpaceDetails
          draft={draft}
          onNameChange={(name) => setDraft({ ...draft, name })}
        />
      ) : (
        <WelcomeScreen onCreateSpace={setDraft} />
      )}
    </>
  );
}

function ConfiguredWorkspaceShell() {
  const [vaultPath, setVaultPath] = useState<string | null | undefined>(
    undefined
  );

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
    return <div>No space configured</div>;
  }
  return <WorkspaceShell vaultPath={vaultPath} />;
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
