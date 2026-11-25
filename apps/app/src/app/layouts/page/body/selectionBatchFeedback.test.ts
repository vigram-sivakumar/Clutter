import { describe, expect, it, vi } from 'vitest';
import type { ToastApi } from '@components/toast/ToastProvider';
import { runSelectionBatch, type SelectionBatchItem } from './selectionBatchFeedback';

const notifier = () => ({ show: vi.fn(() => 1), fail: vi.fn(() => 1), dismiss: vi.fn() }) satisfies ToastApi;
const item = (ok = true) => ({ run: vi.fn<SelectionBatchItem['run']>().mockResolvedValue(ok) });

describe('selection batch feedback', () => {
  it('shows one archive toast with an Undo that restores all completed items', async () => {
    const toast = notifier();
    const items = Array.from({ length: 12 }, () => item());
    await runSelectionBatch(toast, 'archive', items);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.fail).not.toHaveBeenCalled();
    const input = (toast.show.mock.calls as unknown[][])[0]![0] as Parameters<ToastApi['show']>[0];
    expect(input.text).toBe('12 items archived');
    input.action!.onAction();
    await vi.waitFor(() => expect(items.every((entry) => entry.run.mock.calls.some(([action]) => action === 'restore'))).toBe(true));
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it('reports partial archive failure once and only undoes successful items', async () => {
    const toast = notifier();
    const good = item();
    const bad = item(false);
    await runSelectionBatch(toast, 'archive', [good, bad]);
    expect(toast.show).toHaveBeenCalledTimes(1);
    const input = (toast.show.mock.calls as unknown[][])[0]![0] as Parameters<ToastApi['show']>[0];
    expect(input.text).toBe('Couldn’t archive 1 of 2 items');
    input.action!.onAction();
    await vi.waitFor(() => expect(good.run).toHaveBeenCalledWith('restore', undefined));
    expect(bad.run).toHaveBeenCalledTimes(1);
  });

  it('attempts every item, consolidates failures and keeps visible successes quiet', async () => {
    const toast = notifier();
    const bad = item();
    bad.run.mockRejectedValueOnce(new Error('denied'));
    const good = item();
    await runSelectionBatch(toast, 'move', [bad, good], 'folder');
    expect(good.run).toHaveBeenCalledWith('move', 'folder');
    expect(toast.fail).toHaveBeenCalledTimes(1);
    expect(toast.fail).toHaveBeenCalledWith('Couldn’t move 1 of 2 items', expect.any(Array));
    await runSelectionBatch(toast, 'delete', [good]);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('does not report a restore needing a decision as successful', async () => {
    const toast = notifier();
    await runSelectionBatch(toast, 'restore', [item(false), item()]);
    expect(toast.fail).toHaveBeenCalledWith('Couldn’t restore 1 of 2 items. Restore the remaining items individually from Archive', undefined);
    expect(toast.show).not.toHaveBeenCalled();
  });
});
