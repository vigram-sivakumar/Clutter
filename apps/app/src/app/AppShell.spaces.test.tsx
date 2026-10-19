// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
/** The `space` profile each folder carries in its own `.clutter/workspace.json` (read-only to the shell). */
type TestAvatar =
  { type: 'emoji'; emoji: string } | { type: 'image'; src: string };
const profileFiles = vi.hoisted(
  () => new Map<string, { id: string; avatar?: TestAvatar }>()
);
vi.mock(
  '../core/application/space/SpaceProfileStore',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../core/application/space/SpaceProfileStore')
    >()),
    readSpaceProfile: async (_fs: unknown, root: string) =>
      profileFiles.get(root) ?? null,
  })
);
/** Per-path overrides for the folder probe, on top of the name-based default below. */
const probeOverrides = vi.hoisted(() => new Map<string, string>());
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauri.isTauri,
  convertFileSrc: (path: string) => `asset://localhost${path}`,
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
// The Welcome background searches Unsplash; tests never reach the network (it just stays the plain surface).
const unsplash = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../core/integrations/unsplash/UnsplashApi', () => ({
  searchPhotos: (...args: unknown[]) => unsplash.search(...args),
  trackPhotoDownload: async () => false,
}));
/** What the mocked Unsplash search finds for the Welcome background. */
const WELCOME_PHOTO = {
  id: 'welcome',
  urls: {
    small: 'https://images.unsplash.com/welcome-small',
    regular: 'https://images.unsplash.com/welcome',
  },
  user: { name: 'Ada Lovelace', links: { html: 'https://unsplash.com/@ada' } },
  links: {
    downloadLocation: 'https://api.unsplash.com/photos/welcome/download',
  },
};
vi.mock('./frontendReady', () => ({ useFrontendReady: vi.fn() }));
vi.mock('./scheduleAfterFirstPaint', () => ({
  scheduleAfterFirstPaint: () => () => {},
}));
vi.mock('./layouts/app-layout/AppLayout', async () => {
  const { useSpaces } = await import('./spaces/SpacesContext');
  return {
    AppLayout: ({
      application,
      narrowSidebarOverride,
      onNarrowSidebarOverrideChange,
    }: {
      application: { vault: { root: string } };
      narrowSidebarOverride?: boolean | null;
      onNarrowSidebarOverrideChange?: (override: boolean | null) => void;
    }) => {
      const spaces = useSpaces();
      return (
        <div>
          <div data-testid="open-root">{application.vault.root}</div>
          <div data-testid="narrow-override">
            {String(narrowSidebarOverride)}
          </div>
          <button onClick={() => onNarrowSidebarOverrideChange?.(true)}>
            open-narrow-sidebar
          </button>
          <button onClick={() => spaces?.onSwitchSpace('/Other')}>
            switch-other
          </button>
          <button onClick={() => spaces?.onSwitchSpace('/Missing')}>
            switch-missing
          </button>
          <button onClick={() => spaces?.onSwitchSpace('/Broken')}>
            switch-broken
          </button>
          <button onClick={() => spaces?.onSwitchSpace('/web-dev-vault')}>
            switch-first
          </button>
          <button onClick={() => spaces?.onSwitchSpace('/Third')}>
            switch-third
          </button>
          <button onClick={() => spaces?.refreshAvailability?.()}>
            refresh-spaces
          </button>
          <button onClick={() => spaces?.onAddSpace?.()}>add-space</button>
          <ul data-testid="space-selector">
            {spaces?.spaces.map((space) => (
              <li
                key={space.path}
                data-path={space.path}
                data-missing={space.missing ? 'true' : undefined}
              />
            ))}
          </ul>
        </div>
      );
    },
  };
});

import { AppShell } from './AppShell';
import { probeSpaceFolder } from '../core/vault/providers/probeSpaceFolder';
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
  applySpaceProfile: ReturnType<typeof vi.fn>;
  workspace: {
    isSidebarVisible: boolean;
    setSidebarVisible: ReturnType<typeof vi.fn>;
  };
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
    // The Space's own sidebar state: each Space starts from its saved session (here: open).
    workspace: {
      isSidebarVisible: true,
      setSidebarVisible: vi.fn((visible: boolean) => {
        app.workspace.isSidebarVisible = visible;
        events.push(`sidebar:${root}:${visible}`);
      }),
    },
    // Stands in for the Space writing its own profile: identity always, then the avatar change.
    applySpaceProfile: vi.fn(async (change?: { avatar?: unknown }) => {
      const current = profileFiles.get(root) ?? { id: `id-of-${root}` };
      const avatar = change?.avatar as
        | { type: 'emoji'; emoji: string }
        | { type: 'image'; sourcePath: string }
        | null
        | undefined;
      const next: { id: string; avatar?: TestAvatar } = { id: current.id };
      if (avatar === undefined) {
        if (current.avatar) next.avatar = current.avatar;
      } else if (avatar?.type === 'emoji') {
        next.avatar = avatar;
      } else if (avatar?.type === 'image') {
        next.avatar = {
          type: 'image',
          src: `Assets/${avatar.sourcePath.split('/').pop()}`,
        };
      }
      profileFiles.set(root, next);
      return next;
    }),
  };
  created.push(app);
  return app;
}

