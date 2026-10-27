// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SaveFailureStatus } from '@core/application/page/PageOperations';
import { useSaveFailures, type SaveFailureSource } from './useSaveFailures';
import { SaveFailureElsewhereNotice, SaveFailureNotice } from './topbar/SaveFailureNotice';

const fail = vi.fn();
vi.mock('@components/toast/ToastProvider', () => ({
  useToast: () => ({ fail, show: vi.fn(), dismiss: vi.fn() }),
}));

/** A stand-in for the part of PageOperations the hook reads. */
class FakeSource implements SaveFailureSource {
  private readonly statuses = new Map<string, SaveFailureStatus>();
  private readonly listeners = new Set<() => void>();
  private snapshot = '';

  set(pageId: string, status: SaveFailureStatus | null) {
    if (status === null) this.statuses.delete(pageId);
    else this.statuses.set(pageId, status);
    this.snapshot = JSON.stringify([...this.statuses]);
    act(() => this.listeners.forEach((listener) => listener()));
  }
  saveFailureSnapshot() {
    return this.snapshot;
  }
  subscribeSaveFailures(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  failedSavePageIds() {
    return [...this.statuses.keys()].sort();
  }
  saveFailureStatus(pageId: string) {
    return this.statuses.get(pageId) ?? null;
  }
}

const onRetry = vi.fn();

/** The shape PageHost uses: the open note's own notice, or a pointer to another failing note. */
function TopBarProbe({ source, activeId }: { source: FakeSource; activeId: string }) {
  const failures = useSaveFailures(source);
  const status = failures.statusOf(activeId);
  const others = failures.failedIds.filter((id) => id !== activeId);
  if (status) return <SaveFailureNotice status={status} onRetry={onRetry} />;
  if (others.length > 0) return <SaveFailureElsewhereNotice label={`“${others[0]}”`} onOpen={onRetry} />;
  return <span>no notice</span>;
}

beforeEach(() => {
  fail.mockClear();
  onRetry.mockClear();
});
afterEach(cleanup);

describe('the save-failure notice', () => {
  it('shows nothing until a save fails, then says whether Clutter will try again', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);
    expect(screen.getByText('no notice')).toBeInTheDocument();

    source.set('a', 'retry-scheduled');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent('Couldn’t save changes. Will try again');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('is truthful once the automatic retries are used up: it says Clutter is not trying again', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('a', 'needs-action');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent('Couldn’t save changes. Not trying again');
    expect(screen.getByTestId('save-failure-notice')).not.toHaveTextContent('Will try again');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('guards Retry while a retry is already running, so it cannot start an overlapping save', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('a', 'retrying');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent('Trying again…');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('Retry calls the retry handler', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);
    source.set('a', 'needs-action');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('clears only when the page leaves the failure state (a confirmed save)', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);
    source.set('a', 'retry-scheduled');
    source.set('a', 'retrying');
    expect(screen.getByTestId('save-failure-notice')).toBeInTheDocument();

    source.set('a', null);

    expect(screen.queryByTestId('save-failure-notice')).toBeNull();
    expect(screen.getByText('no notice')).toBeInTheDocument();
  });

  it('points at another note whose save failed, with a way to open it', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('b', 'needs-action');

    expect(screen.getByTestId('save-failure-elsewhere-notice')).toHaveTextContent('Couldn’t save changes in “b”');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('the save-failure toast', () => {
  it('fires once per failure streak, however many retries fail', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('a', 'retry-scheduled');
    source.set('a', 'retrying');
    source.set('a', 'retry-scheduled');
    source.set('a', 'needs-action');

    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('fires again for a new failure after a confirmed save, and once for failures in several notes at the same time', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);
    source.set('a', 'retry-scheduled');
    source.set('a', null);

    source.set('a', 'retry-scheduled');
    expect(fail).toHaveBeenCalledTimes(2);

    source.set('b', 'needs-action');
    expect(fail).toHaveBeenCalledTimes(3);
  });
});
