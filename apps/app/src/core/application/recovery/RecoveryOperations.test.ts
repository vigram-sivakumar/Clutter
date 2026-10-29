import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import type { Page } from '../../vault/models/Page';
import type { Vault } from '../../vault/models/Vault';
import { fingerprint } from '../../recovery/fingerprint';
import { RECOVERY_DEBOUNCE_MS, RecoveryJournal, type RecoverableState, type RecoveryEntry } from '../../recovery/RecoveryJournal';
import { parseRecord, recordFileName, type RecoveryRecord } from '../../recovery/RecoveryRecord';
import { MemoryRecoveryStorage } from '../../recovery/RecoveryStorage';
import type { PageOperations } from '../page/PageOperations';
import { RecoveryOperations, classifyRecord } from './RecoveryOperations';

function pageWith(body: string, id = 'page-1', title = 'Note', description?: string): Page {
  return new PageBuilder().build({
    parentId: 'folder-1',
    page: {
      path: `/vault/${title}.md`,
      directoryPath: '/vault',
      frontmatter: { id, ...(description ? { description } : {}) },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function recordFor(overrides: Partial<RecoveryRecord> & { baseBody?: string | null } = {}): RecoveryRecord {
  const { baseBody, ...rest } = overrides;
  return {
    format: 'clutter-recovery',
    version: 1,
    vaultKey: 'space-1',
    pageId: 'page-1',
    kind: 'page',
    capturedAt: '2026-10-27T09:00:00.000Z',
    label: 'Note',
    pagePath: '/vault/Note.md',
    body: { markdown: 'unsaved text', revision: 5 },
    title: null,
    description: null,
    base: { body: baseBody === undefined ? fingerprint('saved text') : baseBody, title: 'Note', description: '' },
    draft: null,
    ...rest,
  };
}

describe('classifyRecord', () => {
  it('offers recovery when the vault still holds exactly what the snapshot started from', () => {
    const result = classifyRecord(recordFor(), pageWith('saved text'), false);

    expect(result.outcome).toBe('recoverable');
  });

  it('treats a vault that already contains the recovered text as saved', () => {
    expect(classifyRecord(recordFor(), pageWith('unsaved text'), false).outcome).toBe('already-saved');
  });

  it('reports a conflict when the vault copy changed independently, naming what changed', () => {
    const result = classifyRecord(recordFor(), pageWith('someone else edited this'), false);

    expect(result.outcome).toBe('conflict');
    expect(result.reasons.join(' ')).toMatch(/text/);
  });

  it('is a conflict, never a plain recovery, when the note is archived', () => {
    expect(classifyRecord(recordFor(), pageWith('saved text'), true).outcome).toBe('conflict');
  });

  it('does not trust the page id: the same id with different content is a conflict', () => {
    expect(classifyRecord(recordFor({ baseBody: null }), pageWith('saved text'), false).outcome).toBe('conflict');
  });

  it('judges title and description separately', () => {
    const titled = recordFor({ body: null, title: 'Renamed', base: { body: null, title: 'Note', description: '' } });
    expect(classifyRecord(titled, pageWith('x', 'page-1', 'Note'), false).outcome).toBe('recoverable');
    expect(classifyRecord(titled, pageWith('x', 'page-1', 'Renamed'), false).outcome).toBe('already-saved');
    expect(classifyRecord(titled, pageWith('x', 'page-1', 'Changed elsewhere'), false).outcome).toBe('conflict');

    const described = recordFor({ body: null, description: 'New', base: { body: null, title: 'Note', description: '' } });
    expect(classifyRecord(described, pageWith('x'), false).outcome).toBe('recoverable');
  });

  it('a note that is gone, or a draft that was never saved, can only be restored as a note', () => {
    expect(classifyRecord(recordFor(), null, false).outcome).toBe('missing-note');
    expect(classifyRecord(recordFor({ kind: 'draft' }), null, false).outcome).toBe('draft');
  });
});

function setup(options: { pages?: Page[]; archived?: boolean } = {}) {
  const storage = new MemoryRecoveryStorage();
  const state = new Map<string, unknown>();
  const journal = new RecoveryJournal({
    storage,
    vaultKey: 'space-1',
    session: 'aaaaaaaa',
    source: { recoverableState: () => null, unsavedPageIds: () => [], subscribeUnsaved: () => () => {} },
  });
  const pages = new Map((options.pages ?? []).map((page) => [page.id, page]));
  const vault = {
    getPage: (id: string) => pages.get(id),
    isPageEffectivelyArchived: () => options.archived === true,
  } as unknown as Vault;
  const calls: string[] = [];
  // Page ids that have unsaved work of their own (typed since, or restored from another record).
  const unsaved = new Set<string>();
  const pageOperations = {
    recoverableState: vi.fn((id: string) => (unsaved.has(id) ? ({} as never) : null)),
    open: vi.fn(async (id: string) => void calls.push(`open:${id}`)),
    commitEdit: vi.fn((id: string, text: string) => void calls.push(`body:${id}:${text}`)),
    commitTitle: vi.fn((id: string, text: string) => void calls.push(`title:${id}:${text}`)),
    commitDescription: vi.fn((id: string, text: string) => void calls.push(`description:${id}:${text}`)),
    create: vi.fn(async (opts: { title?: string; body?: string; folderId: string | null }) => {
      calls.push(`create:${opts.title}:${opts.folderId}`);
      return 'new-id';
    }),
  };
  const operations = new RecoveryOperations(journal, vault, pageOperations as unknown as PageOperations);
  const put = (record: RecoveryRecord, session = 'bbbbbbbb') =>
    storage.files.set(`space-1/${recordFileName(record.pageId, session)}`, JSON.stringify(record));

  return { storage, journal, operations, pageOperations, calls, put, state, pages, unsaved };
}

describe('RecoveryOperations: discovery', () => {
  it('discovers a valid record and offers it for recovery', async () => {
    const { operations, put } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());

    await operations.discover();

    expect(operations.candidates).toHaveLength(1);
    expect(operations.candidates[0]).toMatchObject({ outcome: 'recoverable', changes: ['body'] });
  });

  it('a malformed record does not block discovery of the others, and is left in place', async () => {
    const { operations, put, storage } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());
    storage.files.set('space-1/broken.cccccccc.json', '{oops');

    await operations.discover();

    expect(operations.candidates).toHaveLength(1);
    expect(operations.unreadableCount).toBe(1);
    expect(storage.files.has('space-1/broken.cccccccc.json')).toBe(true);
  });

  it('an unreadable recovery location does not throw', async () => {
    const { operations, storage } = setup();
    vi.spyOn(storage, 'list').mockRejectedValue(new Error('denied'));

    await expect(operations.discover()).resolves.toBeUndefined();
    expect(operations.candidates).toEqual([]);
  });

  it('removes a record the vault already contains, and keeps one it does not', async () => {
    const { operations, put, storage } = setup({ pages: [pageWith('unsaved text', 'page-1'), pageWith('other', 'page-2', 'Other')] });
    put(recordFor());
    put(recordFor({ pageId: 'page-2', baseBody: fingerprint('something else') }));

    await operations.discover();

    expect(storage.files.has(`space-1/${recordFileName('page-1', 'bbbbbbbb')}`)).toBe(false);
    expect(operations.candidates.map((candidate) => candidate.record.pageId)).toEqual(['page-2']);
    expect(storage.files.has(`space-1/${recordFileName('page-2', 'bbbbbbbb')}`)).toBe(true);
  });

  it('keeps every record when the vault has no such note (an unavailable or different vault)', async () => {
    const { operations, put, storage } = setup({ pages: [] });
    put(recordFor());

    await operations.discover();

    expect(operations.candidates[0]!.outcome).toBe('missing-note');
    expect(storage.files.size).toBe(1);
  });

  it('keeps two records for the same note from two sessions apart', async () => {
    const { operations, put } = setup({ pages: [pageWith('saved text')] });
    put(recordFor(), 'bbbbbbbb');
    put(recordFor({ body: { markdown: 'second crash', revision: 9 } }), 'cccccccc');

    await operations.discover();

    expect(operations.candidates).toHaveLength(2);
  });
});

describe('RecoveryOperations: restore re-checks the note as it is now', () => {
  it('a note edited in the vault between discovery and Restore is saved as a new note, never overwritten', async () => {
    const { operations, put, pages, calls, pageOperations, journal } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());
    await operations.discover();
    expect(operations.candidates[0]!.outcome).toBe('recoverable');
    pages.set('page-1', pageWith('edited elsewhere after startup'));
    vi.spyOn(journal, 'snapshotNow').mockResolvedValue(true);

    await operations.restore(operations.candidates[0]!.key);

    expect(pageOperations.commitEdit).not.toHaveBeenCalled();
    expect(calls).toEqual(['create:Note (recovered):folder-1']);
  });

  it('a note with unsaved work of its own (typed since startup) is not overwritten in the editor: the record becomes a new note', async () => {
    const { operations, put, unsaved, calls, pageOperations } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());
    await operations.discover();
    unsaved.add('page-1');

    await operations.restore(operations.candidates[0]!.key);

    expect(pageOperations.commitEdit).not.toHaveBeenCalled();
    expect(calls).toEqual(['create:Note (recovered):folder-1']);
    expect(operations.candidates).toEqual([]);
  });

  it('two records of the same note: restoring the first into the editor makes the second a new note, so neither is lost', async () => {
    const { operations, put, journal, unsaved, calls, pageOperations, storage } = setup({ pages: [pageWith('saved text')] });
    put(recordFor({ body: { markdown: 'first crash text', revision: 4 } }), 'bbbbbbbb');
    put(recordFor({ body: { markdown: 'second crash text', revision: 9 } }), 'cccccccc');
    await operations.discover();
    expect(operations.candidates.map((candidate) => candidate.outcome)).toEqual(['recoverable', 'recoverable']);
    // Restoring puts the text in the editor; the page then has unsaved work until autosave saves it.
    vi.spyOn(journal, 'snapshotNow').mockImplementation(async (id) => (unsaved.add(id), true));
    const [first, second] = operations.candidates;

    await operations.restore(first!.key);
    await operations.restore(second!.key);

    expect(pageOperations.commitEdit).toHaveBeenCalledTimes(1);
    expect(pageOperations.commitEdit).toHaveBeenCalledWith('page-1', first!.record.body!.markdown);
    expect(calls.filter((call) => call.startsWith('create:'))).toEqual(['create:Note (recovered):folder-1']);
    expect(pageOperations.create.mock.calls[0]![0].body).toBe(second!.record.body!.markdown);
    // The second became a new note; the first was restored into the editor. (This stand-in journal reports the note
    // clean, so the first record is already released here; the lifecycle tests below check when records go.)
    expect(storage.files.size).toBe(0);
  });

  it('restoring one of two records never removes the other until it is resolved', async () => {
    const { operations, put, journal, storage } = setup({ pages: [pageWith('saved text')] });
    put(recordFor({ body: { markdown: 'first', revision: 4 } }), 'bbbbbbbb');
    put(recordFor({ body: { markdown: 'second', revision: 9 } }), 'cccccccc');
    await operations.discover();
    vi.spyOn(journal, 'snapshotNow').mockResolvedValue(true);

    await operations.restore(operations.candidates[0]!.key);

    expect(storage.files.size).toBe(1);
    expect(operations.candidates).toHaveLength(1);
  });

  it('a record whose text the vault already holds by Restore time is just removed, with nothing written', async () => {
    const { operations, put, pages, pageOperations, storage } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());
    await operations.discover();
    pages.set('page-1', pageWith('unsaved text'));

    await operations.restore(operations.candidates[0]!.key);

    expect(pageOperations.commitEdit).not.toHaveBeenCalled();
    expect(pageOperations.create).not.toHaveBeenCalled();
    expect(storage.files.size).toBe(0);
  });

  it('a failed new-note save keeps the record, and a retry can still succeed', async () => {
    const { operations, put, pageOperations, storage } = setup({ pages: [pageWith('changed in the vault')] });
    put(recordFor());
    await operations.discover();
    pageOperations.create.mockRejectedValueOnce(new Error('disk full')).mockRejectedValueOnce(new Error('disk full'));
    const key = operations.candidates[0]!.key;

    await expect(operations.restore(key)).rejects.toThrow();
    expect(storage.files.size).toBe(1);
    expect(operations.candidates).toHaveLength(1);

    await operations.restore(key);
    expect(storage.files.size).toBe(0);
  });
});