function seed(paths: string[], activePath: string) {
  window.localStorage.setItem(
    'clutter.spaces.v1',
    JSON.stringify({ paths, activePath })
  );
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
  unsplash.search.mockReset().mockResolvedValue([]);
  tauri.invoke.mockReset();
  tauri.openDialog.mockReset();
  tauri.mkdir.mockReset();
  tauri.mkdir.mockResolvedValue(undefined);
  probeOverrides.clear();
  profileFiles.clear();
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
    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/web-dev-vault'
    );
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

    expect(await screen.findByText('Let’s create a space')).toBeInTheDocument();
    // Presented through the Overlay/Dialog (portal on body), over the still-mounted startup surface.
    expect(
      screen.getByText('Let’s create a space').closest('.overlay')
    ).not.toBeNull();
    expect(
      screen.getByText('Let’s create a space').closest('.dialog')
    ).not.toBeNull();
    expect(document.querySelector('.startup-frame')).not.toBeNull();
    expect(screen.queryByText(OPENING)).toBeNull();
    expect(bootstrap).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBeNull();
  });

  it('lets the window be dragged from the Welcome screen: a drag strip over the scrim, none on the dialog itself', async () => {
    render(<AppShell />);
    await screen.findByText(WELCOME);

    // The dialog's backdrop is a full-screen layer over the frame's own strip, so it carries one.
    const strip = document.querySelector(
      '.overlay__backdrop > [data-tauri-drag-region]'
    );
    expect(strip).not.toBeNull();
    expect(
      document.querySelector('.overlay__surface [data-tauri-drag-region]')
    ).toBeNull();
    expect(
      screen.getByText('Select a folder').closest('[data-tauri-drag-region]')
    ).toBeNull();
    expect(
      screen.getByText(WELCOME).closest('[data-tauri-drag-region]')
    ).toBeNull();
  });

  it('fills the app frame behind the Welcome dialog with the animated gradient, not an Unsplash image', async () => {
    // WELCOME_BACKDROP in AppShell picks the gradient; the Unsplash image is kept for switching back.
    unsplash.search.mockResolvedValue([WELCOME_PHOTO]);
    render(<AppShell />);
    await screen.findByText('Let’s create a space');

    const frame = document.querySelector('.startup-frame') as HTMLElement;
    expect(frame.querySelector('.gradient-grainy')).not.toBeNull();
    expect(frame.getAttribute('data-backdrop')).toBeNull();
    expect(frame.style.backgroundImage).toBe('');
    expect(unsplash.search).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Unsplash/ })).toBeNull();
    // The dialog is portalled to <body>, outside (and above) the frame; the frame holds no workspace.
    expect(frame.contains(screen.getByText('Let’s create a space'))).toBe(
      false
    );
    expect(screen.queryByTestId('open-root')).toBeNull();
    // The scrim is the dialog's own overlay backdrop; the frame adds none, so nothing is dimmed twice.
    expect(document.querySelector('.overlay__backdrop')!.className).toBe(
      'overlay__backdrop overlay__backdrop--tinted'
    );
  });

  it('shows the same background when the configured folder is missing', async () => {
    seed(['/Missing'], '/Missing');
    render(<AppShell />);
    await screen.findByText('Let’s create a space');

    expect(
      (document.querySelector('.startup-frame') as HTMLElement).querySelector(
        '.gradient-grainy'
      )
    ).not.toBeNull();
  });

  it('shows no background image on the opening frame, the error frame or the workspace', async () => {
    seed(['/Users/me/Notes'], '/Users/me/Notes');
    const gate = deferred<void>();
    gates.set('/Users/me/Notes', gate);
    const first = render(<AppShell />);

    await screen.findByText(OPENING);
    expect(
      document.querySelector('.startup-frame')!.getAttribute('data-backdrop')
    ).toBeNull();

    await act(async () => gate.resolve());
    await screen.findByTestId('open-root');
    expect(document.querySelector('.startup-frame')).toBeNull();
    first.unmount();

    seed(['/Users/me/Broken'], '/Users/me/Broken');
    render(<AppShell />);
    await screen.findByText('scan failed');
    expect(
      document.querySelector('.startup-frame')!.getAttribute('data-backdrop')
    ).toBeNull();
  });

  it('keeps the dialog open on Escape and on a backdrop click', async () => {
    render(<AppShell />);
    await screen.findByText('Let’s create a space');

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      (document.querySelector('.overlay__backdrop') as HTMLElement).click();
    });

    expect(screen.getByText('Let’s create a space')).toBeInTheDocument();
  });

  it('opens a configured Space normally, without ever showing the Welcome dialog', async () => {
    seed(['/Configured'], '/Configured');
    render(<AppShell />);

    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/Configured'
    );
    expect(screen.queryByText('Let’s create a space')).toBeNull();
    expect(bootstrap).toHaveBeenCalledWith('/Configured', expect.anything());
  });

  it('shows no Welcome dialog while a configured Space is still opening', async () => {
    seed(['/Configured'], '/Configured');
    const gate = deferred<void>();
    gates.set('/Configured', gate);
    render(<AppShell />);

    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(screen.queryByText('Let’s create a space')).toBeNull();

    await act(async () => gate.resolve());
    expect(await screen.findByTestId('open-root')).toBeInTheDocument();
  });

  it('keeps the existing error and leaves the registry untouched when the configured Space is inaccessible', async () => {
    seed(['/Broken'], '/Broken');
    const before = window.localStorage.getItem('clutter.spaces.v1');
    render(<AppShell />);

    expect(await screen.findByText('scan failed')).toBeInTheDocument();
    expect(screen.queryByText('Let’s create a space')).toBeNull();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });

  it('shows the Welcome dialog, opens nothing and leaves the registry untouched when the configured folder is missing', async () => {
    seed(['/Missing'], '/Missing');
    const before = window.localStorage.getItem('clutter.spaces.v1');
    render(<AppShell />);

    expect(await screen.findByText('Let’s create a space')).toBeInTheDocument();
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

    expect(await screen.findByText('Let’s create a space')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });

  describe('a missing active Space at startup falls back to the next available registered Space', () => {
    const REGISTRY = (s: string) =>
      JSON.parse(SAVED() ?? s) as { paths: string[]; activePath: string };

    it('opens the next available Space, persisting it only once it has opened, and keeps the missing entry', async () => {
      seed(['/Users/me/Gone', '/Users/me/B'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      const gate = deferred<void>();
      gates.set('/Users/me/B', gate);
      const before = SAVED();
      render(<AppShell />);

      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith('/Users/me/B', expect.anything())
      );
      // Still opening: the opening frame, no Welcome dialog, and nothing persisted yet.
      expect(screen.getByText(OPENING)).toBeInTheDocument();
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(SAVED()).toBe(before);

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/B'
      );
      expect(REGISTRY('').activePath).toBe('/Users/me/B');
      expect(REGISTRY('').paths).toEqual(['/Users/me/Gone', '/Users/me/B']);
      // The missing folder is never opened or created.
      expect(bootstrap).not.toHaveBeenCalledWith(
        '/Users/me/Gone',
        expect.anything()
      );
      expect(tauri.mkdir).not.toHaveBeenCalled();
    });

    it('never flashes the Welcome dialog while a replacement is found and opened', async () => {
      seed(
        ['/Users/me/Gone', '/Users/me/Broken', '/Users/me/B'],
        '/Users/me/Gone'
      );
      probeOverrides.set('/Users/me/Gone', 'missing');
      let welcomeShown = false;
      const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes(WELCOME)) welcomeShown = true;
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/B'
      );
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
      seed(
        ['/Users/me/A', '/Users/me/Gone', '/Users/me/Z', '/Users/me/C'],
        '/Users/me/Gone'
      );
      probeOverrides.set('/Users/me/Gone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Z'
      );
    });

    it('wraps around to the start of the registry when the lost Space is last', async () => {
      seed(['/Users/me/A', '/Users/me/B', '/Users/me/Gone'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/A'
      );
    });

    it('skips a candidate that is missing or inaccessible', async () => {
      seed(
        [
          '/Users/me/Gone',
          '/Users/me/AlsoGone',
          '/Users/me/Denied',
          '/Users/me/B',
        ],
        '/Users/me/Gone'
      );
      probeOverrides.set('/Users/me/Gone', 'missing');
      probeOverrides.set('/Users/me/AlsoGone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/B'
      );
      expect(bootstrap).not.toHaveBeenCalledWith(
        '/Users/me/AlsoGone',
        expect.anything()
      );
      expect(bootstrap).not.toHaveBeenCalledWith(
        '/Users/me/Denied',
        expect.anything()
      );
    });

    it('tries the next candidate when a replacement fails to open, persisting only the one that opens', async () => {
      seed(
        ['/Users/me/Gone', '/Users/me/Broken', '/Users/me/B'],
        '/Users/me/Gone'
      );
      probeOverrides.set('/Users/me/Gone', 'missing');
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/B'
      );
      expect(bootstrap).toHaveBeenCalledWith(
        '/Users/me/Broken',
        expect.anything()
      );
      expect(REGISTRY('').activePath).toBe('/Users/me/B');
      expect(REGISTRY('').paths).toEqual([
        '/Users/me/Gone',
        '/Users/me/Broken',
        '/Users/me/B',
      ]);
    });

    it('shows the Welcome dialog, registry untouched, when every replacement fails to open', async () => {
      seed(['/Users/me/Gone', '/Users/me/Broken'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      const before = SAVED();
      render(<AppShell />);

      expect(await screen.findByText(WELCOME)).toBeInTheDocument();
      expect(bootstrap).toHaveBeenCalledWith(
        '/Users/me/Broken',
        expect.anything()
      );
      expect(screen.queryByTestId('open-root')).toBeNull();
      expect(SAVED()).toBe(before);
    });

    it('keeps the missing path when, with no fallback, the user explicitly opens another Space', async () => {
      seed(['/Missing'], '/Missing');
      tauri.openDialog.mockResolvedValue('/Users/me/Notes');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Notes'
      );
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

    expect(
      await screen.findByText('Permission denied (os error 13)')
    ).toBeInTheDocument();
    expect(screen.queryByText('Let’s create a space')).toBeNull();
    expect(window.localStorage.getItem('clutter.spaces.v1')).toBe(before);
  });
});

const WELCOME = 'Let’s create a space';
const SAVED = () => window.localStorage.getItem('clutter.spaces.v1');

async function click(text: string) {
  await act(async () => screen.getByText(text).click());
}

// After "Select a folder" the dialog shows the picked folder's settings, still waiting on Open.
function expectSpaceDetailsShown() {
  expect(document.getElementById('space-details-name')).not.toBeNull();
}

