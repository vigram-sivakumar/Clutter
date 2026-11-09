import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryParsedNoteCacheBackend } from '../../testing/InMemoryParsedNoteCacheBackend';
import { ParsedNoteCache, sha256Hex } from './ParsedNoteCache';
import { ROOT, build, scan } from './parsedNoteCacheTestSupport';

const note = (id: string, body: string) => `---\nid: ${id}\n---\n# ${body}\n\n- [ ] task ${body}\n`;

const TEXT = {
  a: note('a', 'Alpha'),
  b: note('b', 'Beta'),
  c: note('c', 'Gamma'),
  d: note('d', 'Delta'),
};
const FILES: Record<string, string> = {
  [`${ROOT}/X/a.md`]: TEXT.a,
  [`${ROOT}/X/b.md`]: TEXT.b,
  [`${ROOT}/Y/c.md`]: TEXT.c,
  [`${ROOT}/Y/d.md`]: TEXT.d,
};

const keyOf = (text: string) => sha256Hex(text);
const always = () => true;

afterEach(() => vi.restoreAllMocks());

/** A cache that has scanned FILES and bound its notes, as bootstrap leaves it. Optionally already persisted. */
async function boot(options: { persisted?: boolean; files?: Record<string, string>; backend?: InMemoryParsedNoteCacheBackend } = {}) {
  const backend = options.backend ?? new InMemoryParsedNoteCacheBackend();
  const cache = await ParsedNoteCache.load(backend, ROOT);
  const scanResult = await scan(options.files ?? FILES, cache);
  const { vault } = build(scanResult);
  cache.bindNotes(vault.pages());
  if (options.persisted !== false) await cache.persist();
  return { backend, cache, vault };
}

const entryKeys = (backend: InMemoryParsedNoteCacheBackend): string[] => {
  const contents = backend.files.get(ROOT);
  return contents === undefined ? [] : Object.keys(JSON.parse(contents).entries).sort();
};
const keys = async (...texts: string[]) => (await Promise.all(texts.map(keyOf))).sort();

describe('ParsedNoteCache.forget: a permanently deleted note leaves the cache', () => {
  it('a single note: only its entry is removed, the file stays valid and loads', async () => {
    const { backend, cache } = await boot();
    expect(entryKeys(backend)).toEqual(await keys(TEXT.a, TEXT.b, TEXT.c, TEXT.d));

    await cache.forget(['a'], always);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.b, TEXT.c, TEXT.d));
    const reloaded = await ParsedNoteCache.load(backend, ROOT);
    expect(reloaded.report().loadStatus).toBe('loaded');
    expect(reloaded.report().entriesLoaded).toBe(3);
  });

  it('a recursive folder delete: every note of the folder, and nothing else', async () => {
    const { backend, cache } = await boot();

    await cache.forget(['c', 'd'], always);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.a, TEXT.b));
  });

  it('unrelated entries are kept byte for byte', async () => {
    const { backend, cache } = await boot();
    const before = JSON.parse(backend.files.get(ROOT)!).entries as Record<string, unknown>;

    await cache.forget(['a', 'c'], always);

    const after = JSON.parse(backend.files.get(ROOT)!).entries as Record<string, unknown>;
    for (const key of await keys(TEXT.b, TEXT.d)) {
      expect(after[key]).toStrictEqual(before[key]);
    }
  });

  it('keeps the format, fingerprint and space id of the envelope, and a checksum that verifies', async () => {
    const { backend, cache } = await boot();
    const before = JSON.parse(backend.files.get(ROOT)!);

    await cache.forget(['a'], always);

    const after = JSON.parse(backend.files.get(ROOT)!);
    expect(after.format).toBe(before.format);
    expect(after.parserFingerprint).toBe(before.parserFingerprint);
    expect(after.spaceId).toBe(before.spaceId);
    expect(after.checksum).toBe(await sha256Hex(JSON.stringify(after.entries)));
  });

  it('forgetting the same note twice, or a note never cached, changes nothing and writes nothing more', async () => {
    const { backend, cache } = await boot();
    await cache.forget(['a'], always);
    const writes = backend.writes.length;

    await cache.forget(['a'], always);
    await cache.forget(['created-after-launch'], always);

    expect(backend.writes).toHaveLength(writes);
    expect(entryKeys(backend)).toEqual(await keys(TEXT.b, TEXT.c, TEXT.d));
  });

  it('a note created after launch has no binding: deleting it leaves the cache alone, even if its text equals a cached one', async () => {
    const { backend, cache } = await boot();
    const writes = backend.writes.length;

    // 'fresh' is not a scanned note, whatever it contains.
    await cache.forget(['fresh'], always);

    expect(backend.writes).toHaveLength(writes);
    expect(entryKeys(backend)).toEqual(await keys(TEXT.a, TEXT.b, TEXT.c, TEXT.d));
  });
});

