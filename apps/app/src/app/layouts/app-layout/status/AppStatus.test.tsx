// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import type { SaveFailureKind, SaveFailureStatus } from '@core/application/page/PageOperations';
import { AtomicNotCommittedError } from '@core/vault/atomicWrite/atomicWriteErrors';
import { AppStatusProvider, useAppStatus } from './AppStatus';

const fail = vi.fn();
const show = vi.fn(() => 7);
const dismiss = vi.fn();
const toastApi = { fail, show, dismiss };
vi.mock('@components/toast/ToastProvider', () => ({
  useToast: () => toastApi,
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
  const kinds = new Map<string, SaveFailureKind>();
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
    saveFailureKind: (id: string) => (failures.has(id) ? (kinds.get(id) ?? 'failed') : null),
    saveUnsavedAsNewNote: vi.fn(async (_id: string): Promise<string | null> => 'copy'),
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
    setFailure: (id: string, status: SaveFailureStatus | null, kind?: SaveFailureKind) => {
      if (status === null) {
        failures.delete(id);
        kinds.delete(id);
      } else {
        failures.set(id, status);
        if (kind) kinds.set(id, kind);
      }
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

beforeEach(() => {
  fail.mockClear();
  show.mockClear();
  dismiss.mockClear();
});
afterEach(cleanup);

/** The text of the nth toast.show call, rendered. */
function toastHtml(call: number): string {
  const [input] = show.mock.calls[call] as unknown as [{ text: ReactNode }];
  return renderToStaticMarkup(<>{input.text}</>);
}
const toastText = (call: number) => toastHtml(call).replace(/<[^>]+>/g, '');

describe('application-wide status', () => {
  it('shows the open note’s failure with Retry, and the same state on every kind of view', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('a', 'needs-action');
    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent(/^Couldn’t save changes\s*Retry$/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fake.pageOperations.retrySave).toHaveBeenCalledWith('a');
    expect(show).not.toHaveBeenCalled();
  });

  it('a note that fails while another is open raises a persistent danger toast with Open', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('b', 'retry-scheduled');

    expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', persistent: true }));
    expect(toastText(0)).toBe('Couldn’t save changes in “Note b”');
    expect(toastHtml(0)).toContain('“<span class="toast__name" title="Note b">Note b</span>”');
    expect(toastHtml(0)).not.toContain('<strong');
    expect(screen.getByTestId('topbar')).toBeEmptyDOMElement();
    const [input] = show.mock.calls[0] as unknown as [{ action: { onAction: () => void } }];
    input.action.onAction();
    expect(fake.pageOperations.open).toHaveBeenCalledWith('b');
  });

  it('names how many when several notes fail, and shows nothing in the top bar for them', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('b', 'retry-scheduled');
    fake.setFailure('c', 'retry-scheduled');

    expect(toastText(show.mock.calls.length - 1)).toBe('Couldn’t save changes in 2 other notes');
  });

  it('switching notes does not dismiss the toast, even to the failing note; saving does', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    fake.setFailure('b', 'needs-action');
    expect(show).toHaveBeenCalledOnce();

    fake.navigate('b');
    expect(screen.getByTestId('save-failure-notice')).toBeInTheDocument();
    fake.navigate(null);
    fake.navigate('a');

    expect(dismiss).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledOnce();

    fake.setFailure('b', null);
    expect(dismiss).toHaveBeenCalledWith(7);
  });

  it('a failure in the open note is the top bar’s alone: no toast, until the user leaves that note', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('a', 'needs-action');
    expect(show).not.toHaveBeenCalled();

    fake.navigate('b');
    expect(toastText(0)).toBe('Couldn’t save changes in “Note a”');
  });

  it('raises no toast for a failure, and shows no success state', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setFailure('a', 'retry-scheduled');
    fake.setFailure('a', 'retrying');
    fake.setFailure('a', 'needs-action');
    expect(fail).not.toHaveBeenCalled();

    fake.setFailure('a', null);
    expect(screen.getByTestId('topbar')).toBeEmptyDOMElement();
  });
});

describe('recovered work', () => {
  const recovered = (key: string, outcome = 'recoverable') => ({
    key,
    entry: { dir: 'd', name: key, record: {} },
    record: { pageId: key, label: `Note ${key}`, capturedAt: '2026-10-27T09:00:00.000Z' },
    outcome,
    changes: ['body'],
    reasons: [],
  });

  it('is offered once when found; for another note it is a persistent toast, reachable again after the dialog is closed', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    expect(show).not.toHaveBeenCalled();

    fake.setCandidates([recovered('x'), recovered('y')]);

    expect(screen.getByRole('dialog', { name: 'Unsaved changes found' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes found' })).toBeNull();
    expect(screen.queryByTestId('recovery-notice')).toBeNull();
    expect(show).toHaveBeenLastCalledWith(expect.objectContaining({ persistent: true }));
    expect(toastText(show.mock.calls.length - 1)).toBe('Unsaved changes found in 2 other notes');

    // Another view: the toast is not dismissed; its Review action brings the dialog back.
    fake.navigate(null);
    expect(dismiss).not.toHaveBeenCalled();
    const [input] = show.mock.calls.at(-1) as unknown as [{ action: { onAction: () => void } }];
    act(() => input.action.onAction());
    expect(screen.getByRole('dialog', { name: 'Unsaved changes found' })).toBeInTheDocument();
  });

  it('recovered work for the open note is the top bar’s alone; a single other note is named in quotes', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );

    fake.setCandidates([recovered('a')]);
    expect(screen.getByTestId('recovery-notice')).toHaveTextContent('This note has unsaved changes from last time');
    expect(show).not.toHaveBeenCalled();

    fake.setCandidates([recovered('x')]);
    expect(screen.queryByTestId('recovery-notice')).toBeNull();
    expect(toastHtml(show.mock.calls.length - 1)).toContain('Unsaved changes found in “<span class="toast__name" title="Note x">Note x</span>”');
  });

  it('the toast goes away when the recovered work is restored or discarded', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    fake.setCandidates([recovered('x')]);

    fake.setCandidates([]);

    expect(dismiss).toHaveBeenCalledWith(7);
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
    fake.setCandidates([recovered('a')]);

    expect(screen.getByTestId('save-failure-notice')).toBeInTheDocument();
    expect(screen.getByTestId('recovery-notice')).toBeInTheDocument();
  });
});