async function typeName(name: string) {
  fireEvent.change(
    document.getElementById('space-details-name') as HTMLInputElement,
    {
      target: { value: name },
    }
  );
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
      await click('Create');
      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith(
          '/Users/me/Notes',
          expect.anything()
        )
      );

      // Still opening: dialog up, nothing remembered yet, no "Opening Clutter…" frame.
      expectSpaceDetailsShown();
      expect(screen.queryByText(OPENING)).toBeNull();
      expect(SAVED()).toBeNull();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Notes'
      );
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/Notes'],
        activePath: '/Users/me/Notes',
      });
      expect(tauri.mkdir).not.toHaveBeenCalled();
      // Asked for a recursive scope grant, so the folder's contents are readable.
      expect(tauri.openDialog).toHaveBeenCalledWith(
        expect.objectContaining({ directory: true, recursive: true })
      );
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
      [
        'outside the home directory (an external drive)',
        '/Volumes/Drive/Vault',
      ],
      ['outside the home directory (another location)', '/opt/shared/vault'],
    ])(
      'opens a folder %s, with its path unchanged, and persists it only after it opens',
      async (_name, picked) => {
        tauri.openDialog.mockResolvedValue(picked);
        const gate = deferred<void>();
        gates.set(picked, gate);
        render(<AppShell />);
        await screen.findByText(WELCOME);

        await click('Select a folder');
        await click('Create');
        await waitFor(() =>
          expect(bootstrap).toHaveBeenCalledWith(picked, expect.anything())
        );
        expect(SAVED()).toBeNull();

        await act(async () => gate.resolve());
        expect(await screen.findByTestId('open-root')).toHaveTextContent(
          picked
        );
        expect(JSON.parse(SAVED()!)).toEqual({
          paths: [picked],
          activePath: picked,
        });
      }
    );

    it.each([
      ['the home folder itself', '/Users/me'],
      ['a folder containing it', '/Users'],
      ['the disk root', '/'],
    ])(
      'refuses %s — too broad to scan and write into',
      async (_name, picked) => {
        tauri.openDialog.mockResolvedValue(picked);
        render(<AppShell />);
        await screen.findByText(WELCOME);

        await click('Select a folder');

        expect(await screen.findByRole('alert')).toHaveTextContent('too broad');
        expect(bootstrap).not.toHaveBeenCalled();
        expect(SAVED()).toBeNull();
      }
    );

    it('a folder outside the home directory that cannot be accessed is reported as inaccessible, not as missing', async () => {
      tauri.openDialog.mockResolvedValue('/Volumes/Drive/Denied');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'can’t open that folder'
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent('doesn’t exist');
      expect(bootstrap).not.toHaveBeenCalled();
      expect(SAVED()).toBeNull();
    });

    it('does not persist an outside-home folder that fails to open', async () => {
      tauri.openDialog.mockResolvedValue('/Volumes/Drive/Broken');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent('scan failed');
      expect(SAVED()).toBeNull();
    });

    it('reopens a folder chosen outside the home directory after the app restarts', async () => {
      tauri.openDialog.mockResolvedValue('/Volumes/Drive/Vault');
      const first = render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Select a folder');
      await click('Create');
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Volumes/Drive/Vault'
      );
      first.unmount();
      bootstrap.mockClear();

      // A fresh launch: no picker, no Welcome — the saved path is restored and opened as is.
      tauri.openDialog.mockReset();
      render(<AppShell />);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Volumes/Drive/Vault'
      );
      expect(bootstrap).toHaveBeenCalledWith(
        '/Volumes/Drive/Vault',
        expect.anything()
      );
      expect(tauri.openDialog).not.toHaveBeenCalled();
      expect(screen.queryByText(WELCOME)).toBeNull();
    });

    it('keeps the dialog and says so when the folder is inaccessible', async () => {
      tauri.openDialog.mockResolvedValue('/Users/me/Denied');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'can’t open that folder'
      );
      expect(bootstrap).not.toHaveBeenCalled();
      expectSpaceDetailsShown();
    });

    it('keeps the dialog, shows the reason and leaves the registry untouched when opening fails', async () => {
      tauri.openDialog.mockResolvedValue('/Users/me/Broken');
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent('scan failed');
      expectSpaceDetailsShown();
      expect(SAVED()).toBeNull();
      expect(
        screen.queryByText('scan failed', {
          selector: '.startup-frame__message',
        })
      ).toBeNull();
    });

    it('puts a previously stored (missing) configuration back when the new choice fails', async () => {
      seed(['/Users/me/Gone'], '/Users/me/Gone');
      probeOverrides.set('/Users/me/Gone', 'missing');
      tauri.openDialog.mockResolvedValue('/Users/me/Broken');
      const before = SAVED();
      render(<AppShell />);
      await screen.findByText(WELCOME);

      await click('Select a folder');
      await click('Create');
      await screen.findByRole('alert');

      expect(SAVED()).toBe(before);
      expectSpaceDetailsShown();
      // Still the missing-folder state, not an error screen: choosing again works.
      tauri.openDialog.mockResolvedValue('/Users/me/Notes');
      await click('Go back');
      await click('Select a folder');
      await click('Create');
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Notes'
      );
    });
  });

  describe('Create a new space', () => {
    it('swaps WelcomeScreen for SpaceDetails and back inside the same, still-mounted overlay', async () => {
      render(<AppShell />);
      await screen.findByText(WELCOME);
      const overlay = document.querySelector('.overlay');
      const content = document.querySelector('.overlay__content');

      await click('Create a new space');
      expect(await screen.findByText('Space name')).toBeInTheDocument();
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
      await screen.findByText('Space name');

      await typeName('  Personal ');
      expect(screen.getByText('Documents/Personal')).toBeInTheDocument();
      await click('Create');

      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith(
          '/Users/me/Documents/Personal',
          expect.anything()
        )
      );
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(tauri.mkdir).toHaveBeenCalledWith('/Users/me/Documents/Personal', {
        recursive: false,
      });
      // The created path reaches the opening flow unchanged — never the home folder or Documents.
      expect(bootstrap.mock.calls.map(([root]) => root)).toEqual([
        '/Users/me/Documents/Personal',
      ]);
      expect(SAVED()).toBeNull();
      expect(screen.getByText('Space name')).toBeInTheDocument();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Documents/Personal'
      );
      expect(screen.queryByText('Space name')).toBeNull();
      expect(JSON.parse(SAVED()!).activePath).toBe(
        '/Users/me/Documents/Personal'
      );
      expect(JSON.parse(SAVED()!).paths).toEqual([
        '/Users/me/Documents/Personal',
      ]);
    });

    it('remembers an emoji avatar chosen while creating the space, once the space has opened', async () => {
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Create a new space');
      await screen.findByText('Space name');
      await typeName('Personal');

      await act(async () => screen.getByLabelText('Change avatar').click());
      await act(async () =>
        screen.getAllByLabelText('grinning face')[0]!.click()
      );
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Documents/Personal'
      );
      // The avatar is written into the Space itself, not into the app-level registry.
      expect(profileFiles.get('/Users/me/Documents/Personal')?.avatar).toEqual({
        type: 'emoji',
        emoji: '😀',
      });
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/Documents/Personal'],
        activePath: '/Users/me/Documents/Personal',
      });
    });

    it('hands an uploaded image to the opened Space, which stores a Space-relative reference to its own copy', async () => {
      tauri.openDialog.mockResolvedValueOnce('/Volumes/Drive/Vault');
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Select a folder');

      tauri.openDialog.mockResolvedValueOnce('/Users/me/Pictures/logo.png');
      await act(async () => screen.getByLabelText('Change avatar').click());
      await click('Image');
      await click('Upload');
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Volumes/Drive/Vault'
      );
      expect(created.at(-1)!.applySpaceProfile).toHaveBeenCalledWith({
        avatar: { type: 'image', sourcePath: '/Users/me/Pictures/logo.png' },
      });
      expect(profileFiles.get('/Volumes/Drive/Vault')?.avatar).toEqual({
        type: 'image',
        src: 'Assets/logo.png',
      });
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Volumes/Drive/Vault'],
        activePath: '/Volumes/Drive/Vault',
      });
    });

    it('does not remember the avatar of a space that failed to open', async () => {
      tauri.openDialog.mockResolvedValueOnce('/Users/me/Broken');
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Select a folder');
      await act(async () => screen.getByLabelText('Change avatar').click());
      await act(async () =>
        screen.getAllByLabelText('grinning face')[0]!.click()
      );
      await click('Create');
      await screen.findByRole('alert');

      expect(SAVED()).toBeNull();
    });

    it.each(['', '   ', '..', '.', '../evil', 'a/b', '/etc', 'a:b'])(
      'rejects the name %j without creating anything',
      async (name) => {
        render(<AppShell />);
        await screen.findByText(WELCOME);
        await click('Create a new space');
        await screen.findByText('Space name');

        await typeName(name);
        await click('Create');

        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Enter a name'
        );
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
      await screen.findByText('Space name');

      await typeName('Personal');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'already exists'
      );
      expect(bootstrap).not.toHaveBeenCalled();
      expect(SAVED()).toBeNull();

      // Editing the name clears the message; another name goes through.
      await typeName('Work');
      expect(screen.queryByRole('alert')).toBeNull();
      await click('Create');
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Documents/Work'
      );
    });

    it('reports a directory-creation failure and keeps the dialog', async () => {
      tauri.mkdir.mockRejectedValueOnce('Permission denied (os error 13)');
      render(<AppShell />);
      await screen.findByText(WELCOME);
      await click('Create a new space');
      await screen.findByText('Space name');

      await typeName('Personal');
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'doesn’t have permission'
      );
      expect(bootstrap).not.toHaveBeenCalled();
      expect(screen.getByText('Space name')).toBeInTheDocument();
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
      await screen.findByText('Space name');
      await typeName('Personal');

      await click('Create');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('The folder was created');
      // …and it names the folder it was trying to open, and nothing wrong was made active.
      expect(alert).toHaveTextContent('/Users/me/Documents/Personal');
      expect(bootstrap.mock.calls.map(([root]) => root)).toEqual([
        '/Users/me/Documents/Personal',
      ]);
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(SAVED()).toBeNull();
      expect(screen.getByText('Space name')).toBeInTheDocument();

      failOpen = false;
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Documents/Personal'
      );
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(JSON.parse(SAVED()!).activePath).toBe(
        '/Users/me/Documents/Personal'
      );
    });
  });
});

