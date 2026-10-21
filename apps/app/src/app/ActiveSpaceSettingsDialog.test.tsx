// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import {
  SettingsDialogStateProvider,
  useSharedSettingsDialogState,
  type SettingsDialogState,
} from '@features/settings/SettingsDialogState';
import { spacePageId } from '@features/settings/settings-sidebar/SettingsSidebar';
import { ActiveSpaceSettingsDialog } from './ActiveSpaceSettingsDialog';
import { SpacesContext, type SpacesApi } from './spaces/SpacesContext';

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
  };
  const application = new Proxy(target, {
    get(object, key) {
      reads.push(String(key));
      if (closed) throw new Error(`The closed Application was read: ${String(key)}`);
      return Reflect.get(object, key);
    },
  }) as unknown as Application;

  return { application, close: () => (closed = true), reads };
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
      expect(document.querySelector('.settings-page__description')).toHaveTextContent('Space setting');
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