describe('ParsedNoteCache.forget: an empty cache is persisted correctly', () => {
  it('after the write: deleting every note leaves no file, which loads as an empty cache', async () => {
    const { backend, cache } = await boot();

    await cache.forget(['a', 'b', 'c', 'd'], always);

    expect(backend.files.has(ROOT)).toBe(false);
    expect((await ParsedNoteCache.load(backend, ROOT)).report().loadStatus).toBe('empty');
  });

  it('before the write: the write that follows removes the stale file instead of leaving the old entries', async () => {
    const warm = await boot();
    expect(entryKeys(warm.backend).length).toBe(4);

    // The next launch: it loads the warm file, scans, and a delete lands before the one write.
    const { backend, cache } = await boot({ backend: warm.backend, persisted: false });
    await cache.forget(['a', 'b', 'c', 'd'], always);
    await cache.persist();

    expect(backend.files.has(ROOT)).toBe(false);
  });

  it('before the write: a partial delete is carried by the write itself, with the rest kept', async () => {
    const warm = await boot();
    const { backend, cache } = await boot({ backend: warm.backend, persisted: false });

    await cache.forget(['a'], always);
    await cache.persist();

    expect(entryKeys(backend)).toEqual(await keys(TEXT.b, TEXT.c, TEXT.d));
  });

  it('a space that never had a cache file still writes nothing when it is empty', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await ParsedNoteCache.load(backend, ROOT);
    await scan({}, cache);

    expect((await cache.persist()).writeStatus).toBe('unchanged');
    expect(backend.writes).toHaveLength(0);
  });
});

describe('ParsedNoteCache.forget: shared content-addressed entries', () => {
  const SAME = '# Same text\n\nno frontmatter id\n';
  const SHARED_FILES = {
    [`${ROOT}/X/one.md`]: SAME,
    [`${ROOT}/X/two.md`]: SAME,
    [`${ROOT}/X/other.md`]: TEXT.a,
  };

  async function bootShared() {
    const harness = await boot({ files: SHARED_FILES });
    const ids = [...harness.vault.pages()].filter((p) => p.path.endsWith('one.md') || p.path.endsWith('two.md')).map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
    return { ...harness, ids };
  }

  it('one entry serves both notes; deleting one keeps it, deleting the last removes it', async () => {
    const { backend, cache, ids } = await bootShared();
    const sharedKey = await keyOf(SAME);
    expect(entryKeys(backend)).toContain(sharedKey);

    await cache.forget([ids[0]!], always);
    expect(entryKeys(backend)).toContain(sharedKey);

    await cache.forget([ids[1]!], always);
    expect(entryKeys(backend)).not.toContain(sharedKey);
    expect(entryKeys(backend)).toEqual(await keys(TEXT.a));
  });

  it('deleting both in one call removes it', async () => {
    const { backend, cache, ids } = await bootShared();

    await cache.forget(ids, always);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.a));
  });

  it('the other note no longer holds the text (it was edited or archived since the scan): the entry goes with the deleted one', async () => {
    const { backend, cache, ids } = await bootShared();
    const unchanged = vi.fn((noteId: string) => noteId !== ids[1]);

    await cache.forget([ids[0]!], unchanged);

    expect(unchanged).toHaveBeenCalledWith(ids[1], expect.anything());
    expect(entryKeys(backend)).not.toContain(await keyOf(SAME));
    // and that other note, now unbound, can be deleted later without touching anything else
    const writes = backend.writes.length;
    await cache.forget([ids[1]!], always);
    expect(backend.writes).toHaveLength(writes);
  });

  it('the other note is already gone from the Vault: the entry goes', async () => {
    const { backend, cache, ids } = await bootShared();

    await cache.forget([ids[0]!], () => false);

    expect(entryKeys(backend)).not.toContain(await keyOf(SAME));
  });
});

describe('ParsedNoteCache.forget: failures never cost the rest of the cache', () => {
  it('a failed rewrite removes nothing, does not delete the file, and the next forget retries', async () => {
    const { backend, cache } = await boot();
    const before = backend.files.get(ROOT)!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const remove = vi.spyOn(backend, 'remove');
    backend.writeFailure = new Error('disk full');

    await expect(cache.forget(['a'], always)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(backend.files.get(ROOT)).toBe(before);

    backend.writeFailure = null;
    await cache.forget(['b'], always);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.c, TEXT.d));
  });

  it('a failed read keeps the file and retries later', async () => {
    const { backend, cache } = await boot();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    backend.readFailure = new Error('unavailable');

    await cache.forget(['a'], always);
    expect(entryKeys(backend)).toContain(await keyOf(TEXT.a));

    backend.readFailure = null;
    await cache.forget(['b'], always);
    expect(entryKeys(backend)).toEqual(await keys(TEXT.c, TEXT.d));
  });

  it('a cache file that cannot be read by this build is left alone', async () => {
    const { backend, cache } = await boot();
    backend.files.set(ROOT, '{ not json');

    await cache.forget(['a'], always);

    expect(backend.files.get(ROOT)).toBe('{ not json');
  });

  it('never writes after the cache was cancelled (shutdown or a folder rename)', async () => {
    const { backend, cache } = await boot();
    const writes = backend.writes.length;
    cache.cancel();

    await cache.forget(['a'], always);

    expect(backend.writes).toHaveLength(writes);
    expect(entryKeys(backend)).toContain(await keyOf(TEXT.a));
  });

  it('a disabled cache ignores everything', async () => {
    const cache = ParsedNoteCache.disabled();

    cache.bindNotes([{ id: 'a', path: 'p' }]);
    await expect(cache.forget(['a'], always)).resolves.toBeUndefined();
  });
});

describe('ParsedNoteCache.forget: ordering with the one write', () => {
  it('concurrent forgets and the write run one at a time, and no entry that should stay is lost', async () => {
    const warm = await boot();
    const { backend, cache } = await boot({ backend: warm.backend, persisted: false });

    await Promise.all([cache.forget(['a'], always), cache.persist(), cache.forget(['b'], always), cache.forget(['c'], always)]);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.d));
  });

  it('two concurrent forgets after the write both land', async () => {
    const { backend, cache } = await boot();

    await Promise.all([cache.forget(['a'], always), cache.forget(['c'], always)]);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.b, TEXT.d));
  });
});
