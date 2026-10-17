// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrap = vi.fn();
vi.mock('../core/application/Application', () => ({
  Application: { bootstrap: (...args: unknown[]) => bootstrap(...args) },
}));
const tauri = vi.hoisted(() => ({
  isTauri: false,
  invoke: vi.fn(),
  openDialog: vi.fn(),
  mkdir: vi.fn(),
}));
/** Per-path overrides for the folder probe, on top of the name-based default below. */
const probeOverrides = vi.hoisted(() => new Map<string, string>());
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauri.isTauri,
  invoke: (...args: unknown[]) => tauri.invoke(...args),
}));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/me/Documents/',
  homeDir: async () => '/Users/me',
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: (...args: unknown[]) => tauri.mkdir(...args),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => tauri.openDialog(...args),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    destroy: async () => {},
  }),
}));
vi.mock('../core/vault/providers/probeSpaceFolder', () => ({
  probeSpaceFolder: vi.fn(async (path: string) => {
    const override = probeOverrides.get(path);
    if (override) return override;
    if (path.includes('Denied')) return 'unavailable';
    return path.includes('Missing') ? 'missing' : 'available';
  }),
}));
vi.mock('./frontendReady', () => ({ useFrontendReady: vi.fn() }));
vi.mock('./scheduleAfterFirstPaint', () => ({ scheduleAfterFirstPaint: () => () => {} }));
vi.mock('./layouts/app-layout/AppLayout', async () => {
  const { useSpaces } = await import('./spaces/SpacesContext');
  return {
    AppLayout: ({ application }: { application: { vault: { root: string } } }) => {
      const spaces = useSpaces();
      return (
        <div>
          <div data-testid="open-root">{application.vault.root}</div>
          <button onClick={() => spaces?.onSwitchSpace('/Other')}>switch-other</button>
          <button onClick={() => spaces?.onSwitchSpace('/Missing')}>switch-missing</button>
          <button onClick={() => spaces?.onSwitchSpace('/Broken')}>switch-broken</button>
          <button onClick={() => spaces?.onSwitchSpace('/web-dev-vault')}>switch-first</button>
          <button onClick={() => spaces?.onSwitchSpace('/Third')}>switch-third</button>
          <button onClick={() => spaces?.refreshAvailability?.()}>refresh-spaces</button>
          <button onClick={() => spaces?.onAddSpace?.()}>add-space</button>
          <ul data-testid="space-selector">
            {spaces?.spaces.map((space) => (
              <li key={space.path} data-path={space.path} />
            ))}
          </ul>
        </div>
      );
    },
  };
});

import { AppShell } from './AppShell';
import { VaultRootMissingError } from '../core/vault/providers/VaultRootMissingError';

interface FakeApplication {
  vault: { root: string };
  /** The AppShell's loss subscription (Application.onRootLost) and its focus-time check. */
  lostListeners: Set<() => void>;
  onRootLost: (listener: () => void) => () => void;
  verifyRoot: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  persistParsedNoteCache: ReturnType<typeof vi.fn>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let created: FakeApplication[] = [];
/** Order in which lifecycle calls happened, e.g. "close:/A", "open:/B". */
let events: string[] = [];
/** Roots whose bootstrap waits on a gate the test releases. */
let gates: Map<string, Deferred<void>>;
let openFails: Set<string>;

function makeApp(root: string): FakeApplication {
  const lostListeners = new Set<() => void>();
  const app: FakeApplication = {
    vault: { root },
    lostListeners,
    onRootLost: (listener) => {
      lostListeners.add(listener);
      return () => {
        lostListeners.delete(listener);
      };
    },
    verifyRoot: vi.fn(async () => {}),
    open: vi.fn(async () => {
      events.push(`open:${root}`);
      if (openFails.has(root)) throw new Error('watcher failed');
    }),
    close: vi.fn(async () => {
      events.push(`close:${root}`);
    }),
    persistParsedNoteCache: vi.fn(async () => {}),
  };
  created.push(app);
  return app;
}

function seed(paths: string[], activePath: string) {
  window.localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths, activePath }));
}

// The Overlay measures itself with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

beforeEach(() => {
  tauri.isTauri = false;
  tauri.invoke.mockReset();
  tauri.openDialog.mockReset();
  tauri.mkdir.mockReset();
  tauri.mkdir.mockResolvedValue(undefined);
  probeOverrides.clear();
  created = [];
  events = [];
  gates = new Map();
  openFails = new Set();
  window.localStorage.clear();
  bootstrap.mockImplementation(async (root: string) => {
    events.push(`bootstrap:${root}`);
    await gates.get(root)?.promise;
    if (root.endsWith('/Broken')) throw new Error('scan failed');
    // The fs plugin rejects with plain strings, not Error objects.
    if (root.endsWith('/Stringy')) throw 'Permission denied (os error 13)';
    return makeApp(root);
  });
});

afterEach(() => {
  cleanup();
  bootstrap.mockReset();
});

const OPENING = 'Opening Clutter…';

