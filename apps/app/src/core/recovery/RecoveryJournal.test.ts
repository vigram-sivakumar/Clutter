import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECOVERY_DEBOUNCE_MS,
  RECOVERY_MAX_RETRIES,
  RECOVERY_MAX_WAIT_MS,
  RECOVERY_RETRY_MS,
  RecoveryJournal,
  type RecoverableState,
  type RecoverySource,
} from './RecoveryJournal';
import { MemoryRecoveryStorage, type RecoveryStorage } from './RecoveryStorage';
import { newSessionId, parseRecord, recordFileName, serializeRecord, sessionOfFileName, type RecoveryRecord } from './RecoveryRecord';

const KEY = 'space-1';
const SESSION = 'aaaaaaaa';

class FakeSource implements RecoverySource {
  readonly states = new Map<string, RecoverableState>();
  private readonly listeners = new Set<(pageId?: string) => void>();

  set(state: Partial<RecoverableState> & { pageId: string }) {
    const previous = this.states.get(state.pageId);
    this.states.set(state.pageId, {
      kind: 'page',
      label: state.pageId,
      pagePath: `/vault/${state.pageId}.md`,
      body: null,
      title: null,
      description: null,
      vault: { body: 'saved body', title: state.pageId, description: '' },
      draft: null,
      ...previous,
      ...state,
    });
    this.emit(state.pageId);
  }
  clean(pageId: string) {
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

function setup(overrides: { storage?: RecoveryStorage } = {}) {
  const storage = new MemoryRecoveryStorage();
  const source = new FakeSource();
  const onWriteError = vi.fn();
  const journal = new RecoveryJournal({
    storage: overrides.storage ?? storage,
    vaultKey: KEY,
    source,
    session: SESSION,
    onWriteError,
    now: () => new Date('2026-10-28T10:00:00.000Z'),
  });
  journal.start();
  return { storage, source, journal, onWriteError };
}

const recordOf = (storage: MemoryRecoveryStorage, pageId: string) => {
  const text = storage.files.get(`${KEY}/${recordFileName(pageId, SESSION)}`);
  return text === undefined ? null : parseRecord(text);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RecoveryJournal: snapshots', () => {
  it('writes a record for a note with an unsaved body, after a short quiet period and not before', async () => {
    const { storage, source } = setup();

    source.set({ pageId: 'a', body: { markdown: 'unsaved text', revision: 3 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS - 1);
    expect(recordOf(storage, 'a')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);

    const record = recordOf(storage, 'a')!;
    expect(record.body).toEqual({ markdown: 'unsaved text', revision: 3 });
    expect(record.vaultKey).toBe(KEY);
    expect(record.base.body).toMatch(/^f1-/);
    expect(record.capturedAt).toBe('2026-10-28T10:00:00.000Z');
  });

  it('includes an unsaved title and description', async () => {
    const { storage, source } = setup();

    source.set({ pageId: 'a', title: 'New title', description: 'New description' });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    const record = recordOf(storage, 'a')!;
    expect(record.body).toBeNull();
    expect(record.title).toBe('New title');
    expect(record.description).toBe('New description');
    expect(record.base).toMatchObject({ title: 'a', description: '' });
  });

  it('records a new draft that has no file in the vault', async () => {
    const { storage, source } = setup();

    source.set({
      pageId: 'draft-1',
      kind: 'draft',
      pagePath: null,
      vault: null,
      body: { markdown: '# A new idea', revision: 1 },
      draft: { folderId: 'folder-1', type: 'note', title: 'A new idea' },
    });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    const record = recordOf(storage, 'draft-1')!;
    expect(record.kind).toBe('draft');
    expect(record.pagePath).toBeNull();
    expect(record.base).toEqual({ body: null, title: null, description: null });
    expect(record.draft).toMatchObject({ folderId: 'folder-1', title: 'A new idea' });
  });

  it('keeps several dirty notes independent', async () => {
    const { storage, source } = setup();

    source.set({ pageId: 'a', body: { markdown: 'A text', revision: 1 } });
    source.set({ pageId: 'b', body: { markdown: 'B text', revision: 7 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(recordOf(storage, 'a')!.body!.markdown).toBe('A text');
    expect(recordOf(storage, 'b')!.body!.markdown).toBe('B text');

    source.clean('a');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(recordOf(storage, 'a')).toBeNull();
    expect(recordOf(storage, 'b')).not.toBeNull();
  });

  it('does not write per keystroke: a burst of edits is one snapshot', async () => {
    const { storage, source } = setup();
    const writes = vi.spyOn(storage, 'writeAtomic');

    for (let revision = 1; revision <= 20; revision += 1) {
      source.set({ pageId: 'a', body: { markdown: `text ${revision}`, revision } });
      await vi.advanceTimersByTimeAsync(40);
    }
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(writes).toHaveBeenCalledTimes(1);
    expect(recordOf(storage, 'a')!.body!.markdown).toBe('text 20');
  });

  it('bounds the recovery window: continuous typing is still snapshotted within the max wait', async () => {
    const { storage, source } = setup();

    for (let elapsed = 0; elapsed < RECOVERY_MAX_WAIT_MS; elapsed += 500) {
      source.set({ pageId: 'a', body: { markdown: `typing ${elapsed}`, revision: elapsed } });
      await vi.advanceTimersByTimeAsync(500);
    }

    expect(recordOf(storage, 'a')).not.toBeNull();
  });

  it('a delayed older snapshot cannot replace a newer one: writes are decided when they run, one at a time', async () => {
    const storage = new MemoryRecoveryStorage();
    let releaseFirst!: () => void;
    let held = false;
    const slow: RecoveryStorage = {
      list: (dir) => storage.list(dir),
      read: (dir, name) => storage.read(dir, name),
      remove: (dir, name) => storage.remove(dir, name),
      writeAtomic: async (dir, name, text) => {
        if (!held) {
          held = true;
          await new Promise<void>((resolve) => (releaseFirst = resolve));
        }
        await storage.writeAtomic(dir, name, text);
      },
    };
    const { source } = setup({ storage: slow });

    source.set({ pageId: 'a', body: { markdown: 'older', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS); // the first write starts and is held
    source.set({ pageId: 'a', body: { markdown: 'newer', revision: 2 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS); // the second is queued behind it

    releaseFirst();
    await vi.advanceTimersByTimeAsync(10);

    expect(recordOf(storage, 'a')!.body).toEqual({ markdown: 'newer', revision: 2 });
  });
});

describe('RecoveryJournal: cleanup', () => {
  it('removes the record only once the note has nothing unsaved', async () => {
    const { storage, source } = setup();
    source.set({ pageId: 'a', body: { markdown: 'text', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(recordOf(storage, 'a')).not.toBeNull();

    source.clean('a');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(recordOf(storage, 'a')).toBeNull();
  });

  it('saving an older revision does not remove protection for a newer one', async () => {
    const { storage, source } = setup();
    source.set({ pageId: 'a', body: { markdown: 'rev 1', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    // Revision 1 is saved while revision 2 is already waiting: the note is still unsaved, with newer content.
    source.set({ pageId: 'a', body: { markdown: 'rev 2', revision: 2 }, vault: { body: 'rev 1', title: 'a', description: '' } });
    source.emit('a'); // the save-completion notification
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    const record = recordOf(storage, 'a')!;
    expect(record.body).toEqual({ markdown: 'rev 2', revision: 2 });
  });

  it('a failed vault save does not stop snapshots: the unsaved state is still recorded and kept', async () => {
    const { storage, source } = setup();

    source.set({ pageId: 'a', body: { markdown: 'text', revision: 1 } });
    source.emit('a'); // a save failure notification: the note stays unsaved
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    source.emit('a');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(recordOf(storage, 'a')!.body!.markdown).toBe('text');
  });

  it('never touches a record left by an earlier session, even for the same note', async () => {
    const { storage, source } = setup();
    const earlier = recordFileName('a', 'bbbbbbbb');
    storage.files.set(`${KEY}/${earlier}`, '{"from":"an earlier session"}');

    source.set({ pageId: 'a', body: { markdown: 'text', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    source.clean('a');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(storage.files.get(`${KEY}/${earlier}`)).toBe('{"from":"an earlier session"}');
  });

  it('flush writes what is pending right now and removes what has been saved', async () => {
    const { storage, source, journal } = setup();
    source.set({ pageId: 'a', body: { markdown: 'text', revision: 1 } });

    await journal.flush();

    expect(recordOf(storage, 'a')).not.toBeNull();

    source.clean('a');
    await journal.flush();

    expect(recordOf(storage, 'a')).toBeNull();
  });
});

describe('RecoveryJournal: snapshotNow reports the outcome of its own write', () => {
  it('is false when the newest state could not be written, even though an older snapshot of the note exists', async () => {
    const { storage, source, journal } = setup();
    source.set({ pageId: 'a', body: { markdown: 'first', revision: 1 } });
    await expect(journal.snapshotNow('a')).resolves.toBe(true);

    source.set({ pageId: 'a', body: { markdown: 'restored text', revision: 2 } });
    storage.failWrites = new Error('disk full');

    await expect(journal.snapshotNow('a')).resolves.toBe(false);
    expect(recordOf(storage, 'a')?.body?.markdown).toBe('first');

    storage.failWrites = null;
    await expect(journal.snapshotNow('a')).resolves.toBe(true);
    expect(recordOf(storage, 'a')?.body?.markdown).toBe('restored text');
  });

  it('is true for a note with nothing unsaved', async () => {
    const { journal } = setup();

    await expect(journal.snapshotNow('nothing-here')).resolves.toBe(true);
  });
});

describe('RecoveryJournal: failures', () => {
  it('a failed write keeps the previous record, reports the error, and retries a bounded number of times', async () => {
    const { storage, source, onWriteError } = setup();
    source.set({ pageId: 'a', body: { markdown: 'first', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    storage.failWrites = new Error('disk full');
    source.set({ pageId: 'a', body: { markdown: 'second', revision: 2 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + RECOVERY_RETRY_MS * (RECOVERY_MAX_RETRIES + 2));

    expect(recordOf(storage, 'a')!.body!.markdown).toBe('first'); // the earlier valid record survived
    expect(onWriteError).toHaveBeenCalledTimes(1 + RECOVERY_MAX_RETRIES);

    storage.failWrites = null;
    source.set({ pageId: 'a', body: { markdown: 'third', revision: 3 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(recordOf(storage, 'a')!.body!.markdown).toBe('third');
  });

  it('a transient failure is retried and succeeds', async () => {
    const { storage, source } = setup();
    storage.failWrites = new Error('busy');
    source.set({ pageId: 'a', body: { markdown: 'text', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(recordOf(storage, 'a')).toBeNull();

    storage.failWrites = null;
    await vi.advanceTimersByTimeAsync(RECOVERY_RETRY_MS);

    expect(recordOf(storage, 'a')!.body!.markdown).toBe('text');
  });

  it('dispose cancels timers and leaves records as they are', async () => {
    const { storage, source, journal } = setup();
    source.set({ pageId: 'a', body: { markdown: 'text', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    source.set({ pageId: 'a', body: { markdown: 'later', revision: 2 } });

    journal.dispose();
    await vi.advanceTimersByTimeAsync(RECOVERY_MAX_WAIT_MS * 2);

    expect(vi.getTimerCount()).toBe(0);
    expect(recordOf(storage, 'a')!.body!.markdown).toBe('text');
  });
});

describe('RecoveryJournal: discovery', () => {
  it('finds valid records from an earlier session, skips this session’s own, and counts unreadable files', async () => {
    const { storage, source, journal } = setup();
    const valid = JSON.stringify({
      format: 'clutter-recovery',
      version: 1,
      vaultKey: KEY,
      pageId: 'old',
      kind: 'page',
      capturedAt: '2026-10-27T10:00:00.000Z',
      label: 'Old note',
      pagePath: '/vault/old.md',
      body: { markdown: 'lost text', revision: 4 },
      title: null,
      description: null,
      base: { body: 'f1-x', title: 'Old note', description: '' },
      draft: null,
    });
    storage.files.set(`${KEY}/${recordFileName('old', 'bbbbbbbb')}`, valid);
    storage.files.set(`${KEY}/garbage.cccccccc.json`, '{not json');
    storage.files.set(`${KEY}/empty.dddddddd.json`, '{"format":"clutter-recovery","version":1}');
    source.set({ pageId: 'mine', body: { markdown: 'mine', revision: 1 } });
    await journal.flush();

    const { entries, unreadable } = await journal.discover();

    expect(entries.map((entry) => entry.record.pageId)).toEqual(['old']);
    expect(unreadable).toBe(2);
  });

  it('never throws when the recovery location cannot be listed or read', async () => {
    const broken: RecoveryStorage = {
      list: async () => {
        throw new Error('permission denied');
      },
      read: async () => {
        throw new Error('permission denied');
      },
      writeAtomic: async () => {},
      remove: async () => {},
    };
    const { journal } = setup({ storage: broken });

    await expect(journal.discover()).resolves.toEqual({ entries: [], unreadable: 1 });
  });
});

describe('RecoveryJournal: interrupted snapshots (.json.tmp)', () => {
  const OLD = 'bbbbbbbb';
  const OTHER = 'cccccccc';

  const record = (pageId: string, sequence: number, markdown: string, over: Partial<RecoveryRecord> = {}): RecoveryRecord => ({
    format: 'clutter-recovery',
    version: 1,
    vaultKey: KEY,
    pageId,
    kind: 'page',
    capturedAt: '2026-10-27T10:00:00.000Z',
    sequence,
    label: pageId,
    pagePath: `/vault/${pageId}.md`,
    body: { markdown, revision: sequence },
    title: null,
    description: null,
    base: { body: 'f1-x', title: pageId, description: '' },
    draft: null,
    ...over,
  });
  const committed = (pageId: string, session = OLD) => `${KEY}/${recordFileName(pageId, session)}`;
  const temp = (pageId: string, session = OLD) => `${committed(pageId, session)}.tmp`;
  const text = (storage: MemoryRecoveryStorage, path: string) => {
    const raw = storage.files.get(path);
    return raw === undefined ? undefined : parseRecord(raw)?.body?.markdown;
  };

  it('a newer valid .tmp beside an older committed record is the candidate, offered where it is, and nothing is deleted', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'older')));
    storage.files.set(temp('a'), serializeRecord(record('a', 2, 'newer')));

    const { entries } = await journal.discover();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.record.body?.markdown).toBe('newer');
    expect(entries[0]!.name).toBe(recordFileName('a', OLD) + '.tmp');
    expect(text(storage, temp('a'))).toBe('newer');
    expect(text(storage, committed('a'))).toBe('older');
  });

  it('an older .tmp never overrides a newer committed record; it is not deleted by discovery, only with the candidate', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 5, 'newer')));
    storage.files.set(temp('a'), serializeRecord(record('a', 4, 'older')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['newer']);
    expect(text(storage, committed('a'))).toBe('newer');
    expect(storage.files.has(temp('a'))).toBe(true);

    await journal.removeEntry(entries[0]!);
    expect(storage.files.size).toBe(0);
  });

  it('freshness is the writer’s sequence, not the capture time: a later clock on an older snapshot does not win', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 7, 'newer', { capturedAt: '2026-10-27T10:00:00.000Z' })));
    storage.files.set(temp('a'), serializeRecord(record('a', 6, 'older', { capturedAt: '2026-10-27T23:00:00.000Z' })));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['newer']);
  });

  it('a malformed .tmp beside a valid committed record is not offered, counted as unreadable, and left alone: it may be a write still in progress', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'good')));
    storage.files.set(temp('a'), '{"format":"clutter-recov');

    const { entries, unreadable } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['good']);
    expect(unreadable).toBe(1);
    expect(text(storage, committed('a'))).toBe('good');
    expect(storage.files.get(temp('a'))).toBe('{"format":"clutter-recov');
  });

  it('a valid .tmp whose identity does not match its file name or vault is never offered and never deleted', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'good')));
    storage.files.set(temp('a'), serializeRecord(record('other-note', 9, 'wrong note')));
    storage.files.set(temp('b'), serializeRecord(record('b', 3, 'wrong vault', { vaultKey: 'space-2' })));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.pageId)).toEqual(['a']);
    expect(entries[0]!.record.body?.markdown).toBe('good');
    expect(storage.files.has(temp('a'))).toBe(true);
    expect(storage.files.has(temp('b'))).toBe(true);
  });

  it('two notes are recovered independently, one from a .tmp and one from a committed record', async () => {
    const { storage, journal } = setup();
    storage.files.set(temp('a'), serializeRecord(record('a', 1, 'first snapshot of a')));
    storage.files.set(committed('b'), serializeRecord(record('b', 4, 'committed b')));
    storage.files.set(temp('b'), serializeRecord(record('b', 3, 'older b')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => `${entry.record.pageId}:${entry.record.body?.markdown}`).sort()).toEqual([
      'a:first snapshot of a',
      'b:committed b',
    ]);
  });

  it('interruption during the first snapshot: only a valid .tmp exists, so it is recovered from where it is', async () => {
    const { storage, journal } = setup();
    storage.files.set(temp('a'), serializeRecord(record('a', 1, 'first')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['first']);
    expect(text(storage, temp('a'))).toBe('first');
    expect(storage.files.has(committed('a'))).toBe(false);
  });

  it('interruption mid-write of the first snapshot: a truncated lone .tmp is not offered and is left in place', async () => {
    const { storage, journal } = setup();
    storage.files.set(temp('a'), '{"format":"clutter-recovery","version":1,"vaultKey":"sp');

    const { entries, unreadable } = await journal.discover();

    expect(entries).toEqual([]);
    expect(unreadable).toBe(1);
    expect(storage.files.has(temp('a'))).toBe(true);
  });

  it('interruption during an update: a truncated .tmp leaves the previous committed record as the only candidate', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'previous')));
    storage.files.set(temp('a'), '{"format":"clutter-recovery","ver');

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['previous']);
    expect(text(storage, committed('a'))).toBe('previous');
  });

  it('resolving the candidate removes the .tmp and the older committed record it superseded, and nothing before that', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'older')));
    storage.files.set(temp('a'), serializeRecord(record('a', 2, 'newer')));
    const { entries } = await journal.discover();
    expect(storage.files.size).toBe(2);

    await journal.removeEntry(entries[0]!);

    expect(storage.files.size).toBe(0);
  });

  it('a failed removal while resolving keeps the older committed record, never the other way round', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'older')));
    storage.files.set(temp('a'), serializeRecord(record('a', 2, 'newer')));
    const { entries } = await journal.discover();
    vi.spyOn(storage, 'remove').mockRejectedValueOnce(new Error('i/o error'));