describe('RecoveryOperations: restore, discard', () => {
  it('restores an unchanged note into the editor through the normal edit path, then drops the old record', async () => {
    const { operations, put, journal, calls, storage } = setup({ pages: [pageWith('saved text')] });
    put(recordFor({ title: 'Renamed', description: 'About' }));
    await operations.discover();
    vi.spyOn(journal, 'snapshotNow').mockResolvedValue(true);

    await operations.restore(operations.candidates[0]!.key);

    expect(calls).toEqual(['open:page-1', 'body:page-1:unsaved text', 'title:page-1:Renamed', 'description:page-1:About']);
    expect(storage.files.size).toBe(0);
    expect(operations.candidates).toEqual([]);
  });

  it('keeps the old record if the restored text could not be protected first', async () => {
    const { operations, put, journal, storage } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());
    await operations.discover();
    vi.spyOn(journal, 'snapshotNow').mockResolvedValue(false);

    await expect(operations.restore(operations.candidates[0]!.key)).rejects.toThrow(/recovery copy was kept/);

    expect(storage.files.size).toBe(1);
    expect(operations.candidates).toHaveLength(1);
  });

  it('never applies a conflicting record over the note: restore saves it as a new note instead', async () => {
    const { operations, put, calls, pageOperations } = setup({ pages: [pageWith('changed in the vault')] });
    put(recordFor());
    await operations.discover();
    expect(operations.candidates[0]!.outcome).toBe('conflict');

    await operations.restore(operations.candidates[0]!.key);

    expect(pageOperations.commitEdit).not.toHaveBeenCalled();
    expect(calls).toEqual(['create:Note (recovered):folder-1']);
    expect(operations.candidates).toEqual([]);
  });

  it('restores a draft as a note in its folder, falling back to the top level if that folder is gone', async () => {
    const { operations, put, pageOperations, calls } = setup();
    put(recordFor({ pageId: 'draft-1', kind: 'draft', pagePath: null, base: { body: null, title: null, description: null }, draft: { folderId: 'gone', type: 'note', title: 'My idea' } }));
    await operations.discover();
    pageOperations.create.mockRejectedValueOnce(new Error('folder not found'));

    await operations.restore(operations.candidates[0]!.key);

    expect(pageOperations.create.mock.calls.map(([options]) => options.folderId)).toEqual(['gone', null]);
    expect(calls).toEqual(['create:My idea:null']);
  });

  it('discard removes only the intended record', async () => {
    const { operations, put, storage } = setup({ pages: [pageWith('saved text'), pageWith('x', 'page-2', 'Two')] });
    put(recordFor());
    put(recordFor({ pageId: 'page-2', baseBody: fingerprint('x') }));
    await operations.discover();
    const target = operations.candidates.find((candidate) => candidate.record.pageId === 'page-1')!;

    await operations.discard(target.key);

    expect([...storage.files.keys()]).toEqual([`space-1/${recordFileName('page-2', 'bbbbbbbb')}`]);
    expect(operations.candidates.map((candidate) => candidate.record.pageId)).toEqual(['page-2']);
  });

  it('notifies subscribers when the candidate list changes', async () => {
    const { operations, put } = setup({ pages: [pageWith('saved text')] });
    put(recordFor());
    const listener = vi.fn();
    operations.subscribe(listener);
    const before = operations.snapshot();

    await operations.discover();

    expect(listener).toHaveBeenCalled();
    expect(operations.snapshot()).not.toBe(before);
  });
});

