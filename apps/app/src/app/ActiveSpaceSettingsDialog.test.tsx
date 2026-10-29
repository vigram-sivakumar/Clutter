// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { isTauri } from '@tauri-apps/api/core';
import type { Application } from '@core/application/Application';
import { openVaultFileSystem } from '@core/vault/providers/openVaultFileSystem';
import { flushWorkspaceStateWrites } from '@core/vault/initialize/workspaceStateFile';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import {
  SettingsDialogStateProvider,
  useSharedSettingsDialogState,
  type SettingsDialogState,
} from '@features/settings/SettingsDialogState';
import { spacePageId } from '@features/settings/settings-sidebar/SettingsSidebar';
import { ActiveSpaceSettingsDialog } from './ActiveSpaceSettingsDialog';
import { SpacesContext, type SpacesApi } from './spaces/SpacesContext';

// The desktop runtime and its per-Space file system: "Reset settings to defaults" reaches every other Space through them.
vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn(() => false), invoke: vi.fn() }));
// The filesystem a Space's own folder is reached through (atomic saves, ADR-063): the test stands in at this seam.
vi.mock('@core/vault/providers/openVaultFileSystem', () => ({ openVaultFileSystem: vi.fn() }));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  // The Preferences page reads the system colour scheme.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(cleanup);

/**
 * An Application that is only a promise not to be touched once it is "closed": every property read after `close()`
 * throws, so a dialog that reached into a closed Application would fail loudly here.
 */
function fakeApplication() {
  let closed = false;
  const reads: string[] = [];
  const target = {
    vault: { subscribe: () => () => {} },
    membershipSelector: {},
    folderOperations: {},
    pageOperations: {},
    templateUsageStore: {},
    preferredTemplatesStore: {},
    spaceProfileStore: { subscribe: () => () => {} },
    defaultCoverPosition: 'side',
    autoDeleteArchived: false,
    resolveCoverImageForDisplay: (src: string) => src,
    resetSpaceSettings: vi.fn(async () => {}),
  };
  const application = new Proxy(target, {
    get(object, key) {
      reads.push(String(key));
      if (closed) throw new Error(`The closed Application was read: ${String(key)}`);
      return Reflect.get(object, key);
    },
  }) as unknown as Application;

  return { application, close: () => (closed = true), reads, resetSpaceSettings: target.resetSpaceSettings };
}

function spacesApi(activePath: string, names: Record<string, string>): SpacesApi {
  const paths = Object.keys(names);
  return {
    spaces: paths.map((path) => ({ path, name: names[path]! })),
    activePath,
    onSwitchSpace: vi.fn(),
    onRemoveSpace: vi.fn(),
    onRenameActiveSpace: vi.fn(async () => ({ status: 'renamed' as const, path: '/s/Journal', warnings: [] })),
  };
}

/** Opens Settings on a page, once, like the footer's menu does. */
function Opened({ page, children }: { page: ReturnType<typeof spacePageId>; children: ReactNode }) {
  const settings = useSharedSettingsDialogState();
  const setPageId = settings?.setPageId;
  const setOpen = settings?.setOpen;
  // Open once; the page follows `page`, as the shell moves the selection when the registry moves to a new path.
  useEffect(() => setOpen?.(true), [setOpen]);
  useEffect(() => setPageId?.(page), [setPageId, page]);
  return <>{children}</>;
}

function Page({
  spaces,
  application,
  busy,
  page = spacePageId('/s/Alpha'),
}: {
  spaces: SpacesApi;
  application: Application | null;
  busy?: boolean;
  page?: ReturnType<typeof spacePageId>;
}) {
  return (
    <SettingsDialogStateProvider>
      <SpacesContext.Provider value={spaces}>
        <Opened page={page}>
          <ActiveSpaceSettingsDialog application={application} busy={busy} />
        </Opened>
      </SpacesContext.Provider>
    </SettingsDialogStateProvider>
  );
}

const dialog = () => document.querySelector('.settings') as HTMLElement | null;
const nameField = () => screen.getByLabelText('Space name') as HTMLInputElement;