    await expect(journal.removeEntry(entries[0]!)).rejects.toThrow();

    // The newest copy is what was being removed and it is still there; the older one is untouched.
    expect(storage.files.size).toBe(2);
  });

  it('repeated and concurrent discovery is stable: no duplicate candidates, no loss, and nothing deleted but provable garbage', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'older')));
    storage.files.set(temp('a'), serializeRecord(record('a', 2, 'newer')));
    storage.files.set(temp('b'), serializeRecord(record('b', 1, 'only b')));

    const results = [await journal.discover(), ...(await Promise.all([journal.discover(), journal.discover(), journal.discover()]))];

    for (const result of results) {
      expect(result.entries.map((entry) => `${entry.record.pageId}:${entry.record.body?.markdown}`).sort()).toEqual([
        'a:newer',
        'b:only b',
      ]);
    }
    expect([...storage.files.keys()].sort()).toEqual([committed('a'), temp('a'), temp('b')].sort());
  });

  it('discovery overlapping a snapshot write: a half-written .tmp is left alone, and once the write completes the next discovery offers it', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'committed')));
    const complete = serializeRecord(record('a', 2, 'the finished write'));
    storage.files.set(temp('a'), complete.slice(0, complete.length / 2)); // the writer is part-way through

    const during = await journal.discover();
    expect(during.entries.map((entry) => entry.record.body?.markdown)).toEqual(['committed']);
    expect(storage.files.get(temp('a'))).toBe(complete.slice(0, complete.length / 2)); // not deleted, not touched

    storage.files.set(temp('a'), complete); // the write finishes (then the writer would rename it)
    const after = await journal.discover();

    expect(after.entries.map((entry) => entry.record.body?.markdown)).toEqual(['the finished write']);
    expect(text(storage, committed('a'))).toBe('committed');
  });

  it('discovery is read-only in every shape: it never writes, renames or deletes', async () => {
    const { storage, journal } = setup();
    const shapes: Record<string, string> = {
      [committed('a')]: serializeRecord(record('a', 3, 'committed')),
      [temp('a')]: serializeRecord(record('a', 2, 'older tmp')),
      [committed('b')]: serializeRecord(record('b', 1, 'older')),
      [temp('b')]: serializeRecord(record('b', 2, 'newer tmp')),
      [temp('c')]: '{"truncated',
      [committed('d')]: '{"format":"clutter-recov',
      [temp('d')]: serializeRecord(record('d', 1, 'valid tmp beside garbage committed')),
      [temp('e')]: serializeRecord(record('e', 1, 'lone tmp')),
      [committed('f')]: serializeRecord(record('f', 1, 'same')),
      [temp('f')]: serializeRecord(record('f', 1, 'same')),
    };
    for (const [key, value] of Object.entries(shapes)) storage.files.set(key, value);
    const writes = vi.spyOn(storage, 'writeAtomic');
    const removes = vi.spyOn(storage, 'remove');

    await journal.discover();
    await journal.discover();

    expect(writes).not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
    expect(Object.fromEntries(storage.files)).toEqual(shapes);
  });

  it('the same note from two different sessions stays two candidates (they hold different work)', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a', OLD), serializeRecord(record('a', 1, 'from old session')));
    storage.files.set(temp('a', OTHER), serializeRecord(record('a', 1, 'from other session')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown).sort()).toEqual(['from old session', 'from other session']);
  });

  it('this session’s own records, including its own .tmp, are never discovered or touched', async () => {
    const { storage, source, journal } = setup();
    source.set({ pageId: 'a', body: { markdown: 'mine', revision: 1 } });
    await journal.flush();
    const ownName = `${KEY}/${recordFileName('a', journal.session)}`;
    storage.files.set(`${ownName}.tmp`, serializeRecord(record('a', 9, 'mine, mid-write')));

    const { entries } = await journal.discover();

    expect(entries).toEqual([]);
    expect(storage.files.has(ownName)).toBe(true);
    expect(storage.files.has(`${ownName}.tmp`)).toBe(true);
  });

  it('discovery never writes, renames or promotes anything: the only copy of the newest snapshot is never opened for writing', async () => {
    const { storage, journal } = setup();
    const writes = vi.spyOn(storage, 'writeAtomic');
    const removes = vi.spyOn(storage, 'remove');
    storage.files.set(temp('a'), serializeRecord(record('a', 1, 'only copy')));
    storage.files.set(temp('b'), serializeRecord(record('b', 2, 'newer')));
    storage.files.set(committed('b'), serializeRecord(record('b', 1, 'older')));

    await journal.discover();

    expect(writes).not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
  });


  it('a .tmp that cannot be read is not deleted, and does not displace the committed record', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 1, 'good')));
    storage.files.set(temp('a'), serializeRecord(record('a', 2, 'maybe newer')));
    const read = storage.read.bind(storage);
    vi.spyOn(storage, 'read').mockImplementation(async (dir, name) => {
      if (name === `${recordFileName('a', OLD)}.tmp`) throw new Error('i/o error');
      return read(dir, name);
    });

    const { entries, unreadable } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['good']);
    expect(unreadable).toBe(1);
    expect(storage.files.has(temp('a'))).toBe(true);
  });

  it('a committed file that cannot be read is never touched; the .tmp is offered in place', async () => {
    const { storage, journal } = setup();
    const olderText = serializeRecord(record('a', 1, 'maybe valid'));
    storage.files.set(committed('a'), olderText);
    storage.files.set(temp('a'), serializeRecord(record('a', 2, 'newer')));
    const read = storage.read.bind(storage);
    vi.spyOn(storage, 'read').mockImplementation(async (dir, name) => {
      if (name === recordFileName('a', OLD)) throw new Error('i/o error');
      return read(dir, name);
    });

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['newer']);
    expect(storage.files.get(committed('a'))).toBe(olderText);
    expect(storage.files.has(temp('a'))).toBe(true);
  });

  it('a valid record of another note sitting at the committed name is never touched', async () => {
    const { storage, journal } = setup();
    const foreignText = serializeRecord(record('other-note', 9, 'someone else’s work'));
    storage.files.set(committed('a'), foreignText);
    storage.files.set(temp('a'), serializeRecord(record('a', 1, 'mine')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['mine']);
    expect(storage.files.get(committed('a'))).toBe(foreignText);
  });

  it('a malformed committed file beside a valid .tmp is not a record: the .tmp is offered and the garbage goes with it when resolved', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), '{"format":"clutter-recov');
    storage.files.set(temp('a'), serializeRecord(record('a', 1, 'valid')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['valid']);
    expect(storage.files.has(temp('a'))).toBe(true);
    await journal.removeEntry(entries[0]!);
    expect(storage.files.size).toBe(0);
  });

  it('records written before `sequence` existed are ordered by editor revision, then capture time, deterministically', async () => {
    const { storage, journal } = setup();
    const legacy = (revision: number, markdown: string, capturedAt = '2026-10-27T10:00:00.000Z') => {
      const { sequence: _omit, ...rest } = record('a', 1, markdown, { capturedAt });
      return JSON.stringify({ ...rest, body: { markdown, revision } });
    };
    storage.files.set(committed('a'), legacy(3, 'older'));
    storage.files.set(temp('a'), legacy(4, 'newer'));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['newer']);
  });

  it('two legacy records at the same position with different content are both kept and both offered', async () => {
    const { storage, journal } = setup();
    const legacy = (markdown: string) => {
      const { sequence: _omit, ...rest } = record('a', 1, markdown);
      return JSON.stringify({ ...rest, body: { markdown, revision: 3 } });
    };
    storage.files.set(committed('a'), legacy('one'));
    storage.files.set(temp('a'), legacy('two'));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown).sort()).toEqual(['one', 'two']);
    expect(storage.files.has(temp('a'))).toBe(true);
    expect(storage.files.has(committed('a'))).toBe(true);
  });

  it('a record with a malformed sequence is not a record: never offered, never used to delete a valid one', async () => {
    const { storage, journal } = setup();
    storage.files.set(committed('a'), serializeRecord(record('a', 5, 'good')));
    for (const bad of [0, -1, 1.5, '3', null]) {
      storage.files.set(temp('a'), JSON.stringify({ ...record('a', 9, 'bad'), sequence: bad }));
      const { entries } = await journal.discover();
      expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['good']);
      expect(text(storage, committed('a'))).toBe('good');
    }
  });

  it('a .tmp that is byte-identical to the committed record is offered once, kept by discovery, and removed with the candidate', async () => {
    const { storage, journal } = setup();
    const same = serializeRecord(record('a', 3, 'same'));
    storage.files.set(committed('a'), same);
    storage.files.set(temp('a'), same);

    const { entries } = await journal.discover();

    expect(entries).toHaveLength(1);
    expect(storage.files.size).toBe(2);
    await journal.removeEntry(entries[0]!);
    expect(storage.files.size).toBe(0);
  });

});