export type { RecoveryEntry };

/**
 * The whole hand-off from the original record to this session's protecting record to the vault save, with the real
 * journal and a page-operations stand-in whose editor state the journal reads. Every boundary is checked on disk.
 * Policy: the original is kept until the note has nothing unsaved (the vault save succeeded), and removed together with
 * this session's own record; at every boundary at least one valid record holds the content.
 */
describe('RecoveryOperations: the original record through restoration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ORIGINAL = recordFileName('page-1', 'bbbbbbbb');
  const OWN = recordFileName('page-1', 'aaaaaaaa');

  function lifecycle(options: { storage?: MemoryRecoveryStorage; session?: string; seed?: boolean } = {}) {
    const storage = options.storage ?? new MemoryRecoveryStorage();
    const editor = new Map<string, RecoverableState>();
    const listeners = new Set<(id?: string, urgent?: boolean) => void>();
    const emit = (id: string) => listeners.forEach((listener) => listener(id));
    const pages = new Map([['page-1', pageWith('saved text')]]);
    const state = (id: string, markdown: string): RecoverableState => ({ kind: 'page', pageId: id, label: 'Note', pagePath: '/vault/Note.md', body: { markdown, revision: (editor.get(id)?.body?.revision ?? 0) + 1 }, title: null, description: null, vault: { body: 'saved text', title: 'Note', description: '' }, draft: null });
    const pageOperations = {
      recoverableState: (id: string) => editor.get(id) ?? null,
      unsavedPageIds: () => [...editor.keys()],
      subscribeUnsaved: (listener: (id?: string, urgent?: boolean) => void) => (listeners.add(listener), () => void listeners.delete(listener)),
      open: vi.fn(async () => {}),
      commitEdit: vi.fn((id: string, markdown: string) => {
        editor.set(id, state(id, markdown));
        emit(id);
      }),
      commitTitle: vi.fn(),
      commitDescription: vi.fn(),
      create: vi.fn(async () => 'new-id'),
    };
    const journal = new RecoveryJournal({ storage, vaultKey: 'space-1', session: options.session ?? 'aaaaaaaa', source: pageOperations as never, now: () => new Date('2026-10-28T10:00:00.000Z') });
    journal.start();
    const vault = { getPage: (id: string) => pages.get(id), isPageEffectivelyArchived: () => false } as unknown as Vault;
    const operations = new RecoveryOperations(journal, vault, pageOperations as unknown as PageOperations);
    if (options.seed !== false) {
      storage.files.set(`space-1/${ORIGINAL}`, JSON.stringify(recordFor({ body: { markdown: 'recovered text', revision: 5 } })));
    }
    const recordsHolding = (text: string) =>
      [...storage.files.entries()].filter(([, raw]) => parseRecord(raw)?.body?.markdown === text).map(([key]) => key.replace('space-1/', '')).sort();
    /** The vault save succeeded: the note has nothing unsaved any more. */
    const saved = () => {
      editor.delete('page-1');
      emit('page-1');
    };

    return { storage, editor, pages, pageOperations, journal, operations, recordsHolding, emit, saved };
  }

  it('crash before the protecting snapshot completes: the original is intact and nothing else exists', async () => {
    const t = lifecycle();
    await t.operations.discover();
    const spy = vi.spyOn(t.journal, 'snapshotNow');
    spy.mockImplementationOnce(async () => {
      // The text is in the editor; nothing is written or removed yet. A crash here leaves exactly this.
      expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL]);
      expect([...t.storage.files.keys()]).toEqual([`space-1/${ORIGINAL}`]);
      return true;
    });

    await t.operations.restore(t.operations.candidates[0]!.key);

    expect(spy).toHaveBeenCalledOnce();
  });

  it('a failed write of the protecting snapshot keeps the original, tells the user, and Retry completes the same restore (no duplicate note)', async () => {
    const t = lifecycle();
    await t.operations.discover();
    const key = t.operations.candidates[0]!.key;
    t.storage.failWrites = new Error('disk full');

    await expect(t.operations.restore(key)).rejects.toThrow(/recovery copy was kept/);

    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL]);
    expect(t.operations.candidates).toHaveLength(1);

    t.storage.failWrites = null;
    await t.operations.restore(key);

    expect(t.pageOperations.create).not.toHaveBeenCalled();
    expect(t.pageOperations.commitEdit).toHaveBeenCalledTimes(1);
    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL, OWN].sort());
    expect(t.operations.candidates).toEqual([]);
  });

  it('crash after the protecting snapshot, before the vault save: the original AND the protecting record both hold the content', async () => {
    const t = lifecycle();
    await t.operations.discover();

    await t.operations.restore(t.operations.candidates[0]!.key);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS * 5); // the vault save has not happened

    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL, OWN].sort());
  });

  it('failed vault save followed by Retry: nothing is removed until the save finally succeeds, then both go', async () => {
    const t = lifecycle();
    await t.operations.discover();
    await t.operations.restore(t.operations.candidates[0]!.key);

    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS * 20); // saves keep failing; the editor stays unsaved
    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL, OWN].sort());

    t.saved(); // Retry succeeded
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(t.storage.files.size).toBe(0);
  });

  it('a newer edit arriving during restoration is protected in this session’s record; the original keeps the older revision', async () => {
    const t = lifecycle();
    await t.operations.discover();
    await t.operations.restore(t.operations.candidates[0]!.key);

    t.pageOperations.commitEdit('page-1', 'recovered text, plus a newer edit');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    expect(t.recordsHolding('recovered text, plus a newer edit')).toEqual([OWN]);
    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL]);
    // Saving the newer revision is a save of the restored content too: both records go.
    t.saved();
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(t.storage.files.size).toBe(0);
  });

  it('a successful vault save followed by a failed cleanup: the records are kept, the cleanup is retried, and nothing is resurrected', async () => {
    const t = lifecycle();
    await t.operations.discover();
    await t.operations.restore(t.operations.candidates[0]!.key);
    const remove = vi.spyOn(t.storage, 'remove');
    remove.mockRejectedValueOnce(new Error('i/o error')); // the first removal fails

    t.saved();
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(t.storage.files.size).toBeGreaterThan(0); // nothing was lost by the failure

    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS * 10); // the journal retries

    expect(t.storage.files.size).toBe(0);
  });

  it('a failure removing only the original is retried on its own, after this session’s record is already gone', async () => {
    const t = lifecycle();
    await t.operations.discover();
    await t.operations.restore(t.operations.candidates[0]!.key);
    const real = t.storage.remove.bind(t.storage);
    let failures = 0;
    vi.spyOn(t.storage, 'remove').mockImplementation(async (dir, name) => {
      if (name === ORIGINAL && failures++ === 0) throw new Error('i/o error');
      return real(dir, name);
    });

    t.saved();
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);
    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL]);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(t.storage.files.size).toBe(0);
  });

  it('a restart after the process ended before the vault save offers the content once, not twice, and resolving removes both files', async () => {
    const t = lifecycle();
    await t.operations.discover();
    await t.operations.restore(t.operations.candidates[0]!.key);
    expect(t.storage.files.size).toBe(2);

    // New session over the same recovery folder.
    const next = lifecycle({ storage: t.storage, session: 'cccccccc', seed: false });
    await next.operations.discover();

    expect(next.operations.candidates).toHaveLength(1);
    expect(next.operations.candidates[0]!.duplicates).toHaveLength(1);

    await next.operations.discard(next.operations.candidates[0]!.key);
    expect(t.storage.files.size).toBe(0);
  });

  it('a restart after a newer edit leaves two candidates: distinct revisions are never merged', async () => {
    const t = lifecycle();
    await t.operations.discover();
    await t.operations.restore(t.operations.candidates[0]!.key);
    t.pageOperations.commitEdit('page-1', 'recovered text, plus a newer edit');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS);

    const next = lifecycle({ storage: t.storage, session: 'cccccccc', seed: false });
    await next.operations.discover();

    expect(next.operations.candidates.map((candidate) => candidate.record.body?.markdown).sort()).toEqual([
      'recovered text',
      'recovered text, plus a newer edit',
    ]);
  });

  it('terminated mid-hand-off, with the protecting snapshot written and the original still there: nothing is lost', async () => {
    const t = lifecycle();
    await t.operations.discover();
    vi.spyOn(t.journal, 'adopt').mockRejectedValueOnce(new Error('killed'));

    await expect(t.operations.restore(t.operations.candidates[0]!.key)).rejects.toThrow();

    expect(t.recordsHolding('recovered text')).toEqual([ORIGINAL, OWN].sort());
  });
});