/** What the real Application does on a confirmed loss: tell every subscriber. */
async function loseVault(app: FakeApplication) {
  await act(async () =>
    [...app.lostListeners].forEach((listener) => listener())
  );
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
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/A', '/Users/me/B'],
        activePath: '/Users/me/A',
      });
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
      await click('Create');
      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith(
          '/Users/me/Notes',
          expect.anything()
        )
      );
      expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/A');
      expectSpaceDetailsShown();

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Notes'
      );
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
      await click('Create');

      expect(await screen.findByRole('alert')).toHaveTextContent('scan failed');
      expectSpaceDetailsShown();
      expect(SAVED()).toBe(before);
    });

    it('can recreate the very same folder through "Create a new space" and reopen it', async () => {
      seed(['/Users/me/Documents/Personal'], '/Users/me/Documents/Personal');
      render(<AppShell />);
      const app = (await screen.findByTestId('open-root')) && created[0]!;
      await loseVault(app);
      await screen.findByText(WELCOME);

      await click('Create a new space');
      await screen.findByText('Space name');
      await typeName('Personal');
      await click('Create');

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/Documents/Personal'
      );
      expect(tauri.mkdir).toHaveBeenCalledTimes(1);
      expect(JSON.parse(SAVED()!).paths).toEqual([
        '/Users/me/Documents/Personal',
      ]);
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
      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith('/Users/me/B', expect.anything())
      );

      // Mid-switch: the opening frame (not the Welcome dialog, not the lost workspace); nothing persisted yet.
      expect(screen.getByText(OPENING)).toBeInTheDocument();
      expect(screen.queryByText(WELCOME)).toBeNull();
      expect(screen.queryByTestId('open-root')).toBeNull();
      expect(SAVED()).toBe(before);
      expect(app.close).toHaveBeenCalledTimes(1);

      await act(async () => gate.resolve());
      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/B'
      );
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/A', '/Users/me/B', '/Users/me/C'],
        activePath: '/Users/me/B',
      });
      // The lost folder is neither reopened nor recreated, and stays in the selector, marked missing.
      expect(
        bootstrap.mock.calls.filter(([root]) => root === '/Users/me/A')
      ).toHaveLength(1); // only the original open
      expect(tauri.mkdir).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          Array.from(
            screen.getByTestId('space-selector').querySelectorAll('li')
          ).map((li) => li.getAttribute('data-path'))
        ).toEqual(['/Users/me/A', '/Users/me/B', '/Users/me/C'])
      );
    });

    it('moves on to the next candidate when the first one fails to open', async () => {
      const app = await openA([
        '/Users/me/A',
        '/Users/me/Broken',
        '/Users/me/C',
      ]);
      probeOverrides.set('/Users/me/A', 'missing');

      await loseVault(app);

      expect(await screen.findByTestId('open-root')).toHaveTextContent(
        '/Users/me/C'
      );
      expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/C');
    });

    it('skips a candidate whose folder is missing or inaccessible, and shows Welcome if none is left', async () => {
      const app = await openA([
        '/Users/me/A',
        '/Users/me/Gone',
        '/Users/me/Denied',
      ]);
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
      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
      );
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

    await act(async () =>
      document.dispatchEvent(new Event('visibilitychange'))
    );
    expect(app.verifyRoot).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(screen.queryByText(WELCOME)).toBeNull();
  });
});

/**
 * Watches every DOM mutation from now on and remembers whether the Welcome dialog was ever inserted — even for
 * a single commit that a later one removes again, which a check of the final DOM (or of a `waitFor`) cannot see.
 */
function watchForWelcome() {
  let shown = false;
  const inspect = (node: Node) => {
    if (node.textContent?.includes(WELCOME)) shown = true;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(inspect);
      if (record.type === 'characterData' && record.target.parentNode)
        inspect(record.target.parentNode);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return {
    get shown() {
      observer
        .takeRecords()
        .forEach((record) => record.addedNodes.forEach(inspect));
      return shown;
    },
    stop: () => observer.disconnect(),
  };
}

describe('AppShell: an open vault is lost and another registered vault takes over, without Welcome', () => {
  const originalProbe = vi.mocked(probeSpaceFolder).getMockImplementation()!;

  beforeEach(() => {
    tauri.isTauri = true;
    // Real timing: the native folder probe and the vault scan each take a macrotask, which is what lets the
    // shell's state updates land in separate renders (instant mocks hide every race between them).
    vi.mocked(probeSpaceFolder).mockImplementation(async (path: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return originalProbe(path);
    });
    // The real `Application.bootstrap` never creates a missing root: it throws, whatever else is true.
    const baseBootstrap = bootstrap.getMockImplementation()!;
    bootstrap.mockImplementation(async (root: string, ...rest: unknown[]) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (probeOverrides.get(root) === 'missing') {
        events.push(`bootstrap:${root}`);
        throw new VaultRootMissingError(root);
      }
      return baseBootstrap(root, ...rest);
    });
  });

  afterEach(async () => {
    // Let the delayed probes and scans of a finished scenario settle while the shell is still mounted, so
    // none of them lands in the next test, then put the instant probe back.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    vi.mocked(probeSpaceFolder).mockImplementation(originalProbe);
  });

  async function openA(paths: string[]) {
    seed(paths, '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    return created[0]!;
  }

  it('never renders the Welcome dialog when the active vault is deleted and the next one opens', async () => {
    const app = await openA(['/Users/me/A', '/Users/me/B']);
    probeOverrides.set('/Users/me/A', 'missing');
    const welcome = watchForWelcome();

    await loseVault(app);

    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/Users/me/B'
    );
    expect(welcome.shown).toBe(false);
    // The lost vault is never opened again, and never recreated.
    expect(
      bootstrap.mock.calls.filter(([root]) => root === '/Users/me/A')
    ).toHaveLength(1);
    expect(tauri.mkdir).not.toHaveBeenCalled();
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A', '/Users/me/B'],
      activePath: '/Users/me/B',
    });
    welcome.stop();
  });

  it('never renders it when the loss is found through window focus (availability refresh and root check together)', async () => {
    const app = await openA(['/Users/me/A', '/Users/me/B', '/Users/me/C']);
    probeOverrides.set('/Users/me/A', 'missing');
    // The real `verifyRoot` reports the loss through the subscription once the root is confirmed gone.
    app.verifyRoot.mockImplementation(async () => {
      [...app.lostListeners].forEach((listener) => listener());
    });
    const welcome = watchForWelcome();

    await act(async () => window.dispatchEvent(new Event('focus')));

    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/Users/me/B'
    );
    await act(async () => {});
    expect(welcome.shown).toBe(false);
    expect(
      bootstrap.mock.calls.filter(([root]) => root === '/Users/me/B')
    ).toHaveLength(1);
    expect(
      created.filter(
        (created) =>
          created.vault.root === '/Users/me/B' &&
          created.open.mock.calls.length > 0
      )
    ).toHaveLength(1);
    welcome.stop();
  });

  it('never renders it while the fallback is still opening, nor between two candidates', async () => {
    const app = await openA([
      '/Users/me/A',
      '/Users/me/Broken',
      '/Users/me/Gone',
      '/Users/me/D',
    ]);
    probeOverrides.set('/Users/me/A', 'missing');
    probeOverrides.set('/Users/me/Gone', 'missing');
    const gate = deferred<void>();
    gates.set('/Users/me/D', gate);
    const welcome = watchForWelcome();

    await loseVault(app);
    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith('/Users/me/D', expect.anything())
    );
    expect(screen.getByText(OPENING)).toBeInTheDocument();
    expect(welcome.shown).toBe(false);

    await act(async () => gate.resolve());
    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/Users/me/D'
    );
    expect(welcome.shown).toBe(false);
    expect(
      bootstrap.mock.calls.filter(([root]) => root === '/Users/me/A')
    ).toHaveLength(1);
    expect(
      bootstrap.mock.calls.filter(([root]) => root === '/Users/me/Gone')
    ).toHaveLength(0);
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: [
        '/Users/me/A',
        '/Users/me/Broken',
        '/Users/me/Gone',
        '/Users/me/D',
      ],
      activePath: '/Users/me/D',
    });
    welcome.stop();
  });

  it('shows Welcome only after every candidate failed, and leaves the registry as stored', async () => {
    const app = await openA([
      '/Users/me/A',
      '/Users/me/Broken',
      '/Users/me/Gone',
    ]);
    probeOverrides.set('/Users/me/A', 'missing');
    probeOverrides.set('/Users/me/Gone', 'missing');
    const before = SAVED();
    const welcome = watchForWelcome();

    await loseVault(app);

    expect(await screen.findByText(WELCOME)).toBeInTheDocument();
    expect(welcome.shown).toBe(true);
    expect(SAVED()).toBe(before);
    expect(tauri.mkdir).not.toHaveBeenCalled();
    welcome.stop();
  });

  it('does not restore the lost vault when a second loss report arrives while the fallback opens', async () => {
    const app = await openA(['/Users/me/A', '/Users/me/B']);
    probeOverrides.set('/Users/me/A', 'missing');
    const gate = deferred<void>();
    gates.set('/Users/me/B', gate);
    const welcome = watchForWelcome();

    await loseVault(app);
    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith('/Users/me/B', expect.anything())
    );
    await loseVault(app);
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => gate.resolve());

    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/Users/me/B'
    );
    expect(welcome.shown).toBe(false);
    expect(
      bootstrap.mock.calls.filter(([root]) => root === '/Users/me/A')
    ).toHaveLength(1);
    expect(
      bootstrap.mock.calls.filter(([root]) => root === '/Users/me/B')
    ).toHaveLength(1);
    expect(JSON.parse(SAVED()!).activePath).toBe('/Users/me/B');
    welcome.stop();
  });
});