describe('RecoveryJournal: ordering and timing', () => {
  it('stamps each snapshot of a note with a rising sequence', async () => {
    const { storage, source } = setup();

    source.set({ pageId: 'a', body: { markdown: 'one', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    const first = recordOf(storage, 'a')!.sequence!;
    source.set({ pageId: 'a', body: { markdown: 'two', revision: 2 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    const second = recordOf(storage, 'a')!.sequence!;

    expect(second).toBeGreaterThan(first);
  });

  it('an urgent request snapshots at once, without waiting for the quiet period', async () => {
    const { storage, source } = setup();

    source.set({ pageId: 'a', body: { markdown: 'typed just now', revision: 1 } });
    source.emit('a');
    // `emit` is the normal path; the urgent path is what navigation uses.
    (source as unknown as { listeners: Set<(id?: string, urgent?: boolean) => void> }).listeners.forEach((listener) =>
      listener('a', true)
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(recordOf(storage, 'a')?.body?.markdown).toBe('typed just now');
  });

  it('protectAll resolves true once every unsaved note is on disk, false if any write failed', async () => {
    const { storage, source, journal } = setup();
    source.set({ pageId: 'a', body: { markdown: 'a', revision: 1 } });
    source.set({ pageId: 'b', body: { markdown: 'b', revision: 1 } });

    await expect(journal.protectAll()).resolves.toBe(true);
    expect(recordOf(storage, 'a')).not.toBeNull();
    expect(recordOf(storage, 'b')).not.toBeNull();

    source.set({ pageId: 'c', body: { markdown: 'c', revision: 1 } });
    storage.failWrites = new Error('read-only');
    await expect(journal.protectAll()).resolves.toBe(false);
  });

  it('the recovery window is short and bounded: quiet period 1s, max wait 2s', () => {
    expect(RECOVERY_DEBOUNCE_MS).toBe(1000);
    expect(RECOVERY_MAX_WAIT_MS).toBe(2000);
  });
});

describe('RecoveryJournal: session identifiers', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const tag = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const rec = (pageId: string, markdown: string): RecoveryRecord => ({
    format: 'clutter-recovery',
    version: 1,
    vaultKey: KEY,
    pageId,
    kind: 'page',
    capturedAt: '2026-10-27T10:00:00.000Z',
    sequence: 1,
    label: pageId,
    pagePath: null,
    body: { markdown, revision: 1 },
    title: null,
    description: null,
    base: { body: 'f1-x', title: pageId, description: '' },
    draft: null,
  });

  it('a new session is tagged with a random UUID, and two sessions never share one', () => {
    const make = () => new RecoveryJournal({ storage: new MemoryRecoveryStorage(), vaultKey: KEY, source: new FakeSource() });

    const tags = new Set([make().session, make().session, make().session, newSessionId()]);

    expect(tags.size).toBe(4);
    for (const value of tags) expect(value).toMatch(UUID);
  });

  it('reads both tag formats from a file name, whatever dots and dashes the note id contains', () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

    expect(sessionOfFileName('a.aaaaaaaa.json')).toBe('aaaaaaaa');
    expect(sessionOfFileName('a.aaaaaaaa.json.tmp')).toBe('aaaaaaaa');
    expect(sessionOfFileName(`a.${uuid}.json`)).toBe(uuid);
    expect(sessionOfFileName(`a.${uuid}.json.tmp`)).toBe(uuid);
    expect(sessionOfFileName(`my.note-1.${uuid}.json`)).toBe(uuid);
    expect(sessionOfFileName(`my.note-1.aaaaaaaa.json`)).toBe('aaaaaaaa');
    expect(sessionOfFileName(`${uuid}.bbbbbbbb.json`)).toBe('bbbbbbbb'); // a note id shaped like a UUID is not a tag
    expect(sessionOfFileName('a.json')).toBeNull();
    expect(sessionOfFileName('a.ZZZZZZZZ.json')).toBeNull();
    expect(recordFileName('a', uuid)).toBe(`a.${uuid}.json`);
  });

  it('records from the legacy 8-digit sessions are still discovered, alongside UUID ones, and nothing is renamed or removed', async () => {
    const storage = new MemoryRecoveryStorage();
    const journal = new RecoveryJournal({ storage, vaultKey: KEY, source: new FakeSource() });
    const legacy = `${KEY}/${recordFileName('a', 'bbbbbbbb')}`;
    const modern = `${KEY}/${recordFileName('a', newSessionId())}`;
    storage.files.set(legacy, serializeRecord(rec('a', 'legacy')));
    storage.files.set(modern, serializeRecord(rec('a', 'modern')));

    const { entries } = await journal.discover();

    expect(entries.map((entry) => entry.record.body?.markdown).sort()).toEqual(['legacy', 'modern']);
    expect([...storage.files.keys()].sort()).toEqual([legacy, modern].sort());
  });

  it('a session tag already on disk is never reused: the other session’s record is not overwritten', async () => {
    const storage = new MemoryRecoveryStorage();
    const source = new FakeSource();
    let drawn = 0;
    const journal = new RecoveryJournal({
      storage,
      vaultKey: KEY,
      source,
      session: tag(1),
      newSession: () => tag(100 + drawn++),
      now: () => new Date('2026-10-28T10:00:00.000Z'),
    });
    journal.start();
    const theirs = `${KEY}/${recordFileName('a', tag(1))}`;
    storage.files.set(theirs, serializeRecord(rec('a', 'another session’s work')));

    source.set({ pageId: 'a', body: { markdown: 'mine', revision: 1 } });
    await journal.flush();

    expect(journal.session).not.toBe(tag(1));
    expect(parseRecord(storage.files.get(theirs)!)?.body?.markdown).toBe('another session’s work');
    expect(parseRecord(storage.files.get(`${KEY}/${recordFileName('a', journal.session)}`)!)?.body?.markdown).toBe('mine');

    // And that other session's record is a candidate, not mistaken for this session's own.
    const { entries } = await journal.discover();
    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['another session’s work']);
  });

  it('when every tag drawn is taken, nothing is written rather than overwriting someone else’s record', async () => {
    const storage = new MemoryRecoveryStorage();
    const source = new FakeSource();
    const onWriteError = vi.fn();
    const journal = new RecoveryJournal({ storage, vaultKey: KEY, source, session: tag(1), newSession: () => tag(1), onWriteError, retryMs: 1, maxRetries: 0 });
    journal.start();
    const theirs = `${KEY}/${recordFileName('a', tag(1))}`;
    storage.files.set(theirs, serializeRecord(rec('a', 'theirs')));

    source.set({ pageId: 'a', body: { markdown: 'mine', revision: 1 } });
    await journal.flush();

    expect(onWriteError).toHaveBeenCalled();
    expect(parseRecord(storage.files.get(theirs)!)?.body?.markdown).toBe('theirs');
    expect(storage.files.size).toBe(1);
  });
});

describe('RecoveryJournal: cleanup after a successful save', () => {
  it('a failed removal of the own record is retried, so it is not left behind', async () => {
    const { storage, source } = setup();
    source.set({ pageId: 'a', body: { markdown: 'unsaved', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(recordOf(storage, 'a')).not.toBeNull();
    const remove = vi.spyOn(storage, 'remove').mockRejectedValueOnce(new Error('i/o error'));

    source.clean('a'); // the vault save succeeded
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(recordOf(storage, 'a')).not.toBeNull(); // the failed removal left it, and left it owned

    await vi.advanceTimersByTimeAsync(RECOVERY_RETRY_MS);

    expect(recordOf(storage, 'a')).toBeNull();
  });
});

describe('RecoveryJournal: the session tag is stable through a session', () => {
  it('ten snapshots of one note, plus other notes and a failed write with retries, never change the tag or multiply the records', async () => {
    const { storage, source, journal } = setup();
    const tag = journal.session;
    const names = () => [...storage.files.keys()].sort();

    for (let revision = 1; revision <= 10; revision += 1) {
      source.set({ pageId: 'a', body: { markdown: `revision ${revision}`, revision } });
      await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
      expect(journal.session).toBe(tag);
      expect(names()).toEqual([`${KEY}/${recordFileName('a', tag)}`]); // one file, rewritten, not ten
    }
    expect(recordOf(storage, 'a')?.body?.markdown).toBe('revision 10');
    expect(recordOf(storage, 'a')?.sequence).toBe(10);

    source.set({ pageId: 'b', body: { markdown: 'other note', revision: 1 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    storage.failWrites = new Error('disk full');
    source.set({ pageId: 'a', body: { markdown: 'revision 11', revision: 11 } });
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + RECOVERY_RETRY_MS * 3);
    storage.failWrites = null;
    await journal.flush();

    expect(journal.session).toBe(tag);
    expect(names()).toEqual([`${KEY}/${recordFileName('a', tag)}`, `${KEY}/${recordFileName('b', tag)}`].sort());
  });

  it('a later session sees the first as exactly one candidate per note, however many snapshots it took; a collision cannot overwrite it', async () => {
    const storage = new MemoryRecoveryStorage();
    const source = new FakeSource();
    const first = new RecoveryJournal({ storage, vaultKey: KEY, source });
    first.start();
    for (let revision = 1; revision <= 12; revision += 1) {
      source.set({ pageId: 'a', body: { markdown: `revision ${revision}`, revision } });
      await first.snapshotNow('a');
    }
    first.dispose();

    // The next session happens to draw the first session's tag.
    let drawn = 0;
    const second = new RecoveryJournal({ storage, vaultKey: KEY, source: new FakeSource(), session: first.session, newSession: () => `${String(++drawn).padStart(8, '0')}-0000-4000-8000-000000000000` });
    const { entries } = await second.discover();

    expect(entries.map((entry) => entry.record.body?.markdown)).toEqual(['revision 12']);
    expect(second.session).not.toBe(first.session);
    expect(storage.files.size).toBe(1);
  });
});
