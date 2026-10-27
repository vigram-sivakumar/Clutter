// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import type { SaveFailureStatus } from '@core/application/page/PageOperations';
import { AppStatusProvider, useAppStatus } from './AppStatus';

const fail = vi.fn();
vi.mock('@components/toast/ToastProvider', () => ({
  useToast: () => ({ fail, show: vi.fn(), dismiss: vi.fn() }),
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());

/** A stand-in Application with just what the status provider reads. */
function fakeApplication() {
  const failures = new Map<string, SaveFailureStatus>();
  const failureListeners = new Set<() => void>();
  const workspaceListeners = new Set<() => void>();
  const recoveryListeners = new Set<() => void>();
  const workspace = {
    activePageId: 'a' as string | null,
    subscribe: (listener: () => void) => {
      workspaceListeners.add(listener);
      return () => void workspaceListeners.delete(listener);
    },
  };
  let candidates: unknown[] = [];
  let version = 0;
  const pageOperations = {
    saveFailureSnapshot: () => JSON.stringify([...failures]),
    subscribeSaveFailures: (listener: () => void) => {
      failureListeners.add(listener);
      return () => void failureListeners.delete(listener);
    },
    failedSavePageIds: () => [...failures.keys()].sort(),
    saveFailureStatus: (id: string) => failures.get(id) ?? null,
    retrySave: vi.fn(async () => {}),
    open: vi.fn(async () => {}),
    getDraft: () => undefined,
  };
  const recoveryOperations = {
    get candidates() {
      return candidates;
    },
    snapshot: () => String(version),
    subscribe: (listener: () => void) => {
      recoveryListeners.add(listener);
      return () => void recoveryListeners.delete(listener);
    },
    restore: vi.fn(async () => {}),
    discard: vi.fn(async () => {}),
  };
  const application = {
    workspace,
    pageOperations,
    recoveryOperations,
    vault: { getPage: (id: string) => ({ name: `Note ${id}` }) },
  } as unknown as Application;

  return {
    application,
    pageOperations,
    recoveryOperations,
    setFailure: (id: string, status: SaveFailureStatus | null) => {
      if (status === null) failures.delete(id);
      else failures.set(id, status);
      act(() => failureListeners.forEach((listener) => listener()));
    },
    navigate: (id: string | null) => {
      workspace.activePageId = id;
      act(() => workspaceListeners.forEach((listener) => listener()));
    },
    setCandidates: (next: unknown[]) => {
      candidates = next;
      version += 1;
      act(() => recoveryListeners.forEach((listener) => listener()));
    },
  };
}

/** Stands in for the top bar that every view renders. */
function TopBar() {
  return <div data-testid="topbar">{useAppStatus()}</div>;
}

beforeEach(() => fail.mockClear());
afterEach(cleanup);

describe('application-wide status', () => {
  it('shows the open note’s failure with Retry, and the same state on every kind of view', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('a', 'needs-action');
    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent('Couldn’t save changes. Not trying again');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fake.pageOperations.retrySave).toHaveBeenCalledWith('a');

    // A collection, tag or favorites view has no active page: the failing note is still shown, with a way back.
    fake.navigate(null);
    expect(screen.getByTestId('save-failure-elsewhere-notice')).toHaveTextContent('Couldn’t save changes in “Note a”');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(fake.pageOperations.open).toHaveBeenCalledWith('a');
  });

  it('points at a failing note from a different note, and names how many when there are several', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('b', 'retry-scheduled');
    expect(screen.getByTestId('save-failure-elsewhere-notice')).toHaveTextContent('“Note b”');

    fake.setFailure('c', 'retry-scheduled');
    expect(screen.getByTestId('save-failure-elsewhere-notice')).toHaveTextContent('2 other notes');
  });

  it('raises one toast per failure streak and shows no success state', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('a', 'retry-scheduled');
    fake.setFailure('a', 'retrying');
    fake.setFailure('a', 'needs-action');
    expect(fail).toHaveBeenCalledTimes(1);

    fake.setFailure('a', null);
    expect(screen.getByTestId('topbar')).toBeEmptyDOMElement();
  });
});

describe('recovered work', () => {
  const recovered = (key: string, outcome = 'recoverable') => ({
    key,
    entry: { dir: 'd', name: key, record: {} },
    record: { label: `Note ${key}`, capturedAt: '2026-10-27T09:00:00.000Z' },
    outcome,
    changes: ['body'],
    reasons: [],
  });

  it('is offered once when found, and stays reachable from the top bar after "Decide later"', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    expect(screen.queryByTestId('recovery-notice')).toBeNull();

    fake.setCandidates([recovered('x'), recovered('y')]);

    expect(screen.getByRole('dialog', { name: 'Unsaved changes found' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes found' })).toBeNull();
    expect(screen.getByTestId('recovery-notice')).toHaveTextContent('2 notes have unsaved changes from last time');

    // Another view: still there. Review brings the dialog back.
    fake.navigate(null);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes found' })).toBeInTheDocument();
  });

  it('restoring calls the recovery operation for that record', async () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    fake.setCandidates([recovered('x')]);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore' })));

    expect(fake.recoveryOperations.restore).toHaveBeenCalledWith('x');
  });

  it('a failure notice and the recovery notice do not hide each other', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('a', 'retry-scheduled');
    fake.setCandidates([recovered('x')]);

    expect(screen.getByTestId('save-failure-notice')).toBeInTheDocument();
    expect(screen.getByTestId('recovery-notice')).toBeInTheDocument();
  });
});
