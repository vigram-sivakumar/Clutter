import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryJournal, type RecoverableState, type RecoverySource } from './RecoveryJournal';
import { MemoryRecoveryStorage } from './RecoveryStorage';
import { recordFileName } from './RecoveryRecord';

const KEY = 'space-1';
const SESSION = 'aaaaaaaa';

class FakeSource implements RecoverySource {
  readonly states = new Map<string, RecoverableState>();
  private readonly listeners = new Set<(pageId?: string) => void>();

  edit(pageId: string, markdown: string) {
    this.states.set(pageId, {
      pageId,
      kind: 'page',
      label: pageId,
      pagePath: `/vault/${pageId}.md`,
      body: { markdown, revision: 1 },
      title: null,
      description: null,
      vault: { body: 'saved body', title: pageId, description: '' },
      draft: null,
    });
    this.emit(pageId);
  }
  save(pageId: string) {
    this.states.delete(pageId);
    this.emit(pageId);
  }
  emit(pageId?: string) {
    this.listeners.forEach((listener) => listener(pageId));
  }
  recoverableState(pageId: string) {
    return this.states.get(pageId) ?? null;
  }
  unsavedPageIds() {
    return [...this.states.keys()];
  }
  subscribeUnsaved(listener: (pageId?: string) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const storage = new MemoryRecoveryStorage();
  const source = new FakeSource();
  const held = new Set<string>();
  const journal = new RecoveryJournal({
    storage,
    vaultKey: KEY,
    source,
    session: SESSION,
    holdRecord: (pageId) => held.has(pageId),
    now: () => new Date('2026-10-28T10:00:00.000Z'),
  });
  journal.start();
  const has = (pageId: string) => storage.files.has(`${KEY}/${recordFileName(pageId, SESSION)}`);

  return { storage, source, journal, held, has };
}

describe('RecoveryJournal: a saved revision that is not yet confirmed durable keeps its record', () => {
  it('releases a clean note’s record as usual when nothing is held', async () => {
    const { source, has } = setup();
    source.edit('a', 'typed');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(has('a')).toBe(true);

    source.save('a');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(has('a')).toBe(false);
  });

  it('keeps the record while the saved revision is unconfirmed, and releases it once it is', async () => {
    const { source, journal, held, has } = setup();
    source.edit('a', 'typed');
    await vi.advanceTimersByTimeAsync(5_000);
    held.add('a'); // the save was committed with unconfirmed durability

    source.save('a');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(has('a')).toBe(true);

    held.delete('a');
    journal.recheck('a');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(has('a')).toBe(false);
  });

  it('a hold on one note never keeps another note’s record', async () => {
    const { source, held, has } = setup();
    source.edit('a', 'typed a');
    source.edit('b', 'typed b');
    await vi.advanceTimersByTimeAsync(5_000);
    held.add('a');

    source.save('a');
    source.save('b');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(has('a')).toBe(true);
    expect(has('b')).toBe(false);
  });

  it('a newer edit while held is still recorded (the hold only stops the release of a clean note)', async () => {
    const { source, held, has, storage } = setup();
    source.edit('a', 'first');
    await vi.advanceTimersByTimeAsync(5_000);
    held.add('a');
    source.save('a');
    await vi.advanceTimersByTimeAsync(5_000);

    source.edit('a', 'second edit');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(has('a')).toBe(true);
    expect(storage.files.get(`${KEY}/${recordFileName('a', SESSION)}`)).toContain('second edit');
  });
});