describe('AppShell: the space selector lists only spaces that are available', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  const listed = () =>
    Array.from(screen.getByTestId('space-selector').querySelectorAll('li')).map(
      (li) => li.getAttribute('data-path')
    );
  it('lists every space, confirmed-missing ones included, and keeps them in the saved registry', async () => {
    seed(['/Users/me/A', '/Users/me/Gone', '/Users/me/B'], '/Users/me/A');
    probeOverrides.set('/Users/me/Gone', 'missing');
    const before = SAVED();
    render(<AppShell />);
    await screen.findByTestId('open-root');

    await waitFor(() =>
      expect(listed()).toEqual(['/Users/me/A', '/Users/me/Gone', '/Users/me/B'])
    );
    // Only the confirmed-missing one is flagged (for the avatar's error badge).
    await waitFor(() =>
      expect(
        Array.from(
          screen
            .getByTestId('space-selector')
            .querySelectorAll('li[data-missing="true"]')
        ).map((li) => li.getAttribute('data-path'))
      ).toEqual(['/Users/me/Gone'])
    );
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

    await waitFor(() =>
      expect(listed()).toEqual(['/Users/me/A', '/Users/me/Denied'])
    );
  });

  it('keeps a space listed, and saved, when its folder is deleted while the app runs and availability is re-checked', async () => {
    seed(['/Users/me/A', '/Users/me/B'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    await waitFor(() =>
      expect(listed()).toEqual(['/Users/me/A', '/Users/me/B'])
    );

    probeOverrides.set('/Users/me/B', 'missing');
    // The stale registry alone is not proof B still exists — until asked, the list is unchanged…
    expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']);
    // …and the selector opening (or the window refocusing) re-checks it.
    await act(async () => screen.getByText('refresh-spaces').click());
    expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']);
    expect(JSON.parse(SAVED()!).paths).toEqual(['/Users/me/A', '/Users/me/B']);

    // Restored later: still just there.
    probeOverrides.delete('/Users/me/B');
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(listed()).toEqual(['/Users/me/A', '/Users/me/B']);
  });

  it('adds a valid space to the selector once it is opened', async () => {
    seed(['/Users/me/A'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
    expect(listed()).toEqual(['/Users/me/A']);

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
    );

    expect(listed()).toEqual(['/Users/me/A', '/Other']);
  });
});

describe('AppShell: the sidebar "New space" picker', () => {
  beforeEach(() => {
    tauri.isTauri = true;
  });

  async function openA(stored?: object) {
    if (stored)
      window.localStorage.setItem('clutter.spaces.v1', JSON.stringify(stored));
    else seed(['/Users/me/A'], '/Users/me/A');
    render(<AppShell />);
    await screen.findByTestId('open-root');
  }

  /** Clicks New space and lets the picker resolve with `picked`. */
  async function pickFolder(picked: string | null) {
    tauri.openDialog.mockResolvedValueOnce(picked);
    await act(async () => screen.getByText('add-space').click());
  }

  const nameInput = () =>
    document.getElementById('space-details-name') as HTMLInputElement | null;

  it.each([
    ['the home folder itself', '/Users/me'],
    ['a folder containing it', '/Users'],
    ['the disk root', '/'],
  ])(
    'refuses %s — it is never opened as a vault, and no settings dialog appears',
    async (_name, picked) => {
      await openA();
      const before = SAVED();
      const bootstraps = bootstrap.mock.calls.length;

      await pickFolder(picked);

      expect(
        await screen.findByText(/too broad to be a space/)
      ).toBeInTheDocument();
      expect(nameInput()).toBeNull();
      expect(bootstrap.mock.calls.length).toBe(bootstraps);
      expect(SAVED()).toBe(before);
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    }
  );

  it('opens Space Settings for the chosen folder without registering or opening it', async () => {
    await openA();
    const before = SAVED();
    const bootstraps = bootstrap.mock.calls.length;

    await pickFolder('/Users/me/Projects/notes');

    expect(nameInput()).not.toBeNull();
    // Nothing is registered, active, opened, persisted or written to the folder.
    expect(bootstrap.mock.calls.length).toBe(bootstraps);
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(
      screen.getAllByTestId('space-selector')[0]!.querySelectorAll('li')
    ).toHaveLength(1);
    expect(tauri.mkdir).not.toHaveBeenCalled();
  });

  it('prefills the folder name and shows the default (initial) avatar when none is saved', async () => {
    await openA();

    await pickFolder('/Users/me/Projects/notes');

    expect(nameInput()).toHaveValue('notes');
    expect(nameInput()).not.toHaveAttribute('readonly');
    expect(
      document.querySelector('.space-details__avatar-picker')
    ).toHaveTextContent('N');
    expect(
      document.querySelector('.space-details__avatar-picker img')
    ).toBeNull();
  });

  it('restores the emoji avatar the folder itself carries', async () => {
    profileFiles.set('/Users/me/B', {
      id: 'b',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    await openA({
      paths: ['/Users/me/A', '/Users/me/B'],
      activePath: '/Users/me/A',
    });

    await pickFolder('/Users/me/B');

    expect(nameInput()).toHaveValue('B');
    expect(
      document.querySelector('.space-details__avatar-picker .emoji-icon')
    ).toHaveTextContent('🌿');
  });

  it('restores the image avatar the folder carries, resolved against that folder', async () => {
    profileFiles.set('/Volumes/Drive/Vault', {
      id: 'v',
      avatar: { type: 'image', src: 'Assets/logo.png' },
    });
    await openA();

    await pickFolder('/Volumes/Drive/Vault');

    expect(
      document.querySelector('.space-details__avatar-picker img')
    ).toHaveAttribute(
      'src',
      'asset://localhost/Volumes/Drive/Vault/Assets/logo.png'
    );
  });

  it('writes nothing into the folder just because it was selected', async () => {
    await openA();
    const apps = created.length;
    const bootstraps = bootstrap.mock.calls.length;
    const profileWrites = created[0]!.applySpaceProfile.mock.calls.length;

    await pickFolder('/Users/me/Projects/notes');

    expect(created.length).toBe(apps);
    expect(bootstrap.mock.calls.length).toBe(bootstraps);
    expect(created[0]!.applySpaceProfile.mock.calls.length).toBe(profileWrites);
    expect(profileFiles.has('/Users/me/Projects/notes')).toBe(false);
  });

  it('confirming registers the folder and starts the existing open flow, persisting once it has opened', async () => {
    await openA();
    const gate = deferred<void>();
    gates.set('/Volumes/Drive/Vault', gate);
    await pickFolder('/Volumes/Drive/Vault');

    await click('Create');

    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith(
        '/Volumes/Drive/Vault',
        expect.anything()
      )
    );
    expect(nameInput()).toBeNull();
    // Still opening: the open Space and the stored registry are as before.
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A'],
      activePath: '/Users/me/A',
    });

    await act(async () => gate.resolve());
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/Volumes/Drive/Vault'
      )
    );
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A', '/Volumes/Drive/Vault'],
      activePath: '/Volumes/Drive/Vault',
    });
  });

  it.each([
    ['inside Documents', '/Users/me/Documents/Notes'],
    ['elsewhere inside the home folder', '/Users/me/Projects/notes'],
  ])('opens a confirmed folder %s unchanged', async (_name, picked) => {
    await openA();
    await pickFolder(picked);
    await click('Create');

    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent(picked)
    );
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A', picked],
      activePath: picked,
    });
  });

  it('cancelling the native picker changes nothing', async () => {
    await openA();
    const before = SAVED();

    await pickFolder(null);

    expect(nameInput()).toBeNull();
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
  });

  it('shows × instead of Go back in the selector’s Space Settings, and × only dismisses it', async () => {
    await openA();
    const before = SAVED();
    const bootstraps = bootstrap.mock.calls.length;
    await pickFolder('/Users/me/Notes');

    expect(nameInput()).not.toBeNull();
    expect(screen.queryByText('Go back')).toBeNull();

    await act(async () =>
      screen.getByRole('button', { name: 'Close' }).click()
    );

    await waitFor(() => expect(nameInput()).toBeNull());
    expect(bootstrap.mock.calls.length).toBe(bootstraps);
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
  });

  it('is not dismissed by Escape or a click outside — only by ×', async () => {
    await openA();
    const before = SAVED();
    await pickFolder('/Users/me/Notes');

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      (document.querySelector('.overlay__backdrop') as HTMLElement).click();
    });
    expect(nameInput()).not.toBeNull();

    await act(async () =>
      screen.getByRole('button', { name: 'Close' }).click()
    );
    await waitFor(() => expect(nameInput()).toBeNull());
    expect(SAVED()).toBe(before);
  });

  it('labels the confirm button Create whether the folder is new or already exists', async () => {
    await openA();
    await pickFolder('/Users/me/Notes');
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  it('shows Go back and no × in the Space Settings reached from the Welcome screen', async () => {
    tauri.openDialog.mockResolvedValueOnce('/Users/me/Notes');
    render(<AppShell />);
    await screen.findByText(WELCOME);
    await click('Select a folder');

    expect(screen.getByText('Go back')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('cancelling Space Settings registers nothing and keeps the active Space', async () => {
    await openA();
    const before = SAVED();
    const bootstraps = bootstrap.mock.calls.length;
    await pickFolder('/Users/me/Notes');

    await act(async () =>
      screen.getByRole('button', { name: 'Close' }).click()
    );
    await waitFor(() => expect(nameInput()).toBeNull());

    expect(nameInput()).toBeNull();
    expect(bootstrap.mock.calls.length).toBe(bootstraps);
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(
      screen.getAllByTestId('space-selector')[0]!.querySelectorAll('li')
    ).toHaveLength(1);
  });

  it('does not persist an avatar edited in the dialog unless the dialog is confirmed', async () => {
    await openA();
    const before = SAVED();
    await pickFolder('/Users/me/Notes');

    await act(async () => screen.getByLabelText('Change avatar').click());
    await act(async () =>
      screen.getAllByLabelText('grinning face')[0]!.click()
    );
    expect(
      document.querySelector('.space-details__avatar-picker .emoji-icon')
    ).toHaveTextContent('😀');
    await act(async () =>
      screen.getByRole('button', { name: 'Close' }).click()
    );
    await waitFor(() => expect(nameInput()).toBeNull());

    expect(SAVED()).toBe(before);
    expect(profileFiles.has('/Users/me/Notes')).toBe(false);
    // Choosing the same folder again starts from what is saved, not from the abandoned edit.
    await pickFolder('/Users/me/Notes');
    expect(
      document.querySelector('.space-details__avatar-picker .emoji-icon')
    ).toBeNull();
  });

  it('writes a confirmed avatar into the opened Space, not into the registry', async () => {
    await openA();
    await pickFolder('/Users/me/Notes');
    await act(async () => screen.getByLabelText('Change avatar').click());
    await act(async () =>
      screen.getAllByLabelText('grinning face')[0]!.click()
    );

    await click('Create');

    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/Users/me/Notes'
      )
    );
    expect(profileFiles.get('/Users/me/Notes')?.avatar).toEqual({
      type: 'emoji',
      emoji: '😀',
    });
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A', '/Users/me/Notes'],
      activePath: '/Users/me/Notes',
    });
  });

  it('leaves a registered folder’s own avatar untouched unless the user changes it', async () => {
    profileFiles.set('/Users/me/B', {
      id: 'b',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    await openA({
      paths: ['/Users/me/A', '/Users/me/B'],
      activePath: '/Users/me/A',
    });
    // A trailing slash is the same folder: no duplicate entry.
    await pickFolder('/Users/me/B/');

    await click('Create');

    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/B')
    );
    expect(created.at(-1)!.applySpaceProfile).toHaveBeenCalledWith({});
    expect(profileFiles.get('/Users/me/B')?.avatar).toEqual({
      type: 'emoji',
      emoji: '🌿',
    });
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A', '/Users/me/B'],
      activePath: '/Users/me/B',
    });
  });

  it('removing the avatar a folder carries removes it from the Space on confirm', async () => {
    profileFiles.set('/Users/me/B', {
      id: 'b',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    await openA({
      paths: ['/Users/me/A', '/Users/me/B'],
      activePath: '/Users/me/A',
    });
    await pickFolder('/Users/me/B');
    await act(async () => screen.getByLabelText('Change avatar').click());
    await act(async () => screen.getByLabelText('Remove avatar').click());

    await click('Create');

    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/B')
    );
    expect(created.at(-1)!.applySpaceProfile).toHaveBeenCalledWith({
      avatar: null,
    });
    expect(profileFiles.get('/Users/me/B')?.avatar).toBeUndefined();
    expect(profileFiles.get('/Users/me/B')?.id).toBe('b');
  });

  it('confirming the already open Space only applies the avatar to it and opens nothing', async () => {
    await openA();
    const bootstraps = bootstrap.mock.calls.length;
    await pickFolder('/Users/me/A');
    await act(async () => screen.getByLabelText('Change avatar').click());
    await act(async () =>
      screen.getAllByLabelText('grinning face')[0]!.click()
    );

    await click('Create');

    await waitFor(() => expect(nameInput()).toBeNull());
    expect(bootstrap.mock.calls.length).toBe(bootstraps);
    expect(profileFiles.get('/Users/me/A')?.avatar).toEqual({
      type: 'emoji',
      emoji: '😀',
    });
  });

  it('gives a Space that has no identity one when it first opens, and records nothing about it in the registry', async () => {
    await openA();

    expect(profileFiles.get('/Users/me/A')?.id).toBe('id-of-/Users/me/A');
    expect(
      JSON.parse(window.localStorage.getItem('clutter.spaces.v1')!)
    ).toEqual({
      paths: ['/Users/me/A'],
      activePath: '/Users/me/A',
    });
  });

  it('never stores Space metadata in the global registry, whatever the Space carries', async () => {
    profileFiles.set('/Users/me/B', {
      id: 'b',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    await openA({
      paths: ['/Users/me/A', '/Users/me/B'],
      activePath: '/Users/me/A',
    });
    await pickFolder('/Users/me/B');
    await act(async () => screen.getByLabelText('Change avatar').click());
    await act(async () =>
      screen.getAllByLabelText('grinning face')[0]!.click()
    );
    await click('Create');
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/B')
    );

    const stored = JSON.parse(
      window.localStorage.getItem('clutter.spaces.v1')!
    );
    expect(Object.keys(stored).sort()).toEqual(['activePath', 'paths']);
    expect(window.localStorage.getItem('clutter.spaces.v1')).not.toMatch(
      /emoji|avatar|"id"/
    );
  });

  it('a folder moved or renamed outside Clutter is just opened from its new path; the old entry is left alone', async () => {
    // The Space once lived at /Users/me/Old (now gone) and carries its identity and avatar with it.
    profileFiles.set('/Users/me/Renamed', {
      id: 'same-space',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    await openA({
      paths: ['/Users/me/A', '/Users/me/Missing Old'],
      activePath: '/Users/me/A',
    });

    await pickFolder('/Users/me/Renamed');
    expect(
      document.querySelector('.space-details__avatar-picker .emoji-icon')
    ).toHaveTextContent('🌿');
    await click('Create');

    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/Users/me/Renamed'
      )
    );
    // No relocation: the moved folder is a new path; the unavailable one stays registered as it was.
    expect(JSON.parse(SAVED()!)).toEqual({
      paths: ['/Users/me/A', '/Users/me/Missing Old', '/Users/me/Renamed'],
      activePath: '/Users/me/Renamed',
    });
    expect(profileFiles.get('/Users/me/Renamed')).toEqual({
      id: 'same-space',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
  });

  it('a failed open leaves the registry, the active Space and the folder as they were', async () => {
    await openA();
    const before = SAVED();
    await pickFolder('/Users/me/Stringy');
    await act(async () => screen.getByLabelText('Change avatar').click());
    await act(async () =>
      screen.getAllByLabelText('grinning face')[0]!.click()
    );

    await click('Create');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Permission denied (os error 13)'
    );
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(SAVED()).toBe(before);
  });

  it('keeps the dialog open and explains when the confirmed folder cannot be opened', async () => {
    await openA();
    const before = SAVED();
    await pickFolder('/Volumes/Drive/Denied');

    await click('Create');

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Can’t open “\/Volumes\/Drive\/Denied”/
    );
    expect(nameInput()).not.toBeNull();
    expect(SAVED()).toBe(before);
    expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    expect(screen.queryByText(WELCOME)).toBeNull();
  });

  describe('renaming the picked folder on Create (ADR-056, renaming a Space’s folder)', () => {
    const RENAME = 'rename_space_folder';
    const renameCalls = () =>
      tauri.invoke.mock.calls.filter(([command]) => command === RENAME);

    /** The Rust command: the folder moves (with the profile inside it) to `<same parent>/<new name>`. */
    function renameSucceeds() {
      tauri.invoke.mockImplementation(
        async (command: string, args: { path: string; newName: string }) => {
          if (command !== RENAME) return undefined;
          const renamed = `${args.path.slice(0, args.path.lastIndexOf('/'))}/${args.newName}`;
          const profile = profileFiles.get(args.path);
          if (profile) {
            profileFiles.set(renamed, profile);
            profileFiles.delete(args.path);
          }
          return renamed;
        }
      );
    }
    function renameFails(reason: string) {
      tauri.invoke.mockImplementation(async (command: string) => {
        if (command === RENAME) throw reason;
        return undefined;
      });
    }
    const changeButton = () =>
      screen.getByRole('button', { name: 'Change location' });

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('offers the picked folder’s name, editable, with the location read-only and Change and the avatar kept', async () => {
      await openA();
      await pickFolder('/Users/me/Projects/notes');

      expect(nameInput()).toHaveValue('notes');
      expect(nameInput()).not.toHaveAttribute('readonly');
      expect(document.getElementById('space-details-location')).toHaveAttribute(
        'readonly'
      );
      expect(changeButton()).toBeInTheDocument();
      expect(screen.getByLabelText('Change avatar')).toBeInTheDocument();
    });

    it('keeps the open Space’s name read-only, and offers every other folder’s name for editing', async () => {
      await openA({
        paths: ['/Users/me/A', '/Users/me/B'],
        activePath: '/Users/me/A',
      });

      await pickFolder('/Users/me/A');
      expect(nameInput()).toHaveAttribute('readonly');
      await act(async () =>
        screen.getByRole('button', { name: 'Close' }).click()
      );

      await pickFolder('/Users/me/B'); // registered, but not the open one
      expect(nameInput()).not.toHaveAttribute('readonly');
    });

    it('opens the folder at its own path, renaming nothing, when the name is unchanged', async () => {
      renameSucceeds();
      await openA();
      await pickFolder('/Users/me/Projects/notes');

      await click('Create');

      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Users/me/Projects/notes'
        )
      );
      expect(renameCalls()).toHaveLength(0);
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/A', '/Users/me/Projects/notes'],
        activePath: '/Users/me/Projects/notes',
      });
    });

    it.each([
      [
        'inside the home folder',
        '/Users/me/Projects/notes',
        '/Users/me/Projects/Journal',
      ],
      [
        'inside Documents',
        '/Users/me/Documents/notes',
        '/Users/me/Documents/Journal',
      ],
      [
        'on an external drive, outside the home folder',
        '/Volumes/Drive/notes',
        '/Volumes/Drive/Journal',
      ],
      [
        'somewhere else outside the home folder',
        '/opt/shared/notes',
        '/opt/shared/Journal',
      ],
    ])(
      'renames a folder %s and registers and opens it at the new path',
      async (_where, picked, renamed) => {
        renameSucceeds();
        await openA();
        await pickFolder(picked);
        typeName(' Journal ');

        expect(renameCalls()).toHaveLength(0); // typing alone touches nothing
        await click('Create');

        await waitFor(() =>
          expect(screen.getByTestId('open-root')).toHaveTextContent(renamed)
        );
        expect(renameCalls()).toEqual([
          [RENAME, { path: picked, newName: 'Journal' }],
        ]);
        expect(bootstrap.mock.calls.map(([root]) => root)).not.toContain(
          picked
        ); // the old path is never opened
        expect(JSON.parse(SAVED()!)).toEqual({
          paths: ['/Users/me/A', renamed],
          activePath: renamed,
        });
      }
    );

    it('replaces a registered Space’s entry in place, keeping its position in the list', async () => {
      renameSucceeds();
      await openA({
        paths: ['/Users/me/A', '/Users/me/B', '/Users/me/C'],
        activePath: '/Users/me/A',
      });
      await pickFolder('/Users/me/B');
      typeName('B2');

      await click('Create');

      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Users/me/B2'
        )
      );
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/Users/me/A', '/Users/me/B2', '/Users/me/C'],
        activePath: '/Users/me/B2',
      });
    });

    it('keeps the folder’s contents, stable Space ID and avatar, and records none of it in the registry', async () => {
      renameSucceeds();
      profileFiles.set('/Volumes/Drive/B', {
        id: 'stable-id',
        avatar: { type: 'emoji', emoji: '🌿' },
      });
      await openA({
        paths: ['/Users/me/A', '/Volumes/Drive/B'],
        activePath: '/Users/me/A',
      });
      await pickFolder('/Volumes/Drive/B');
      expect(
        document.querySelector('.space-details__avatar-picker .emoji-icon')
      ).toHaveTextContent('🌿');
      typeName('B2');

      await click('Create');

      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Volumes/Drive/B2'
        )
      );
      // The avatar was not touched (an unchanged avatar is no change, even though the path changed).
      expect(created.at(-1)!.applySpaceProfile).toHaveBeenCalledWith({});
      expect(profileFiles.get('/Volumes/Drive/B2')).toEqual({
        id: 'stable-id',
        avatar: { type: 'emoji', emoji: '🌿' },
      });
      expect(Object.keys(JSON.parse(SAVED()!)).sort()).toEqual([
        'activePath',
        'paths',
      ]);
    });

    it('applies an avatar the user picked to the renamed folder', async () => {
      renameSucceeds();
      await openA();
      await pickFolder('/Users/me/Projects/notes');
      typeName('Journal');
      await act(async () => screen.getByLabelText('Change avatar').click());
      await act(async () =>
        screen.getAllByLabelText('grinning face')[0]!.click()
      );

      await click('Create');

      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Users/me/Projects/Journal'
        )
      );
      expect(profileFiles.get('/Users/me/Projects/Journal')?.avatar).toEqual({
        type: 'emoji',
        emoji: '😀',
      });
    });

    it('changing the folder before confirming renames nothing, and the new folder’s own name is offered', async () => {
      renameSucceeds();
      await openA();
      const before = SAVED();
      await pickFolder('/Users/me/Projects/notes');
      typeName('Edited');

      tauri.openDialog.mockResolvedValueOnce('/Volumes/Drive/other');
      await act(async () => changeButton().click());

      expect(nameInput()).toHaveValue('other');
      expect(document.getElementById('space-details-location')).toHaveValue(
        'Drive/other'
      );
      expect(renameCalls()).toHaveLength(0);
      expect(SAVED()).toBe(before);

      await click('Create');
      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Volumes/Drive/other'
        )
      );
      expect(renameCalls()).toHaveLength(0);
    });

    it('cancelling leaves the folder, the registry and the open Space untouched', async () => {
      renameSucceeds();
      await openA({
        paths: ['/Users/me/A', '/Users/me/B'],
        activePath: '/Users/me/A',
      });
      const before = SAVED();
      const bootstraps = bootstrap.mock.calls.length;
      await pickFolder('/Users/me/B');
      typeName('B2');

      await act(async () =>
        screen.getByRole('button', { name: 'Close' }).click()
      );

      await waitFor(() => expect(nameInput()).toBeNull());
      expect(renameCalls()).toHaveLength(0);
      expect(bootstrap.mock.calls.length).toBe(bootstraps);
      expect(SAVED()).toBe(before);
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    });

    it.each([
      ['a name that is already taken', 'File exists (os error 17)'],
      [
        'a permission refusal on an external drive',
        'Permission denied (os error 13)',
      ],
      ['a folder with no grant', 'forbidden path: /Volumes/Drive/notes'],
      ['a read-only volume', 'Read-only file system (os error 30)'],
    ])(
      'a rename that fails (%s) opens and registers nothing, and the dialog stays',
      async (_what, reason) => {
        renameFails(reason);
        await openA({
          paths: ['/Users/me/A', '/Volumes/Drive/notes'],
          activePath: '/Users/me/A',
        });
        const before = SAVED();
        const bootstraps = bootstrap.mock.calls.length;
        await pickFolder('/Volumes/Drive/notes');
        typeName('Taken');

        await click('Create');

        await waitFor(() => expect(renameCalls()).toHaveLength(1));
        expect(nameInput()).toHaveValue('Taken'); // as the user left it
        expect(bootstrap.mock.calls.length).toBe(bootstraps);
        expect(SAVED()).toBe(before); // the registry still names the folder at its old, still existing, path
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Users/me/A'
        );
      }
    );

    it('a name that cannot be a folder name renames nothing', async () => {
      renameSucceeds();
      await openA();
      await pickFolder('/Users/me/Projects/notes');

      for (const name of ['', 'a/b', 'a:b', '..']) {
        typeName(name);
        await click('Create');
      }

      expect(renameCalls()).toHaveLength(0);
      expect(nameInput()).not.toBeNull();
    });

    it('a rename that succeeds but whose open then fails leaves the registry as it was, and nothing is renamed twice', async () => {
      renameSucceeds();
      await openA({
        paths: ['/Users/me/A', '/Users/me/B'],
        activePath: '/Users/me/A',
      });
      const before = SAVED();
      await pickFolder('/Users/me/B');
      typeName('Broken'); // bootstrap refuses any root ending in /Broken

      await click('Create');

      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith(
          '/Users/me/Broken',
          expect.anything()
        )
      );
      expect(renameCalls()).toHaveLength(1);
      // The registry is written only once a Space opens: it keeps the old entry, as for any failed open, and the
      // folder is now simply at a path the registry does not know (the usual "folder not found" recovery).
      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A')
      );
      expect(SAVED()).toBe(before);
    });

    it('a renamed folder that is then refused at confirm keeps the dialog on it; a retry never renames twice', async () => {
      renameSucceeds();
      await openA();
      const before = SAVED();
      await pickFolder('/Users/me/Projects/notes');
      typeName('Denied'); // the probe reports any path containing "Denied" as inaccessible

      await click('Create');

      await waitFor(() => expect(renameCalls()).toHaveLength(1));
      expect(nameInput()).toHaveValue('Denied'); // the dialog follows the folder to its new name and path
      expect(SAVED()).toBe(before);

      await click('Create');

      expect(renameCalls()).toHaveLength(1);
      expect(nameInput()).toHaveValue('Denied');
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Users/me/A');
    });
  });
});

