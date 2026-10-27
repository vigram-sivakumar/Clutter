import { describe, expect, it, vi } from 'vitest';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import type { Page } from '../../vault/models/Page';
import type { Vault } from '../../vault/models/Vault';
import { fingerprint } from '../../recovery/fingerprint';
import { RecoveryJournal, type RecoveryEntry } from '../../recovery/RecoveryJournal';
import { recordFileName, type RecoveryRecord } from '../../recovery/RecoveryRecord';
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
  const pageOperations = {
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

  return { storage, journal, operations, pageOperations, calls, put, state };
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