describe('ActiveSpaceSettingsDialog: the persistent Settings shell', () => {
  it('stays the same mounted dialog through a successful rename, and reconnects to the renamed Space', () => {
    const before = fakeApplication();
    const after = fakeApplication();
    const alpha = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
    const { rerender } = render(<Page spaces={alpha} application={before.application} />);

    const shell = dialog()!;
    expect(shell).not.toBeNull();
    expect(nameField()).toHaveValue('Alpha');
    expect(screen.getByRole('button', { name: 'Edit space name' })).toBeInTheDocument();

    // The rename has closed the Application: nothing is reading it, the shell is still there.
    act(() => void before.close());
    rerender(<Page spaces={alpha} application={null} busy />);

    expect(dialog()).toBe(shell);
    expect(within(shell).getByText('Preferences')).toBeInTheDocument(); // navigation stays
    expect(within(shell).getByText('Other')).toBeInTheDocument();
    expect(nameField()).toHaveValue('Alpha'); // the same, stable page — not blank, not reset
    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();

    // The renamed Space is open: the registry has the new path, the page has followed it, an Application is back.
    const journal = spacesApi('/s/Journal', { '/s/Journal': 'Journal', '/s/Other': 'Other' });
    after.reads.length = 0;
    rerender(<Page spaces={journal} application={after.application} page={spacePageId('/s/Journal')} />);

    expect(dialog()).toBe(shell); // never unmounted, never reopened
    expect(nameField()).toHaveValue('Journal'); // the renamed Space's page, with its new folder name
    expect(screen.getByRole('button', { name: 'Edit space name' })).toBeInTheDocument();
    expect(after.reads.length).toBeGreaterThan(0); // reconnected to the new Application
  });

  it('never reads the closed Application while there is none', () => {
    const closing = fakeApplication();
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha' });
    const { rerender } = render(<Page spaces={spaces} application={closing.application} />);
    closing.close();

    // Any read of `closing` from here on throws, which would fail this render.
    expect(() => rerender(<Page spaces={spaces} application={null} busy />)).not.toThrow();
    expect(() => rerender(<Page spaces={spaces} application={null} busy />)).not.toThrow();
  });

  it('disables the Space controls while busy, and nothing can be started from the dialog', () => {
    const live = fakeApplication();
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha' });
    const { rerender } = render(<Page spaces={spaces} application={live.application} />);
    expect(screen.getByRole('button', { name: 'Remove space' })).toBeEnabled();

    rerender(<Page spaces={spaces} application={live.application} busy />);

    expect(screen.getByRole('button', { name: 'Remove space' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit space name' })).toBeNull();
    expect(nameField()).toBeDisabled();
  });

  it('after a failed rename the original Space reopens: the same dialog, on the same page, usable again', () => {
    const original = fakeApplication();
    const reopened = fakeApplication();
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
    const { rerender } = render(<Page spaces={spaces} application={original.application} />);
    const shell = dialog()!;

    act(() => void original.close());
    rerender(<Page spaces={spaces} application={null} busy />);
    expect(dialog()).toBe(shell);

    rerender(<Page spaces={spaces} application={reopened.application} />);

    expect(dialog()).toBe(shell);
    expect(nameField()).toHaveValue('Alpha');
    expect(screen.getByRole('button', { name: 'Edit space name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove space' })).toBeEnabled();
  });

  it('keeps showing the other Spaces and a read-only page for one that is not open, even while busy', () => {
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
    render(<Page spaces={spaces} application={null} busy />);

    fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText('Other'));

    expect(nameField()).toHaveValue('Other');
    expect(nameField()).toHaveAttribute('readonly');
  });

  describe('the selected page follows a renamed Space (regression: the page was empty until the user navigated away and back)', () => {
    /**
     * The rename's handlers are made in one render and called long after it, when the user has moved on. This captures
     * the state exactly as such a handler would hold it: the snapshot from the FIRST render.
     */
    let stale: SettingsDialogState | null = null;
    function Capture() {
      const state = useSharedSettingsDialogState();
      stale ??= state;
      return null;
    }
    function Shell({ spaces, page }: { spaces: SpacesApi; page?: ReturnType<typeof spacePageId> }) {
      return (
        <SettingsDialogStateProvider>
          <SpacesContext.Provider value={spaces}>
            <Capture />
            <Opened page={page ?? spacePageId('/s/Alpha')}>
              <ActiveSpaceSettingsDialog application={fakeApplication().application} />
            </Opened>
          </SpacesContext.Provider>
        </SettingsDialogStateProvider>
      );
    }
    const openOtherSpacePage = () => {
      const sidebar = document.querySelector('.settings-sidebar') as HTMLElement;
      fireEvent.click(within(sidebar).getByText('Other'));
    };

    it('shows the renamed Space’s page straight away, from a handler that holds an older snapshot', () => {
      stale = null;
      const before = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
      const { rerender } = render(<Shell spaces={before} />);
      openOtherSpacePage();
      expect(nameField()).toHaveValue('Other');
      // The snapshot a handler made earlier holds is NOT the page the user is on now: this is why reading it was wrong.
      expect(stale!.pageId).not.toBe(spacePageId('/s/Other'));

      // The rename moves the registry entry; the page that was selected is keyed by the old path.
      const after = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Journal': 'Journal' });
      rerender(<Shell spaces={after} page={undefined} />);
      // Before the page follows: nothing selected and nothing to show, which is the bug as it looked.
      expect(screen.queryByLabelText('Space name')).toBeNull();
      expect((document.querySelector('.settings-sidebar') as HTMLElement).querySelectorAll('.entry-selected')).toHaveLength(0);
      act(() => stale!.replacePageId(spacePageId('/s/Other'), spacePageId('/s/Journal')));

      // No navigation away and back: the renamed Space's page is simply there, with its new name.
      expect(nameField()).toHaveValue('Journal');
      expect(document.querySelector('.settings-page__title')).toHaveTextContent('Space setting');
      // The same sidebar item is still the selected one — now under the Space's new name.
      const sidebar = document.querySelector('.settings-sidebar') as HTMLElement;
      const selected = sidebar.querySelectorAll('.entry-selected');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveTextContent('Journal');
    });

    it('leaves the selection alone if the user is on some other page by then', () => {
      stale = null;
      const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
      render(<Shell spaces={spaces} />);
      fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText('Preferences'));

      act(() => stale!.replacePageId(spacePageId('/s/Other'), spacePageId('/s/Journal')));

      expect(document.querySelector('.settings-page__title')).toHaveTextContent('Preferences');
    });

    it('a failed rename moves nothing: the page stays on the original Space, still rendered', () => {
      stale = null;
      const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
      const { rerender } = render(<Shell spaces={spaces} />);
      openOtherSpacePage();

      // Nothing replaced the page and the registry is unchanged.
      rerender(<Shell spaces={spaces} />);

      expect(nameField()).toHaveValue('Other');
    });
  });
});

describe('ActiveSpaceSettingsDialog: Reset settings to defaults reaches every Space', () => {
  const FILE = '.clutter/workspace.json';
  const withSettings = (id: string) =>
    JSON.stringify({
      space: { version: 1, id, defaultCoverPosition: 'above', autoDeleteArchived: true },
      preferredNoteTemplates: ['t-a'],
      collectionViewConfig: { 'view:notes': { layout: 'card' } },
    });
  const read = async (fileSystem: InMemoryVaultFileSystem, root: string) => JSON.parse(await fileSystem.readFile(`${root}/${FILE}`));

  function otherSpaces() {
    const files: Record<string, InMemoryVaultFileSystem> = {
      '/s/Other': new InMemoryVaultFileSystem({ [`/s/Other/${FILE}`]: withSettings('other') }),
      '/s/Third': new InMemoryVaultFileSystem({ [`/s/Third/${FILE}`]: withSettings('third') }),
    };
    vi.mocked(openVaultFileSystem).mockImplementation(((path: string) => files[path]) as never);
    return files;
  }

  const openPreferences = () =>
    fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText('Preferences'));
  const reset = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset…' }));
    fireEvent.click(within(document.querySelector('.confirmation') as HTMLElement).getByRole('button', { name: 'Reset settings' }));
  };

  /** The Reset button is disabled while a reset runs and enabled again once every step has finished. */
  const finished = async () => {
    expect(screen.getByRole('button', { name: 'Reset…' })).toBeDisabled();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Reset…' })).toBeEnabled());
  };

  afterEach(() => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(openVaultFileSystem).mockReset();
  });

  it('on the desktop: the open Space through its Application, every other Space through its own folder, never the open one twice', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const files = otherSpaces();
    const live = fakeApplication();
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other', '/s/Third': 'Third' });
    render(<Page spaces={spaces} application={live.application} />);
    openPreferences();

    reset();
    await finished();

    expect(live.resetSpaceSettings).toHaveBeenCalledOnce();
    await flushWorkspaceStateWrites();
    for (const [root, id] of [['/s/Other', 'other'], ['/s/Third', 'third']] as const) {
      const file = await read(files[root]!, root);
      expect(file.space, root).toEqual({ version: 1, id });
      expect(file, root).not.toHaveProperty('preferredNoteTemplates');
      expect(file.collectionViewConfig, root).toEqual({ 'view:notes': { layout: 'card' } });
    }
    // The open Space has an Application: its folder is never opened a second way.
    expect(vi.mocked(openVaultFileSystem).mock.calls.map(([path]) => path).sort()).toEqual(['/s/Other', '/s/Third']);
  });

  it('on the web, where there is one fixed Space: only its Application, and no folder is opened', async () => {
    const live = fakeApplication();
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha', '/s/Other': 'Other' });
    render(<Page spaces={spaces} application={live.application} />);
    openPreferences();

    reset();
    await finished();

    expect(live.resetSpaceSettings).toHaveBeenCalledOnce();
    expect(openVaultFileSystem).not.toHaveBeenCalled();
  });

  it('is not offered to run while there is no Application behind the dialog', () => {
    const spaces = spacesApi('/s/Alpha', { '/s/Alpha': 'Alpha' });
    render(<Page spaces={spaces} application={null} busy />);
    openPreferences();

    expect(screen.getByRole('button', { name: 'Reset…' })).toBeDisabled();
  });
});