describe('AppShell: web development runtime', () => {
  it('still opens the in-memory /web-dev-vault with no stored Space and no Welcome dialog', async () => {
    render(<AppShell />);

    expect(await screen.findByTestId('open-root')).toHaveTextContent(
      '/web-dev-vault'
    );
    expect(screen.queryByText('Let’s create a space')).toBeNull();
  });
});

describe('AppShell: the sidebar across a Space switch', () => {
  async function openFirst() {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    return created[0]!;
  }

  it('does not touch the sidebar of the first Space it opens', async () => {
    const first = await openFirst();
    expect(first.workspace.setSidebarVisible).not.toHaveBeenCalled();
  });

  it.each([
    { visible: true, name: 'expanded' },
    { visible: false, name: 'collapsed' },
  ])(
    'carries a $name sidebar into the Space switched to, before it opens',
    async ({ visible }) => {
      const first = await openFirst();
      first.workspace.isSidebarVisible = visible;

      await act(async () => screen.getByText('switch-other').click());
      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
      );

      const second = created[1]!;
      expect(second.workspace.setSidebarVisible).toHaveBeenCalledWith(visible);
      expect(second.workspace.isSidebarVisible).toBe(visible);
      expect(events.indexOf(`sidebar:/Other:${visible}`)).toBeLessThan(
        events.indexOf('open:/Other')
      );
    }
  );

  it('keeps the narrow-window override across the switch, though the layout is rebuilt for the new Space', async () => {
    await openFirst();
    await act(async () => screen.getByText('open-narrow-sidebar').click());
    expect(screen.getByTestId('narrow-override')).toHaveTextContent('true');

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
    );

    expect(screen.getByTestId('narrow-override')).toHaveTextContent('true');
  });

  it('puts the previous Space back with the same sidebar when the switch fails after closing it', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    openFails.add('/Other');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    created[0]!.workspace.isSidebarVisible = false;

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() => expect(created.length).toBeGreaterThanOrEqual(3));

    const restored = created.at(-1)!;
    expect(restored.vault.root).toBe('/web-dev-vault');
    expect(restored.workspace.setSidebarVisible).toHaveBeenCalledWith(false);
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

    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything())
    );
    // Still Space A: shown, not closed, no opening screen, and the other Space not yet opened.
    expect(screen.getByTestId('open-root')).toHaveTextContent('/web-dev-vault');
    expect(screen.queryByText(OPENING)).toBeNull();
    expect(first.close).not.toHaveBeenCalled();
    expect(events).not.toContain('open:/Other');

    await act(async () => gate.resolve());

    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
    );
    expect(screen.queryByText(OPENING)).toBeNull();
  });

  it('closes the old Application before the new one opens, then leaves only the new one running', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
    );

    expect(events.indexOf('close:/web-dev-vault')).toBeGreaterThan(-1);
    expect(events.indexOf('close:/web-dev-vault')).toBeLessThan(
      events.indexOf('open:/Other')
    );
    expect(
      created
        .filter((app) => app.close.mock.calls.length === 0)
        .map((a) => a.vault.root)
    ).toEqual(['/Other']);
  });

  it('persists the new Space only after it opened, and restores it on the next launch', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    const gate = deferred<void>();
    const first = render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    gates.set('/Other', gate);

    await act(async () => screen.getByText('switch-other').click());
    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything())
    );
    expect(
      JSON.parse(window.localStorage.getItem('clutter.spaces.v1')!).activePath
    ).toBe('/web-dev-vault');

    await act(async () => gate.resolve());
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Other')
    );
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

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('scan failed')
    );
    expect(screen.getByTestId('open-root')).toHaveTextContent('/web-dev-vault');
    expect(screen.queryByText(OPENING)).toBeNull();
    expect(first.close).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem('clutter.spaces.v1')!).activePath
    ).toBe('/web-dev-vault');
  });

  it('puts the previous Space back when the destination fails while opening, after the old one closed', async () => {
    seed(['/web-dev-vault', '/Other'], '/web-dev-vault');
    render(<AppShell />);
    await screen.findByText('/web-dev-vault');
    openFails.add('/Other');

    await act(async () => screen.getByText('switch-other').click());

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('watcher failed')
    );
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/web-dev-vault'
      )
    );
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
    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything())
    );
    // Back to the Space that is already showing.
    await act(async () => screen.getByText('switch-first').click());
    await act(async () => gate.resolve());

    await waitFor(() => {
      const other = created.find((app) => app.vault.root === '/Other');
      expect(other?.close).toHaveBeenCalled();
    });
    expect(
      created.find((app) => app.vault.root === '/Other')!.open
    ).not.toHaveBeenCalled();
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
    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith('/Other', expect.anything())
    );
    await act(async () => screen.getByText('switch-third').click());
    await waitFor(() =>
      expect(screen.getByTestId('open-root')).toHaveTextContent('/Third')
    );
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

  describe('a Space whose folder is missing', () => {
    async function chooseMissing() {
      seed(['/web-dev-vault', '/Missing', '/Third'], '/web-dev-vault');
      render(<AppShell />);
      await screen.findByText('/web-dev-vault');
      await act(async () => screen.getByText('switch-missing').click());
      await screen.findByText('Space not found');
    }

    it('opens a "Space not found" confirmation with Change location and Remove space, not an error toast, touching nothing', async () => {
      seed(['/web-dev-vault', '/Missing'], '/web-dev-vault');
      const before = SAVED();
      render(<AppShell />);
      await screen.findByText('/web-dev-vault');

      await act(async () => screen.getByText('switch-missing').click());

      expect(await screen.findByText('Space not found')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Clutter can’t find this space at its saved location. It may have been moved, renamed, or deleted'
        )
      ).toBeInTheDocument();
      // Which space it is, and where Clutter last had it.
      expect(document.querySelector('.missing-space__name')).toHaveTextContent(
        'Missing'
      );
      expect(document.querySelector('.missing-space__path')).toHaveTextContent(
        '/Missing'
      );
      expect(
        screen.getByRole('button', { name: 'Change location' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Remove space' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(created[0]!.close).not.toHaveBeenCalled();
      expect(SAVED()).toBe(before);
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/web-dev-vault'
      );
    });

    it('puts Change location on the left and Remove space (danger) on the right, like "Delete permanently?"', async () => {
      await chooseMissing();
      const change = screen.getByRole('button', { name: 'Change location' });
      const remove = screen.getByRole('button', { name: 'Remove space' });

      expect(
        change.compareDocumentPosition(remove) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(remove).toHaveClass('button--danger');
      expect(change).not.toHaveClass('button--danger');
    });

    it('the safe action takes the focus, so Enter never deletes', async () => {
      await chooseMissing();
      expect(
        screen.getByRole('button', { name: 'Change location' })
      ).toHaveFocus();
    });

    it('closing it (Escape) changes nothing', async () => {
      await chooseMissing();
      const before = SAVED();

      await act(
        async () => void fireEvent.keyDown(document, { key: 'Escape' })
      );

      await waitFor(() =>
        expect(screen.queryByText('Space not found')).toBeNull()
      );
      expect(SAVED()).toBe(before);
    });

    it('Remove space forgets only that entry, never touching disk, and it stays gone', async () => {
      await chooseMissing();

      await click('Remove space');

      await waitFor(() =>
        expect(screen.queryByText('Space not found')).toBeNull()
      );
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/web-dev-vault', '/Third'],
        activePath: '/web-dev-vault',
      });
      expect(tauri.mkdir).not.toHaveBeenCalled();
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/web-dev-vault'
      );
    });

    it('Change location: opens the chosen folder straight away — no settings dialog — replacing the entry in place', async () => {
      tauri.isTauri = true;
      await chooseMissing();
      const gate = deferred<void>();
      gates.set('/Users/me/Moved', gate);
      const before = SAVED();
      tauri.openDialog.mockResolvedValueOnce('/Users/me/Moved');

      await click('Change location');

      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith(
          '/Users/me/Moved',
          expect.anything()
        )
      );
      expect(document.getElementById('space-details-name')).toBeNull();
      expect(screen.queryByText('Space not found')).toBeNull();
      // Still opening: the open space and the saved list are as they were.
      expect(SAVED()).toBe(before);
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/web-dev-vault'
      );

      await act(async () => gate.resolve());
      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent(
          '/Users/me/Moved'
        )
      );
      expect(JSON.parse(SAVED()!)).toEqual({
        paths: ['/web-dev-vault', '/Users/me/Moved', '/Third'],
        activePath: '/Users/me/Moved',
      });
      expect(document.getElementById('space-details-name')).toBeNull();
    });

    it('Change location: a folder that fails to open leaves the missing entry as it was', async () => {
      tauri.isTauri = true;
      await chooseMissing();
      const before = SAVED();
      tauri.openDialog.mockResolvedValueOnce('/Users/me/Broken');

      await click('Change location');

      await waitFor(() =>
        expect(bootstrap).toHaveBeenCalledWith(
          '/Users/me/Broken',
          expect.anything()
        )
      );
      await waitFor(() =>
        expect(screen.getByRole('status')).toBeInTheDocument()
      );
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/web-dev-vault'
      );
      expect(SAVED()).toBe(before);
    });

    it('Change location: cancelling the picker changes nothing', async () => {
      tauri.isTauri = true;
      await chooseMissing();
      const before = SAVED();
      tauri.openDialog.mockResolvedValueOnce(null);

      await click('Change location');

      await waitFor(() =>
        expect(screen.queryByText('Space not found')).toBeNull()
      );
      expect(document.getElementById('space-details-name')).toBeNull();
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(SAVED()).toBe(before);
      expect(screen.getByTestId('open-root')).toHaveTextContent(
        '/web-dev-vault'
      );
    });

    it('a Space whose folder has come back opens normally instead', async () => {
      await chooseMissing();
      await act(
        async () => void fireEvent.keyDown(document, { key: 'Escape' })
      );
      await waitFor(() =>
        expect(screen.queryByText('Space not found')).toBeNull()
      );
      probeOverrides.set('/Missing', 'available');

      await act(async () => screen.getByText('switch-missing').click());

      await waitFor(() =>
        expect(screen.getByTestId('open-root')).toHaveTextContent('/Missing')
      );
      expect(screen.queryByText('Space not found')).toBeNull();
    });
  });
});
