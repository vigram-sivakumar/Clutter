import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { DurabilityTracker } from './DurabilityTracker';

const NOTE = '/v/note.md';

afterEach(() => vi.useRealTimers());

function setup(delaysMs = [10, 20]) {
  const disk = new InMemoryVaultFileSystem({ [NOTE]: 'N' });
  const writer = new InMemoryAtomicVaultWriter(disk);
  const changes: string[] = [];
  const tracker = new DurabilityTracker(writer, { delaysMs, onChange: (path) => changes.push(path) });

  return { disk, writer, tracker, changes };
}

describe('DurabilityTracker', () => {
  it('keeps a revision pending until the flush-only confirmation succeeds, then releases it and says so', async () => {
    vi.useFakeTimers();
    const { writer, tracker, changes } = setup();
    writer.injectDurabilityFailure(); // the first confirmation is still unconfirmed

    tracker.register(NOTE, 'N');
    expect(tracker.hasPending(NOTE)).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    expect(tracker.hasPending(NOTE)).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(tracker.hasPending(NOTE)).toBe(false);
    expect(changes).toEqual([NOTE, NOTE]);
    expect(writer.calls.filter((call) => call.startsWith('confirm:'))).toHaveLength(2);
  });

  it('never rewrites the file: confirmation only asks the writer to flush', async () => {
    vi.useFakeTimers();
    const { writer, tracker } = setup();

    tracker.register(NOTE, 'N');
    await vi.advanceTimersByTimeAsync(10);

    expect(writer.calls.some((call) => call.startsWith('write:'))).toBe(false);
  });

  it('confirming an older revision does not release a newer revision of the same path', async () => {
    vi.useFakeTimers();
    const { disk, tracker } = setup();
    tracker.register(NOTE, 'N');
    await disk.writeFile(NOTE, 'N+1');
    tracker.register(NOTE, 'N+1');

    await vi.advanceTimersByTimeAsync(10);

    // N answered "superseded" (the file holds N+1) and was retired; N+1 was confirmed on its own.
    expect(tracker.hasPending(NOTE)).toBe(false);
  });

  it('a superseded answer retires only that revision, not a newer one still unconfirmed', async () => {
    vi.useFakeTimers();
    const { disk, writer, tracker } = setup([10]);
    tracker.register(NOTE, 'N');
    await disk.writeFile(NOTE, 'N+1');
    tracker.register(NOTE, 'N+1');
    writer.injectDurabilityFailure(); // N's confirmation is skipped ("superseded" consumes no fault); N+1 stays unconfirmed

    await vi.advanceTimersByTimeAsync(10);

    expect(tracker.hasPending(NOTE)).toBe(true);
  });

  it('gives up retrying after its budget and keeps the entry (so the recovery record stays)', async () => {
    vi.useFakeTimers();
    const { writer, tracker } = setup([10, 10]);
    for (let index = 0; index < 5; index += 1) writer.injectDurabilityFailure();
    tracker.register(NOTE, 'N');

    await vi.advanceTimersByTimeAsync(1000);

    expect(tracker.hasPending(NOTE)).toBe(true);
    expect(writer.calls.filter((call) => call.startsWith('confirm:'))).toHaveLength(2);
  });

  it('a confirmation that throws counts as unconfirmed and does not break the tracker', async () => {
    vi.useFakeTimers();
    const { writer, tracker } = setup([10, 10]);
    vi.spyOn(writer, 'confirmDurability').mockRejectedValueOnce(new Error('ipc'));

    tracker.register(NOTE, 'N');
    await vi.advanceTimersByTimeAsync(10);
    expect(tracker.hasPending(NOTE)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);

    expect(tracker.hasPending(NOTE)).toBe(false);
  });

  it('settleOnce makes one bounded attempt without waiting for the backoff', async () => {
    const { tracker } = setup([60_000]);
    tracker.register(NOTE, 'N');

    await tracker.settleOnce();

    expect(tracker.hasPending(NOTE)).toBe(false);
    tracker.dispose();
  });
});
