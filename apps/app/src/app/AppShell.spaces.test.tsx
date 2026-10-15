// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrap = vi.fn();
vi.mock('../core/application/Application', () => ({
  Application: { bootstrap: (...args: unknown[]) => bootstrap(...args) },
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));
vi.mock('../core/vault/providers/probeSpaceFolder', () => ({
  probeSpaceFolder: vi.fn(async (path: string) => !path.includes('Missing')),
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
        </div>
      );
    },
  };
});

import { AppShell } from './AppShell';

interface FakeApplication {
  vault: { root: string };
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
  const app: FakeApplication = {
    vault: { root },
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

beforeEach(() => {
  created = [];
  events = [];
  gates = new Map();
  openFails = new Set();
  window.localStorage.clear();
  bootstrap.mockImplementation(async (root: string) => {
    events.push(`bootstrap:${root}`);
    await gates.get(root)?.promise;
    if (root === '/Broken') throw new Error('scan failed');
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