describe('Save as new note: the persistent notice carries the outcome (ADR-063; "Choose the surface" in writing-principles)', () => {
  const notice = () => screen.getByTestId('save-failure-notice');
  const copyError = () => screen.queryByTestId('save-failure-copy-error');
  const clickSaveAsNewNote = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save as new note' }));
    await act(async () => {});
  };
  function setup() {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    fake.setFailure('a', 'needs-action', 'changed-on-disk');

    return fake;
  }

  it('a failed copy keeps the note’s notice, says why inside it, and raises no toast', async () => {
    const fake = setup();
    fake.pageOperations.saveUnsavedAsNewNote.mockRejectedValueOnce(new AtomicNotCommittedError('insufficientSpace', 'no room'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await clickSaveAsNewNote();

    expect(notice()).toHaveAttribute('data-kind', 'changed-on-disk');
    expect(notice()).toHaveTextContent('This note changed on disk');
    expect(copyError()).toHaveTextContent('Couldn’t save a copy: the disk is full');
    expect(screen.getByRole('button', { name: 'Save as new note' })).toBeEnabled();
    expect(show).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it('keeps the precise safe reason, and never shows an unclassified error’s own text', async () => {
    const fake = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    fake.pageOperations.saveUnsavedAsNewNote.mockRejectedValueOnce(new AtomicNotCommittedError('destinationExists', 'exists'));
    await clickSaveAsNewNote();
    expect(copyError()).toHaveTextContent('Couldn’t save a copy: a note with that name already exists');

    fake.pageOperations.saveUnsavedAsNewNote.mockRejectedValueOnce(new Error('EACCES: /Users/me/secret/path'));
    await clickSaveAsNewNote();
    expect(copyError()).toHaveTextContent(/^Couldn’t save a copy$/);
    expect(notice()).not.toHaveTextContent('secret');
  });

  it('the notice is there while the copy runs, the button cannot start a second copy, and a new attempt clears the old reason', async () => {
    const fake = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.pageOperations.saveUnsavedAsNewNote.mockRejectedValueOnce(new AtomicNotCommittedError('insufficientSpace', 'no room'));
    await clickSaveAsNewNote();
    expect(copyError()).not.toBeNull();

    let finish!: (id: string | null) => void;
    fake.pageOperations.saveUnsavedAsNewNote.mockImplementationOnce(() => new Promise<string | null>((resolve) => (finish = resolve)));
    await clickSaveAsNewNote();

    expect(notice()).toHaveTextContent('This note changed on disk');
    expect(copyError()).toBeNull();
    expect(screen.getByRole('button', { name: 'Save as new note' })).toBeDisabled();
    expect(fake.pageOperations.saveUnsavedAsNewNote).toHaveBeenCalledTimes(2);

    await act(async () => finish('copy'));
    expect(notice()).toBeInTheDocument(); // the note leaves its failure only when its own state says so
  });

  it('success: no failure message and no toast; the notice goes when the note’s failure is resolved, not before', async () => {
    const fake = setup();

    await clickSaveAsNewNote();
    expect(copyError()).toBeNull();
    expect(show).not.toHaveBeenCalled();
    expect(notice()).toBeInTheDocument();

    fake.setFailure('a', null);
    expect(screen.queryByTestId('save-failure-notice')).toBeNull();
  });

  it('belongs to its note: another note never shows it, and it returns with the note until the failure is resolved', async () => {
    const fake = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.pageOperations.saveUnsavedAsNewNote.mockRejectedValueOnce(new AtomicNotCommittedError('insufficientSpace', 'no room'));
    await clickSaveAsNewNote();
    expect(copyError()).not.toBeNull();

    fake.setFailure('b', 'needs-action', 'changed-on-disk');
    fake.navigate('b');
    expect(copyError()).toBeNull();

    fake.navigate('a');
    expect(copyError()).toHaveTextContent('Couldn’t save a copy: the disk is full');

    fake.setFailure('a', null);
    fake.setFailure('a', 'needs-action', 'changed-on-disk');
    expect(copyError()).toBeNull(); // a new failure of the note starts without the old attempt’s reason
  });

  it('offers neither Retry nor Save as new note for an unsupported location: it is not a transient error', () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    fake.setFailure('a', 'needs-action', 'unsupported-location');

    expect(notice()).toHaveTextContent('Can’t save safely to this location');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save as new note' })).toBeNull();
  });

  it('a failed Retry on an ordinary failure leaves the notice in place', async () => {
    const fake = fakeApplication();
    render(
      <AppStatusProvider application={fake.application}>
        <TopBar />
      </AppStatusProvider>
    );
    fake.setFailure('a', 'needs-action');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {});
    fake.setFailure('a', 'needs-action'); // the retry failed again: the same streak continues

    expect(notice()).toHaveTextContent('Couldn’t save changes');
    expect(show).not.toHaveBeenCalled();
  });
});
