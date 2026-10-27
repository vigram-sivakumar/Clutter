// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RecoveryCandidate } from '@core/application/recovery/RecoveryOperations';
import { RecoveryDialog } from './RecoveryDialog';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

function candidate(overrides: Partial<RecoveryCandidate> & { key: string }): RecoveryCandidate {
  return {
    entry: { dir: 'd', name: overrides.key, record: {} as never },
    record: { label: 'Launch plan', capturedAt: '2026-10-27T09:00:00.000Z' } as never,
    outcome: 'recoverable',
    changes: ['body'],
    reasons: [],
    ...overrides,
  };
}

describe('RecoveryDialog', () => {
  it('names each note, what was unsaved, and offers Restore or Discard', () => {
    render(
      <RecoveryDialog
        open
        candidates={[candidate({ key: 'a', changes: ['body', 'title'] })]}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Unsaved changes found')).toBeInTheDocument();
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.getByText(/Unsaved text and title/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('restores and discards the record it was clicked on, and only that one', async () => {
    const onRestore = vi.fn(async () => {});
    const onDiscard = vi.fn(async () => {});
    render(
      <RecoveryDialog
        open
        candidates={[candidate({ key: 'a' }), candidate({ key: 'b' })]}
        onRestore={onRestore}
        onDiscard={onDiscard}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[1]!);
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('b'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Discard' })[0]!);
    await waitFor(() => expect(onDiscard).toHaveBeenCalledWith('a'));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('explains a conflict and offers only a new note, never an overwrite', () => {
    render(
      <RecoveryDialog
        open
        candidates={[
          candidate({
            key: 'a',
            outcome: 'conflict',
            reasons: ['The text of this note changed in your vault after these edits were captured'],
          }),
        ]}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/changed in your vault after these edits were captured/)).toBeInTheDocument();
    expect(screen.getByText(/can only be saved as a new note, so nothing is overwritten/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as new note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('words the action for a draft that was never saved', () => {
    render(
      <RecoveryDialog
        open
        candidates={[candidate({ key: 'a', outcome: 'draft' })]}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Restore note' })).toBeInTheDocument();
  });

  it('shows an error and keeps the record when restoring fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RecoveryDialog
        open
        candidates={[candidate({ key: 'a' })]}
        onRestore={vi.fn(async () => {
          throw new Error('nope');
        })}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The recovery copy was kept');
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
  });

  it('Decide later closes the dialog without touching any record', () => {
    const onClose = vi.fn();
    const onDiscard = vi.fn();
    render(<RecoveryDialog open candidates={[candidate({ key: 'a' })]} onRestore={vi.fn()} onDiscard={onDiscard} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
