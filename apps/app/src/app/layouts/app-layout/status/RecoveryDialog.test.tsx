// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RecoveryCandidate } from '@core/application/recovery/RecoveryOperations';
import { formatDateTimeDisplay } from '@shared/helpers/time/dateDisplay';
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
    duplicates: [],
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
    expect(screen.getByText(formatDateTimeDisplay(new Date('2026-10-27T09:00:00.000Z')))).toBeInTheDocument();
    expect(screen.queryByText(/Unsaved text/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('shows one note at a time, steps through them with the footer arrows, and acts on the one shown', async () => {
    const onRestore = vi.fn(async () => {});
    const onDiscard = vi.fn(async () => {});
    const a = candidate({ key: 'a' });
    const b = candidate({ key: 'b', record: { label: 'Weekly review', capturedAt: '2026-10-27T09:00:00.000Z' } as never });
    const c = candidate({ key: 'c', record: { label: 'Reading list', capturedAt: '2026-10-27T09:00:00.000Z' } as never });
    const dialog = (list: RecoveryCandidate[]) => (
      <RecoveryDialog open candidates={list} onRestore={onRestore} onDiscard={onDiscard} onClose={vi.fn()} />
    );
    const { rerender } = render(dialog([a, b, c]));

    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.queryByText('Weekly review')).toBeNull();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous note' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next note' }));
    expect(screen.getByText('Reading list')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next note' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('c'));

    // Resolved: the count drops and the position is kept (clamped at the end), so 3/3 becomes 2/2.
    rerender(dialog([a, b]));
    expect(screen.getByText('Weekly review')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove recovery copy' }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledWith('b'));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('resolving the first of four leaves 1/3, whether it was restored or discarded', () => {
    const list = ['a', 'b', 'c', 'd'].map((key) => candidate({ key, record: { label: `Note ${key}`, capturedAt: '2026-10-27T09:00:00.000Z' } as never }));
    const dialog = (items: RecoveryCandidate[]) => (
      <RecoveryDialog open candidates={items} onRestore={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />
    );
    const { rerender } = render(dialog(list));
    expect(screen.getByText('1/4')).toBeInTheDocument();

    rerender(dialog(list.slice(1)));

    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('Note b')).toBeInTheDocument();
  });

  it('shows no arrows or count for a single note', () => {
    render(<RecoveryDialog open candidates={[candidate({ key: 'a' })]} onRestore={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Next note' })).toBeNull();
    expect(screen.queryByText(/\d\/\d/)).toBeNull();
  });

  it('puts the actions in the dialog footer, not in the entry, and has no Decide later button', () => {
    render(
      <RecoveryDialog open candidates={[candidate({ key: 'a' })]} onRestore={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />
    );

    const footer = document.querySelector('.recovery-dialog__footer')!;
    expect(footer.querySelector('button')).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(document.querySelector('.settings-entry button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decide later' })).toBeNull();
  });

  it('asks before discarding, names the note, and cancelling keeps the record untouched', async () => {
    const onDiscard = vi.fn(async () => {});
    render(
      <RecoveryDialog
        open
        candidates={[candidate({ key: 'a' })]}
        onRestore={vi.fn(async () => {})}
        onDiscard={onDiscard}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Permanently remove this recovery copy/);
    expect(screen.getByRole('alert')).toHaveTextContent(/can’t be restored afterwards/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('does not show per-outcome explanations: a conflict card has the title and date only', () => {
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

    expect(screen.queryByText(/changed in your vault/)).toBeNull();
    expect(screen.queryByText(/nothing is overwritten/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('always says Restore, whatever the outcome', () => {
    const { rerender } = render(
      <RecoveryDialog open candidates={[candidate({ key: 'a' })]} onRestore={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />
    );
    for (const outcome of ['recoverable', 'conflict', 'missing-note', 'draft'] as const) {
      rerender(
        <RecoveryDialog open candidates={[candidate({ key: 'a', outcome })]} onRestore={vi.fn()} onDiscard={vi.fn()} onClose={vi.fn()} />
      );
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /new note/ })).toBeNull();
      expect(screen.queryByText('Deleted')).toBeNull();
    }
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

  it('has a close button that dismisses the dialog and touches no record', () => {
    const onClose = vi.fn();
    const onDiscard = vi.fn();
    const onRestore = vi.fn();
    render(<RecoveryDialog open candidates={[candidate({ key: 'a' })]} onRestore={onRestore} onDiscard={onDiscard} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('closing the dialog (Escape) leaves every record untouched', () => {
    const onClose = vi.fn();
    const onDiscard = vi.fn();
    render(<RecoveryDialog open candidates={[candidate({ key: 'a' })]} onRestore={vi.fn()} onDiscard={onDiscard} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