describe('RecoveryOperations: identical records are offered once, distinct revisions never merged', () => {
  const same = (over: Partial<RecoveryRecord> = {}) => recordFor({ body: { markdown: 'same text', revision: 5 }, ...over });

  it('two sessions’ records with identical recovered content are one candidate, with nothing deleted at discovery', async () => {
    const { operations, put, storage } = setup({ pages: [pageWith('saved text')] });
    put(same({ capturedAt: '2026-10-27T09:00:00.000Z' }), 'bbbbbbbb');
    put(same({ capturedAt: '2026-10-27T10:00:00.000Z' }), 'cccccccc');

    await operations.discover();

    expect(operations.candidates).toHaveLength(1);
    expect(operations.candidates[0]!.record.capturedAt).toBe('2026-10-27T10:00:00.000Z');
    expect(operations.candidates[0]!.duplicates).toHaveLength(1);
    expect(storage.files.size).toBe(2);

    await operations.discard(operations.candidates[0]!.key);
    expect(storage.files.size).toBe(0);
  });

  it('records of the same note with different recovered text stay separate candidates', async () => {
    const { operations, put } = setup({ pages: [pageWith('saved text')] });
    put(same(), 'bbbbbbbb');
    put(same({ body: { markdown: 'a different revision', revision: 9 } }), 'cccccccc');

    await operations.discover();

    expect(operations.candidates).toHaveLength(2);
  });

  it('the same text in two different notes is never merged', async () => {
    const { operations, put } = setup({ pages: [pageWith('saved text'), pageWith('saved text', 'page-2', 'Other')] });
    put(same(), 'bbbbbbbb');
    put(same({ pageId: 'page-2', label: 'Other', pagePath: '/vault/Other.md' }), 'cccccccc');

    await operations.discover();

    expect(operations.candidates).toHaveLength(2);
  });
});
