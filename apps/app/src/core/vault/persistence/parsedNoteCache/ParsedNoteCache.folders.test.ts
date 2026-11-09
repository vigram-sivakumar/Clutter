import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryParsedNoteCacheBackend } from '../../testing/InMemoryParsedNoteCacheBackend';
import { ParsedNoteCache, folderCacheId, folderIdOfCacheId, sha256Hex } from './ParsedNoteCache';
import { ROOT, build, scan } from './parsedNoteCacheTestSupport';

const note = (id: string, body: string) => `---\nid: ${id}\n---\n# ${body}\n`;
const folderText = (id: string, description: string) => `---\nid: ${id}\ndescription: ${description}\n---\n`;

const TEXT = {
  boxMeta: folderText('box', 'Box'),
  innerMeta: folderText('inner', 'Inner'),
  keepMeta: folderText('keepf', 'Keep'),
  a: note('a', 'Alpha'),
  b: note('b', 'Beta'),
  k: note('k', 'Kappa'),
};
const FILES: Record<string, string> = {
  [`${ROOT}/Box/.folder.md`]: TEXT.boxMeta,
  [`${ROOT}/Box/a.md`]: TEXT.a,
  [`${ROOT}/Box/Inner/.folder.md`]: TEXT.innerMeta,
  [`${ROOT}/Box/Inner/b.md`]: TEXT.b,
  [`${ROOT}/Keep/.folder.md`]: TEXT.keepMeta,
  [`${ROOT}/Keep/k.md`]: TEXT.k,
};

const always = () => true;
const never = () => false;
const keys = async (...texts: string[]) => (await Promise.all(texts.map(sha256Hex))).sort();
const entryKeys = (backend: InMemoryParsedNoteCacheBackend): string[] => {
  const contents = backend.files.get(ROOT);
  return contents === undefined ? [] : Object.keys(JSON.parse(contents).entries).sort();
};

afterEach(() => vi.restoreAllMocks());

/** As bootstrap leaves it: scanned through the cache, notes and folders bound, optionally written once. */
async function boot(options: { files?: Record<string, string>; backend?: InMemoryParsedNoteCacheBackend; persisted?: boolean } = {}) {
  const backend = options.backend ?? new InMemoryParsedNoteCacheBackend();
  const cache = await ParsedNoteCache.load(backend, ROOT);
  const { vault } = build(await scan(options.files ?? FILES, cache));
  cache.bindNotes(
    vault.pages(),
    Array.from(vault.folders(), (folder) => ({ id: folder.id, path: `${folder.path}/.folder.md` }))
  );
  if (options.persisted !== false) await cache.persist();
  return { backend, cache, vault };
}