describe('AppShell: startup', () => {
  it('shows the opening screen until the first Space is ready', async () => {
    const gate = deferred<void>();
    gates.set('/web-dev-vault', gate);
    render(<AppShell />);

    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(screen.queryByTestId('open-root')).toBeNull();

    gate.resolve();
    expect(await screen.findByTestId('open-root')).toHaveTextContent('/web-dev-vault');
    expect(screen.queryByText(OPENING)).toBeNull();
  });

  it('shows a full-screen error when the first Space fails to open', async () => {
    seed(['/Broken'], '/Broken');
    render(<AppShell />);
    expect(await screen.findByText('scan failed')).toBeInTheDocument();
  });
});

describe('AppShell: desktop startup without a hardcoded Space', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  it('with no configured Space, shows the Welcome dialog over the shell and opens nothing', async () => {
    render(<AppShell />);

    expect(await screen.findByText("Let's create a space")).toBeInTheDocument();
    // Presented through the Overlay/Dialog (portal on body), over the still-mounted startup surface.
    expect(screen.getByText("Let's create a space").closest('.overlay')).not.toBeNull();
    expect(screen.getByText("Let's create a space").closest('.dialog')).not.toBeNull();
    expect(document.querySelector('.startup-frame')).not.toBeNull();
    expect(screen.queryByText(OPENING)).toBeNull();
    expect(bootstrap).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBeNull();
  });

  it('fills the app frame behind the Welcome dialog with the background image, centred and covering', async () => {
    render(<AppShell />);
    await screen.findByText("Let's create a space");

    const frame = document.querySelector('.startup-frame') as HTMLElement;
    expect(frame.getAttribute('data-backdrop')).toBe('image');
    expect(frame.style.backgroundImage).toContain('images.unsplash.com');
    // The dialog is portalled to <body>, outside (and above) the frame; the frame holds no workspace.
    expect(frame.contains(screen.getByText("Let's create a space"))).toBe(false);
    expect(screen.queryByTestId('open-root')).toBeNull();
    // The scrim is the dialog's own overlay backdrop; the frame adds none, so nothing is dimmed twice.
    expect(document.querySelector('.overlay__backdrop')!.className).toBe(
      'overlay__backdrop overlay__backdrop--tinted'
    );
  });

  it('shows the same background when the configured folder is missing', async () => {
    seed(['/Missing'], '/Missing');
    render(<AppShell />);
    await screen.findByText("Let's create a space");

    expect((document.querySelector('.startup-frame') as HTMLElement).style.backgroundImage).toContain(
      'images.unsplash.com'
    );
  });

  it('shows no background image on the opening frame, the error frame or the workspace', async () => {
    seed(['/Users/me/Notes'], '/Users/me/Notes');
    const gate = deferred<void>();
    gates.set('/Users/me/Notes', gate);
    const first = render(<AppShell />);

    await screen.findByText(OPENING);
    expect(document.querySelector('.startup-frame')!.getAttribute('data-backdrop')).toBeNull();

    await act(async () => gate.resolve());
    await screen.findByTestId('open-root');
    expect(document.querySelector('.startup-frame')).toBeNull();
    first.unmount();

    seed(['/Users/me/Broken'], '/Users/me/Broken');
    render(<AppShell />);
    await screen.findByText('scan failed');
    expect(document.querySelector('.startup-frame')!.getAttribute('data-backdrop')).toBeNull();
  });

  it('keeps the dialog open on Escape and on a backdrop click', async () => {
    render(<AppShell />);
    await screen.findByText("Let's create a space");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      (document.querySelector('.overlay__backdrop') as HTMLElement).click();
    });

    expect(screen.getByText("Let's create a space")).toBeInTheDocument();
  });

  it('opens a configured Space normally, without ever showing the Welcome dialog', async () => {
    seed(['/Configured'], '/Configured');
    render(<AppShell />);

    expect(await screen.findByTestId('open-root')).toHaveTextContent('/Configured');
    expect(screen.queryByText("Let's create a space")).toBeNull();
    expect(bootstrap).toHaveBeenCalledWith('/Configured', expect.anything());
  });

  it('shows no Welcome dialog while a configured Space is still opening', async () => {
    seed(['/Configured'], '/Configured');
    const gate = deferred<void>();
    gates.set('/Configured', gate);
    render(<AppShell />);

    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(screen.queryByText("Let's create a space")).toBeNull();

    await act(async () => gate.resolve());
    expect(await screen.findByTestId('open-root')).toBeInTheDocument();
  });

  it('keeps the existing error and leaves the registry untouched when the configured Space is inaccessible', async () => {
    seed(['/Broken'], '/Broken');
    const before = window.localStorage.getItem('clutter.spaces.v1');
    render(<AppShell />);

    expect(await screen.findByText('scan failed')).toBeInTheDocument();
    expect(screen.queryByText("Let's create a space")).toBeNull();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });

  it('shows the Welcome dialog, opens nothing and leaves the registry untouched when the configured folder is missing', async () => {
    seed(['/Missing'], '/Missing');
    const before = window.localStorage.getItem('clutter.spaces.v1');
    render(<AppShell />);

    expect(await screen.findByText("Let's create a space")).toBeInTheDocument();
    expect(document.querySelector('.startup-frame')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // A missing folder must never be re-created by bootstrap or anything else on the way.
    expect(bootstrap).not.toHaveBeenCalled();
    expect(tauri.mkdir).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });

  it('shows the Welcome dialog, registry untouched, when the folder vanishes between the probe and bootstrap', async () => {
    seed(['/Raced'], '/Raced');
    bootstrap.mockImplementation(async (root: string) => {
      events.push(`bootstrap:${root}`);
      throw new VaultRootMissingError(root);
    });
    const before = window.localStorage.getItem('clutter.spaces.v1');
    render(<AppShell />);

    expect(await screen.findByText("Let's create a space")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });

  describe('a missing active Space at startup falls back to the next available registered Space', () => {
    const REGISTRY = (s: string) => JSON.parse(SAVED() ?? s) as { paths: string[]; activePath: string };

    it('opens the next available Space, persisting it only once it has opened, and keeps the missing entry', async () => {
      seed(['/Users/me/Gone', '/Users/me/B'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      const gate = deferred<void>();
      gates.set('/Users/me/B', gate);
      const before = SAVED();
      render(<AppShell />);

      await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Users/me/B', expect.anything()));
      // Still opening: the opening frame, no Welcome dialog, and nothing persisted yet.
      expect(screen.getByText(OPENING)).toBeInTheDocument();
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(SAVED()).toBe(before);

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/B');
      expect(REGISTRY('').activePath).toBe('/Users/me/B');
      expect(REGISTRY('').paths).toEqual(['/Users/me/Gone', '/Users/me/B']);
      // The missing folder is never opened or created.
      expect(bootstrap).not.toHaveBeenCalledWith('/Users/me/Gone', expect.anything());
      expect(tauri.mkdir).not.toHaveBeenCalled();
    });

    it('never flashes the Welcome dialog while a replacement is found and opened', async () => {
      seed(['/Users/me/Gone', '/Users/me/Broken', '/Users/me/B'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      let welcomeShown = false;
      const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes(WELCOME)) welcomeShown = true;
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/B');
      observer.disconnect();
      expect(welcomeShown).toBe(false);
    });

    it('shows the Welcome dialog, registry untouched, when no other registered Space is valid', async () => {
      seed(['/Users/me/Gone', '/Users/me/AlsoGone'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      probeOverrides.set('/Users/me/AlsoGone', 'missing');
      const before = SAVED();
      render(<AppShell />);

      expect(await screen.findByText(WELCOME)).toBeInTheDocument();
      expect(bootstrap).not.toHaveBeenCalled();
      expect(SAVED()).toBe(before);
    });

    it('takes the next Space in registry order after the lost one — not the first or an alphabetical one', async () => {
      seed(['/Users/me/A', '/Users/me/Gone', '/Users/me/Z', '/Users/me/C'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Z');
    });

    it('wraps around to the start of the registry when the lost Space is last', async () => {
      seed(['/Users/me/A', '/Users/me/B', '/Users/me/Gone'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/A');
    });

    it('skips a candidate that is missing or inaccessible', async () => {
      seed(
        ['/Users/me/Gone', '/Users/me/AlsoGone', '/Users/me/Denied', '/Users/me/B'],
        '/Users/me/Gone'
      );
      probeOverrides.set('/Users/me/Gone', 'missing');
      probeOverrides.set('/Users/me/AlsoGone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/B');
      expect(bootstrap).not.toHaveBeenCalledWith('/Users/me/AlsoGone', expect.anything());
      expect(bootstrap).not.toHaveBeenCalledWith('/Users/me/Denied', expect.anything());
    });

    it('tries the next candidate when a replacement fails to open, persisting only the one that opens', async () => {
      seed(['/Users/me/Gone', '/Users/me/Broken', '/Users/me/B'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/B');
      expect(bootstrap).toHaveBeenCalledWith('/Users/me/Broken', expect.anything());
      expect(REGISTRY('').activePath).toBe('/Users/me/B');
      expect(REGISTRY('').paths).toEqual(['/Users/me/Gone', '/Users/me/Broken', '/Users/me/B']);
    });

    it('shows the Welcome dialog, registry untouched, when every replacement fails to open', async () => {
      seed(['/Users/me/Gone', '/Users/me/Broken'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      const before = SAVED();
      render(<AppShell />);

      expect(await screen.findByText(WELCOME)).toBeInTheDocument();
      expect(bootstrap).toHaveBeenCalledWith('/Users/me/Broken', expect.anything());
      expect(screen.queryByTestId('open-root')).toBeNull();
      expect(SAVED()).toBe(before);
    });

    it('keeps the missing path when, with no fallback, the user explicitly opens another Space', async () => {
      seed(['/Missing'], '/Missing');
      tauri.openDialog.mockResolvedValue('/Users/me/Notes');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Notes');
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Missing', '/Users/me/Notes'],
        activePath: '/Users/me/Notes',
      });
    });
  });

  it('keeps the existing error, not the Welcome dialog, when the configured folder exists but access is denied', async () => {
    seed(['/Denied'], '/Denied');
    bootstrap.mockImplementation(async () => {
      throw new Error('Permission denied (os error 13)');
    });
    const before = window.localStorage.getItem('clutter.spaces.v1');
    render(<AppShell />);

    expect(await screen.findByText('Permission denied (os error 13)')).toBeInTheDocument();
    expect(screen.queryByText("Let's create a space")).toBeNull();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });
});

const WELCOME = "Let's create a space";
const SAVED = () => window.localStorage.getItem('clutter.spaces.v1');

async function click(text: string) {
  await act(async () => screen.getByText(text).click());
}

async function typeName(name: string) {
  fireEvent.change(document.getElementById('space-details-name') as HTMLInputElement, {
    target: { value: name },
  });
}

describe('AppShell: Welcome dialog actions', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  describe('Select a folder', () => {
    it('opens the chosen folder, persists it only once it has opened, then closes the dialog', async () => {
      tauri.openDialog.mockResolvedValue('/Users/me/Notes');
      const gate = deferred<void>();
      gates.set('/Users/me/Notes', gate);
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Users/me/Notes', expect.anything()));

      // Still opening: dialog up, nothing remembered yet, no "Opening Clutter…" frame.
      expect(screen.getByText(WELCOME)).toBeInTheDocument();
      expect(screen.queryByText(OPENING)).toBeNull();
      expect(SAVED()).toBeNull();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Notes');
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/Notes'],
        activePath: '/Users/me/Notes',
      });
      expect(tauri.mkdir).not.toHaveBeenCalled();
      // Asked for a recursive scope grant, so the folder's contents are readable.
      expect(tauri.openDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true, recursive: true }));
    });

    it('does nothing when the picker is cancelled', async () => {
      tauri.openDialog.mockResolvedValue(null);
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(bootstrap).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText(WELCOME)).toBeInTheDocument();
      expect(SAVED()).toBeNull();
    });

    it.each([
      ['inside Documents', '/Users/me/Documents/Notes'],
      ['elsewhere inside the home directory', '/Users/me/Projects/notes'],
      ['outside the home directory (an external drive)', '/Volumes/Drive/Vault'],
      ['outside the home directory (another location)', '/opt/shared/vault'],
    ])('opens a folder %s, with its path unchanged, and persists it only after it opens', async (_name, picked) => {
      tauri.openDialog.mockResolvedValue(picked);
      const gate = deferred<void>();
      gates.set(picked, gate);
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await waitFor(() => expect(bootstrap).toHaveBeenCalledWith(picked, expect.anything()));
      expect(SAVED()).toBeNull();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent(picked);
      expect(JSON.parse(SAVED()!)).toEqual({ paths: [picked], activePath: picked });
    });

    it.each([
      ['the home folder itself', '/Users/me'],
      ['a folder containing it', '/Users'],
      ['the disk root', '/'],
    ])('refuses %s — too broad to scan and write into', async (_name, picked) => {
      tauri.openDialog.mockResolvedValue(picked);
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(await screen.findByRole('alert')).toHaveTextContent('too broad');
      expect(bootstrap).not.toHaveBeenCalled();
      expect(SAVED()).toBeNull();
    });

    it('a folder outside the home directory that cannot be accessed is reported as inaccessible, not as missing', async () => {
      tauri.openDialog.mockResolvedValue('/Volumes/Drive/Denied');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(await screen.findByRole('alert')).toHaveTextContent("can't open that folder");
      expect(screen.getByRole('alert')).not.toHaveTextContent("doesn't exist");
      expect(bootstrap).not.toHaveBeenCalled();
      expect(SAVED()).toBeNull();
    });

    it('does not persist an outside-home folder that fails to open', async () => {
      tauri.openDialog.mockResolvedValue('/Volumes/Drive/Broken');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(await screen.findByRole('alert')).toHaveTextContent('scan failed');
      expect(SAVED()).toBeNull();
    });

    it('reopens a folder chosen outside the home directory after the app restarts', async () => {
      tauri.openDialog.mockResolvedValue('/Volumes/Drive/Vault');
      const first = render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Select a folder');
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Volumes/Drive/Vault');
      first.unmount();
      bootstrap.mockClear();

      // A fresh launch: no picker, no Welcome — the saved path is restored and opened as is.
      tauri.openDialog.mockReset();
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Volumes/Drive/Vault');
      expect(bootstrap).toHaveBeenCalledWith('/Volumes/Drive/Vault', expect.anything());
      expect(tauri.openDialog).not.toHaveBeenCalled();
      expect(screen.queryByText(WELCOME)).toBeNull();
    });

    it('keeps the dialog and says so when the folder is inaccessible', async () => {
      tauri.openDialog.mockResolvedValue('/Users/me/Denied');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(await screen.findByRole('alert')).toHaveTextContent("can't open that folder");
      expect(bootstrap).not.toHaveBeenCalled();
      expect(screen.getByText(WELCOME)).toBeInTheDocument();
    });

    it('keeps the dialog, shows the reason and leaves the registry untouched when opening fails', async () => {
      tauri.openDialog.mockResolvedValue('/Users/me/Broken');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');

      expect(await screen.findByRole('alert')).toHaveTextContent('scan failed');
      expect(screen.getByText(WELCOME)).toBeInTheDocument();
      expect(SAVED()).toBeNull();
      expect(screen.queryByText('scan failed', { selector: '.startup-frame__message' })).toBeNull();
    });

    it('puts a previously stored (missing) configuration back when the new choice fails', async () => {
      seed(['/Users/me/Gone'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      tauri.openDialog.mockResolvedValue('/Users/me/Broken');
      const before = SAVED();
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await screen.findByRole('alert');

      expect(SAVED()).toBe(before);
      expect(screen.getByText(WELCOME)).toBeInTheDocument();
      // Still the missing-folder state, not an error screen: choosing again works.
      tauri.openDialog.mockResolvedValue('/Users/me/Notes');
      await click('Select a folder');
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Notes');
    });
  });

  describe('Create a new space', () => {
    it('swaps WelcomeScreen for SpaceDetails and back inside the same, still-mounted overlay', async () => {
      render(<AppShell />);
      await screen.findByText(WELCOME);
      const overlay = document.querySelector('.overlay');
      const content = document.querySelector('.overlay__content');

      await click('Create a new space');
      expect(await screen.findByText('Space Name')).toBeInTheDocument();
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(document.querySelector('.overlay')).toBe(overlay);
      expect(document.querySelector('.overlay__content')).toBe(content);
      expect(document.querySelectorAll('.overlay')).toHaveLength(1);
      // Location is under the user's own Documents folder.
      expect(screen.getByText('Documents/')).toBeInTheDocument();

      await click('Go back');
      expect(await screen.findByText(WELCOME)).toBeInTheDocument();
      expect(document.querySelector('.overlay')).toBe(overlay);
      expect(document.querySelectorAll('.overlay')).toHaveLength(1);
    });

    it('creates ~/Documents/<name> non-recursively, opens it, and persists only after it opened', async () => {
      const gate = deferred<void>();
      gates.set('/Users/me/Documents/Personal', gate);
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Create a new space');
      await screen.findByText('Space Name');

      await typeName('  Personal ');
      expect(screen.getByText('Documents/Personal')).toBeInTheDocument();
      await click('Create');

      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith('/Users/me/Documents/Personal', expect.anything())
      );
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(tauri.mkdir).toHaveBeenCalledWith('/Users/me/Documents/Personal', { recursive: false });
      // The created path reaches the opening flow unchanged — never the home folder or Documents.
      expect(bootstrap.mock.calls.map(([root]) => root)).toEqual(['/Users/me/Documents/Personal']);
      expect(SAVED()).toBeNull();
      expect(screen.getByText('Space Name')).toBeInTheDocument();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Documents/Personal');
      expect(screen.queryByText('Space Name')).toBeNull();
      expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/Documents/Personal');
      expect(JSON.parse(SAVED()!).paths).toEqual(['/Users/me/Documents/Personal']);
    });

    it.each(['', '   ', '..', '.', '../evil', 'a/b', '/etc', 'a:b'])(
      'rejects the name %j without creating anything',
      async (name) => {
        render(<AppShell />);
        await screen.findByText(WELCOME);
        await click('Create a new space');
        await screen.findByText('Space Name');

        await typeName(name);
        await click('Create');

        expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name');
        expect(tauri.mkdir).not.toHaveBeenCalled();
        expect(bootstrap).not.toHaveBeenCalled();
        expect(SAVED()).toBeNull();
      }
    );

    it('never adopts or overwrites an existing folder: says so and lets the user pick another name', async () => {
      tauri.mkdir.mockRejectedValueOnce('File exists (os error 17)');
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Create a new space');
      await screen.findByText('Space Name');

      await typeName('Personal');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
      expect(bootstrap).not.toHaveBeenCalled();
      expect(SAVED()).toBeNull();

      // Editing the name clears the message; another name goes through.
      await typeName('Work');
      expect(screen.queryByRole('alert')).toBeNull();
      await click('Create');
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Documents/Work');
    });

    it('reports a directory-creation failure and keeps the dialog', async () => {
      tauri.mkdir.mockRejectedValueOnce('Permission denied (os error 13)');
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Create a new space');
      await screen.findByText('Space Name');

      await typeName('Personal');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent("doesn't have permission");
      expect(bootstrap).not.toHaveBeenCalled();
      expect(screen.getByText('Space Name')).toBeInTheDocument();
      expect(SAVED()).toBeNull();
    });

    it('keeps the created folder when opening fails, and a retry opens it without creating it again', async () => {
      let failOpen = true;
      bootstrap.mockImplementation(async (root: string) => {
        events.push(`bootstrap:${root}`);
        if (failOpen) throw new Error('scan failed');
        return makeApp(root);
      });
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Create a new space');
      await screen.findByText('Space Name');
      await typeName('Personal');

      await click('Create');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('The folder was created');
      // …and it names the folder it was trying to open, and nothing wrong was made active.
      expect(alert).toHaveTextContent('/Users/me/Documents/Personal');
      expect(bootstrap.mock.calls.map(([root]) => root)).toEqual(['/Users/me/Documents/Personal']);
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(SAVED()).toBeNull();
      expect(screen.getByText('Space Name')).toBeInTheDocument();

      failOpen = false;
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Documents/Personal');
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/Documents/Personal');
    });
  });
});

/** What the real Application does on a confirmed loss: tell every subscriber. */
async function loseVault(app: FakeApplication) {
  await act(async () => [...app.lostListeners].forEach((listener) => listener()));
}

describe('AppShell: the open vault disappears while the app is running', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  /** A registry of A (active) and B, with B already gone — so a loss of A has nowhere valid to fall back to. */
  async function openWithNoFallback() {
    seed(['/Users/me/A', '/Users/me/B'], '/Users/me/A');
    probeOverrides.set('/Users/me/B', 'missing');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    return created[0]!;
  }

  describe('with no other valid Space', () => {
    it('swaps the workspace and space selector for the Welcome dialog, without a restart', async () => {
      const app = await openWithNoFallback();
      expect(screen.getByText('switch-other')).toBeInTheDocument();

      await loseVault(app);

      expect(await screen.findByText(WELCOME)).toBeInTheDocument();
      expect(screen.queryByTestId('open-root')).toBeNull();
      expect(screen.queryByText('switch-other')).toBeNull();
      expect(document.querySelector('.startup-frame')).not.toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('discards the Application and keeps the registry — missing paths included', async () => {
      const app = await openWithNoFallback();
      const before = SAVED();
      const bootstraps = bootstrap.mock.calls.length;

      await loseVault(app);
      await screen.findByText(WELCOME);

      expect(app.close).toHaveBeenCalledTimes(1);
      expect(SAVED()).toBe(before);
      expect(JSON.parse(SAVED()!)).toEqual({ paths: ['/Users/me/A', '/Users/me/B'], activePath: '/Users/me/A' });
      expect(bootstrap.mock.calls.length).toBe(bootstraps);
      expect(tauri.mkdir).not.toHaveBeenCalled();
    });

    it('lets the user open another vault afterwards, persisting only once it has opened', async () => {
      const app = await openWithNoFallback();
      await loseVault(app);
      await screen.findByText(WELCOME);
      const gate = deferred<void>();
      gates.set('/Users/me/Notes', gate);
      tauri.openDialog.mockResolvedValue('/Users/me/Notes');

      await click('Select a folder');
      await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Users/me/Notes', expect.anything()));
      expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/A');
      expect(screen.getByText(WELCOME)).toBeInTheDocument();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Notes');
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/A', '/Users/me/B', '/Users/me/Notes'],
        activePath: '/Users/me/Notes',
      });
    });

    it('keeps the dialog and the registry when the replacement vault fails to open', async () => {
      const app = await openWithNoFallback();
      await loseVault(app);
      await screen.findByText(WELCOME);
      const before = SAVED();
      tauri.openDialog.mockResolvedValue('/Users/me/Broken');

      await click('Select a folder');

      expect(await screen.findByRole('alert')).toHaveTextContent('scan failed');
      expect(screen.getByText(WELCOME)).toBeInTheDocument();
      expect(SAVED()).toBe(before);
    });

    it('can recreate the very same folder through "Create a new space" and reopen it', async () => {
      seed(['/Users/me/Documents/Personal'], '/Users/me/Documents/Personal');
      render(<AppShell />);
      const app = (await screen.findByTestId('open-root')) && created[0]!;
      await loseVault(app);
      await screen.findByText(WELCOME);

      await click('Create a new space');
      await screen.findByText('Space Name');
      await typeName('Personal');
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/Documents/Personal');
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(JSON.parse(SAVED()!).paths).toEqual(['/Users/me/Documents/Personal']);
    });
  });

  describe('with another valid Space', () => {
    async function openA(paths: string[]) {
      seed(paths, '/Users/me/A');
      render(<AppShell />);
      await screen.findByTestId('open-root');
      return created[0]!;
    }

    it('opens the next available Space in registry order, persisting it only after it has opened', async () => {
      const app = await openA(['/Users/me/A', '/Users/me/B', '/Users/me/C']);
      probeOverrides.set('/Users/me/A', 'missing');
      const gate = deferred<void>();
      gates.set('/Users/me/B', gate);
      const before = SAVED();

      await loseVault(app);
      await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Users/me/B', expect.anything()));

      // Mid-switch: the opening frame (not the Welcome dialog, not the lost workspace); nothing persisted yet.
      expect(screen.getByText(OPENING)).toBeInTheDocument();
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(screen.queryByTestId('open-root')).toBeNull();
      expect(SAVED()).toBe(before);
      expect(app.close).toHaveBeenCalledTimes(1);

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/B');
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/A', '/Users/me/B', '/Users/me/C'],
        activePath: '/Users/me/B',
      });
      // The lost folder is neither reopened nor recreated, and drops out of the selector.
      expect(bootstrap.mock.calls.filter(([root]) => root === '/Users/me/A')).toHaveLength(1); // only the original open
      expect(tauri.mkdir).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          Array.from(screen.getByTestId('space-selector').querySelectorAll('li')).map((li) =>
            li.getAttribute('data-path')
          )
        ).toEqual(['/Users/me/B', '/Users/me/C'])
      );
    });

    it('moves on to the next candidate when the first one fails to open', async () => {
      const app = await openA(['/Users/me/A', '/Users/me/Broken', '/Users/me/C']);
      probeOverrides.set('/Users/me/A', 'missing');

      await loseVault(app);

      expect(await screen.findByTestId('open-root')).toHaveTextContent('/Users/me/C');
      expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/C');
    });

    it('skips a candidate whose folder is missing or inaccessible, and shows Welcome if none is left', async () => {
      const app = await openA(['/Users/me/A', '/Users/me/Gone', '/Users/me/Denied']);
      probeOverrides.set('/Users/me/A', 'missing');
      probeOverrides.set('/Users/me/Gone', 'missing');
      const before = SAVED();

      await loseVault(app);

      expect(await screen.findByText(WELCOME)).toBeInTheDocument();
      expect(SAVED()).toBe(before);
    });

    it('ignores a stale loss callback from an old Application, and stops checking a vault once it is gone', async () => {
      const first = await openA(['/Users/me/A', '/Other']);
      const staleListener = [...first.lostListeners][0]!;

      await act(async () => screen.getByText('switch-other').click());
      await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Other'));
      // The first Application's own callback firing late must not touch the Space now showing.
      await act(async () => staleListener());
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Other');
      expect(screen.queryByText(WELCOME)).toBeNull();

      const second = created.find((app) => app.vault.root === '/Other')!;
      probeOverrides.set('/Users/me/A', 'missing');
      probeOverrides.set('/Other', 'missing');
      await loseVault(second);
      await screen.findByText(WELCOME);
      second.verifyRoot.mockClear();
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(second.verifyRoot).not.toHaveBeenCalled();
    });
  });

  it('checks the open vault when the window regains focus or becomes visible again', async () => {
    seed(['/Users/me/A'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    const app = created[0]!;

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(app.verifyRoot).toHaveBeenCalledTimes(1);

    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(app.verifyRoot).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(screen.queryByText(WELCOME)).toBeNull();
  });
});

describe('AppShell: the space selector lists only spaces that are available', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  const listed = () =>
    Array.from(screen.getByTestId('space-selector').querySelectorAll('li')).map((li) =>
      li.getAttribute('data-path')
    );

  it('shows existing spaces and leaves confirmed-missing ones out — but keeps them in the saved registry', async () => {
    seed(['/Users/me/A', '/Users/me/Gone', '/Users/me/B'], '/Users/me/A');
    probeOverrides.set('/Users/me/Gone', 'missing');
    const before = SAVED();
    render(<AppShell />);
    await screen.findByTestId('open-root');

    await waitFor(() => expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']));
    expect(SAVED()).toBe(before);
    expect(JSON.parse(SAVED()!).paths).toContain('/Users/me/Gone');
    expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/A');
    // Nothing was activated or created to get there.
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(tauri.mkdir).not.toHaveBeenCalled();
  });

  it('keeps a space that is merely inaccessible (permission/scope) in the list', async () => {
    seed(['/Users/me/A', '/Users/me/Denied'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');

    await waitFor(() => expect(listed()).toEqual(['/Users/me/A', '/Users/me/Denied']));
  });

  it('drops a space whose folder is deleted while the app runs, once availability is re-checked', async () => {
    seed(['/Users/me/A', '/Users/me/B'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    await waitFor(() => expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']));

    probeOverrides.set('/Users/me/B', 'missing');
    // The stale registry alone is not proof B still exists — until asked, the list is unchanged…
    expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']);
    // …and the selector opening (or the window refocusing) re-checks it.
    await act(async () => screen.getByText('refresh-spaces').click());
    await waitFor(() => expect(listed()).toEqual(['/Users/me/A']));
    expect(JSON.parse(SAVED()!).paths).toEqual(['/Users/me/A', '/Users/me/B']);

    // Restored later: it comes back.
    probeOverrides.delete('/Users/me/B');
    await act(async () => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']));
  });

  it('adds a valid space to the selector once it is opened', async () => {
    seed(['/Users/me/A'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    expect(listed()).toEqual(['/Users/me/A']);

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Other'));

    expect(listed()).toEqual(['/Users/me/A', '/Other']);
  });
});

describe('AppShell: the sidebar "New space" picker', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  async function openA() {
    seed(['/Users/me/A'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
  }

  it.each([
    ['the home folder itself', '/Users/me'],
    ['a folder containing it', '/Users'],
    ['the disk root', '/'],
  ])('refuses %s — it is never opened as a vault', async (_name, picked) => {
    await openA();
    const before = SAVED();
    const bootstraps = bootstrap.mock.calls.length;
    tauri.openDialog.mockResolvedValue(picked);

    await act(async () => screen.getByText('add-space').click());

    expect(await screen.findByText(/too broad to be a space/)).toBeInTheDocument();
    expect(bootstrap.mock.calls.length).toBe(bootstraps);
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
  });

  it.each([
    ['inside Documents', '/Users/me/Documents/Notes'],
    ['elsewhere inside the home folder', '/Users/me/Projects/notes'],
    ['outside the home folder (an external drive)', '/Volumes/Drive/Vault'],
  ])('opens a folder %s unchanged, and persists it once it has opened', async (_name, picked) => {
    await openA();
    tauri.openDialog.mockResolvedValue(picked);

    await act(async () => screen.getByText('add-space').click());

    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent(picked));
    expect(bootstrap).toHaveBeenCalledWith(picked, expect.anything());
    expect(JSON.parse(SAVED()!)).toEqual({ paths: ['/Users/me/A', picked], activePath: picked });
  });

  it('does not report an inaccessible folder outside the home folder as missing, and changes nothing', async () => {
    await openA();
    const before = SAVED();
    tauri.openDialog.mockResolvedValue('/Volumes/Drive/Denied');

    await act(async () => screen.getByText('add-space').click());

    expect(await screen.findByRole('status')).toHaveTextContent(/Can't open "\/Volumes\/Drive\/Denied"/);
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(screen.queryByText(WELCOME)).toBeNull();
  });

  it('still opens an ordinary folder, persisting it after it opens', async () => {
    await openA();
    tauri.openDialog.mockResolvedValue('/Users/me/Notes');

    await act(async () => screen.getByText('add-space').click());

    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/Notes'));
    expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/Notes');
  });

  it("reports the real reason when a switch fails with the fs plugin's plain-string error, and keeps the previous space", async () => {
    await openA();
    tauri.openDialog.mockResolvedValue('/Users/me/Stringy');

    await act(async () => screen.getByText('add-space').click());

    expect(await screen.findByRole('status')).toHaveTextContent('Permission denied (os error 13)');
    expect(screen.queryByText(/Failed to open vault/)).toBeNull();
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(JSON.parse(SAVED()!)).toEqual({ paths: ['/Users/me/A'], activePath: '/Users/me/A' });
  });
});

describe('AppShell: web development runtime', () => {
  it('still opens the in-memory /web-dev-vault with no stored Space and no Welcome dialog', async () => {
    render(<AppShell />);

    expect(await screen.findByTestId('open-root')).toHaveTextContent('/web-dev-vault');
    expect(screen.queryByText("Let's create a space")).toBeNull();
  });
});

describe('AppShell: switching Spaces', () => {
  it('keeps the current Space visible and open while the next one is prepared', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    const first = created[0]!;
    const gate = deferred<void>();
    gates.set('/Other', gate);

    await act(async () => screen.getByText('switch-other').click());

    await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything()));
    // Still Space A: shown, not closed, no opening screen, and the other Space not yet opened.
    expect(screen.getByTestId('open-root')).toHaveTextContent('/web-dev-vault');
    expect(screen.queryByText(OPENING)).toBeNull();
    expect(first.close).not.toHaveBeenCalled();
    expect(events).not.toContain('open:/Other');

    await act(async () => gate.resolve());

    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Other'));
    expect(screen.queryByText(OPENING)).toBeNull();
  });

  it('closes the old Application before the new one opens, then leaves only the new one running', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Other'));

    expect(events.indexOf('close:/web-dev-vault')).toBeGreaterThan(-1);
    expect(events.indexOf('close:/web-dev-vault')).toBeLessThan(events.indexOf('open:/Other'));
    expect(created.filter((app) => app.close.mock.calls.length === 0).map((a) => a.vault.root)).toEqual([
      '/Other',
    ]);
  });

  it('persists the new Space only after it opened, and restores it on the next launch', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    const gate = deferred<void>();
    const first = render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    gates.set('/Other', gate);

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything()));
    expect(JSON.parse(window.localStorage.getItem('clutter.spaces.v1')!).activePath).toBe(
      '/web-dev-vault'
    );

    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Other'));
    first.unmount();

    render(<AppShell />);
    expect(await screen.findByTestId('open-root')).toHaveTextContent('/Other');
  });

  it('keeps the current Space and reports an error when the destination fails to initialize', async () => {
    seed(['/web-dev-vault', '/Broken'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    const first = created[0]!;

    await act(async () => screen.getByText('switch-broken').click());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('scan failed'));
    expect(screen.getByTestId('open-root')).toHaveTextContent('/web-dev-vault');
    expect(screen.queryByText(OPENING)).toBeNull();
    expect(first.close).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem('clutter.spaces.v1')!).activePath).toBe(
      '/web-dev-vault'
    );
  });

  it('puts the previous Space back when the destination fails while opening, after the old one closed', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    openFails.add('/Other');

    await act(async () => screen.getByText('switch-other').click());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('watcher failed'));
    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/web-dev-vault'));
    // The failed destination was closed; a fresh Application serves the restored Space.
    const failed = created.find((app) => app.vault.root === '/Other')!;
    expect(failed.close).toHaveBeenCalled();
    const live = created.filter((app) => app.close.mock.calls.length === 0);
    expect(live.map((app) => app.vault.root)).toEqual(['/web-dev-vault']);
  });

  it('discards a prepared Space the user switched away from before it committed', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    const first = created[0]!;
    const gate = deferred<void>();
    gates.set('/Other', gate);

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything()));
    // Back to the Space that is already showing.
    await act(async () => screen.getByText('switch-first').click());
    await act(async () => gate.resolve());

    await waitFor(() => {
      const other = created.find((app) => app.vault.root === '/Other');
      expect(other?.close).toHaveBeenCalled();
    });
    expect(created.find((app) => app.vault.root === '/Other')!.open).not.toHaveBeenCalled();
    expect(first.close).not.toHaveBeenCalled();
    expect(screen.getByTestId('open-root')).toHaveTextContent('/web-dev-vault');
  });

  it('lets only the newest of two quick switches commit', async () => {
    seed(['/web-dev-vault', '/Other', '/Third'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    const slow = deferred<void>();
    gates.set('/Other', slow);

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything()));
    await act(async () => screen.getByText('switch-third').click());
    await waitFor(() => expect(screen.getByTestId('open-root')).toHaveTextContent('/Third'));
    await act(async () => slow.resolve());

    const other = created.find((app) => app.vault.root === '/Other')!;
    await waitFor(() => expect(other.close).toHaveBeenCalled());
    expect(other.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Third');
  });

  it('closes the open Application when the shell unmounts', async () => {
    const view = render(<AppShell />);
    await screen.findByTestId('open-root');
    view.unmount();
    expect(created.every((app) => app.close.mock.calls.length >= 1)).toBe(true);
  });

  it('refuses an unavailable folder without touching the current Space', async () => {
    seed(['/web-dev-vault', '/Missing'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');

    await act(async () => screen.getByText('switch-missing').click());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('/Missing'));
    expect(created).toHaveLength(1);
    expect(created[0]!.close).not.toHaveBeenCalled();
  });
});
