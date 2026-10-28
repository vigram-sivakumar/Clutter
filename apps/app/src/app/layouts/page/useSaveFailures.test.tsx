// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SaveFailureStatus } from '@core/application/page/PageOperations';
import { useSaveFailures, type SaveFailureSource } from './useSaveFailures';
import { SaveFailureNotice } from './topbar/SaveFailureNotice';

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

/** The shape PageHost uses: the open note's own notice; other notes' failures are not the top bar's business. */
function TopBarProbe({ source, activeId }: { source: FakeSource; activeId: string }) {
  const failures = useSaveFailures(source);
  const status = failures.statusOf(activeId);
  if (status) return <SaveFailureNotice status={status} onRetry={onRetry} />;
  return <span>no notice</span>;
}

beforeEach(() => {
  fail.mockClear();
  onRetry.mockClear();
});
afterEach(cleanup);

describe('the save-failure notice', () => {
  it('shows nothing until a save fails, then one plain message with Retry', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);
    expect(screen.getByText('no notice')).toBeInTheDocument();

    source.set('a', 'retry-scheduled');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent(/^Couldn’t save changes\s*Retry$/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('keeps the same message once the automatic retries are used up', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('a', 'needs-action');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent(/^Couldn’t save changes\s*Retry$/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('guards Retry while a retry is already running, so it cannot start an overlapping save', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('a', 'retrying');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent(/^Couldn’t save changes\s*Retry$/);
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
});

describe('the save-failure toast', () => {
  it('is never raised: the top bar notice is the only signal, through every retry and every failing note', () => {
    const source = new FakeSource();
    render(<TopBarProbe source={source} activeId="a" />);

    source.set('a', 'retry-scheduled');
    source.set('a', 'retrying');
    source.set('a', 'needs-action');
    source.set('a', null);
    source.set('a', 'retry-scheduled');
    source.set('b', 'needs-action');

    expect(fail).not.toHaveBeenCalled();
  });

  it('shows the same text in every internal state', () => {
    const texts = (['retrying', 'retry-scheduled', 'needs-action'] as const).map((status) => {
      const view = render(<SaveFailureNotice status={status} onRetry={onRetry} />);
      const text = view.getByTestId('save-failure-notice').textContent;
      view.unmount();
      return text;
    });

    expect(new Set(texts).size).toBe(1);
  });
});