describe('ParsedNoteCache: folder .folder.md entries', () => {
  it('namespaces folder ids so they cannot collide with note ids', () => {
    expect(folderCacheId('x')).not.toBe('x');
    expect(folderIdOfCacheId(folderCacheId('x'))).toBe('x');
    expect(folderIdOfCacheId('x')).toBeUndefined();
  });

  it('binds each folder, by its stable id, to its own .folder.md entry (and no other)', async () => {
    const { backend, cache, vault } = await boot();
    const box = [...vault.folders()].find((f) => f.name === 'Box')!;
    expect(box.id).toBe('box');

    await cache.forgetFolders([box.id], never);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.innerMeta, TEXT.keepMeta, TEXT.a, TEXT.b, TEXT.k));
  });

  it('a folder id equal to a note id does not mix them up', async () => {
    const files = {
      [`${ROOT}/Same/.folder.md`]: folderText('same', 'F'),
      [`${ROOT}/Same/same.md`]: note('same', 'N'),
    };
    const { backend, cache } = await boot({ files });

    await cache.forgetFolders(['same'], never);

    expect(entryKeys(backend)).toEqual(await keys(files[`${ROOT}/Same/same.md`]!));
  });

  it('a recursive folder delete forgets the folder, its subfolders and its notes, and nothing else', async () => {
    const { backend, cache } = await boot();

    await cache.forget(['a', 'b'], never);
    await cache.forgetFolders(['box', 'inner'], never);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.keepMeta, TEXT.k));
  });

  it('a shared entry stays while another unchanged folder or note still holds the text', async () => {
    const shared = folderText('twin', 'Same text');
    // Two folders cannot share text through their frontmatter id, so a note carries the same bytes as the folder file.
    const files = {
      [`${ROOT}/F/.folder.md`]: shared,
      [`${ROOT}/F/n.md`]: shared,
    };
    const { backend, cache, vault } = await boot({ files });
    const folder = [...vault.folders()].find((f) => f.name === 'F')!;
    const sharerId = [...vault.pages()][0]!.id;

    await cache.forgetFolders([folder.id], (id) => id === sharerId);
    expect(entryKeys(backend)).toEqual(await keys(shared));

    // Once the other holder is gone or changed, the entry goes.
    await cache.forget([sharerId], never);
    expect(entryKeys(backend)).toEqual([]);
  });

  it('a shared entry also stays for another folder that still exists', async () => {
    const { backend, cache, vault } = await boot({
      files: {
        [`${ROOT}/A/.folder.md`]: TEXT.keepMeta,
        [`${ROOT}/B/.folder.md`]: TEXT.keepMeta,
      },
    });
    const [first, second] = [...vault.folders()];

    await cache.forgetFolders([first!.id], (id) => id === folderCacheId(second!.id));

    expect(entryKeys(backend)).toEqual(await keys(TEXT.keepMeta));
  });
});

describe('ParsedNoteCache.forget: pending cleanup versus an unreadable cache file', () => {
  /** Makes the next `read` report an existing but unusable file. */
  const failReadOnce = (backend: InMemoryParsedNoteCacheBackend, problem: string) => {
    const real = backend.read.bind(backend);
    return vi.spyOn(backend, 'read').mockImplementationOnce(async (root) => ({ ...(await real(root)), contents: null, problem }));
  };

  it('keeps the pending keys, leaves the file untouched and never removes it', async () => {
    const { backend, cache } = await boot();
    const before = backend.files.get(ROOT);
    const writes = backend.writes.length;
    const remove = vi.spyOn(backend, 'remove');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failReadOnce(backend, 'unreadable');

    await cache.forget(['a'], never);

    expect(backend.files.get(ROOT)).toBe(before);
    expect(backend.writes).toHaveLength(writes);
    expect(remove).not.toHaveBeenCalled();
  });

  it('an oversized file is treated the same way', async () => {
    const { backend, cache } = await boot();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failReadOnce(backend, 'oversize');
    const before = backend.files.get(ROOT);

    await cache.forget(['a'], never);

    expect(backend.files.get(ROOT)).toBe(before);
  });

  it('a later attempt retries and removes the intended entries, including the ones kept pending', async () => {
    const { backend, cache } = await boot();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failReadOnce(backend, 'unreadable');

    await cache.forget(['a'], never);
    expect(entryKeys(backend)).toContain((await keys(TEXT.a))[0]);

    await cache.forgetFolders(['inner'], never);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.boxMeta, TEXT.keepMeta, TEXT.b, TEXT.k));
  });

  it('a retry with no new keys also works', async () => {
    const { backend, cache } = await boot();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failReadOnce(backend, 'unreadable');
    await cache.forget(['a'], never);

    await cache.forget(['not-bound'], always);

    expect(entryKeys(backend)).toEqual(await keys(TEXT.boxMeta, TEXT.innerMeta, TEXT.keepMeta, TEXT.b, TEXT.k));
  });

  it('a genuinely missing file leaves nothing stuck: the keys are dropped and a later forget does not retry them', async () => {
    const { backend, cache } = await boot();
    backend.files.delete(ROOT);
    const read = vi.spyOn(backend, 'read');

    await cache.forget(['a'], never);
    expect(read).toHaveBeenCalledTimes(1);

    // Nothing is pending from the first call, so a second forget reads once more for its own key only.
    await cache.forget(['b'], never);
    expect(read).toHaveBeenCalledTimes(2);
    expect(backend.files.has(ROOT)).toBe(false);
  });
});
