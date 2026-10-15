import { describe, expect, it, vi } from 'vitest';
import { InMemoryParsedNoteCacheBackend } from '../../testing/InMemoryParsedNoteCacheBackend';
import { FrontmatterParser } from '../../ingest/FrontmatterParser';
import { MarkdownAnalyzer } from '../../ingest/analysis';
import { ParsedNoteCache } from './ParsedNoteCache';
import { GOLDEN_SAMPLES, generateVault } from './parseCorpus';
import { ROOT, build, scan, snapshot } from './parsedNoteCacheTestSupport';

/**
 * ADR-053's acceptance criterion: ingestion through the cache produces
 * structurally identical results to ingestion without it. Every comparison is
 * Vitest's `toStrictEqual`, which treats `undefined`-valued properties,
 * prototypes and sparse arrays as significant. Nothing here is weakened to
 * accommodate JSON.
 */
function corpus(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(GOLDEN_SAMPLES)) {
    files[`${ROOT}/Golden/${name.replace(/[^a-z0-9 ]/gi, '')}.md`] = text;
  }
  return { ...files, ...generateVault(120, `${ROOT}/Generated`) };
}

async function warmBackend(files: Record<string, string>) {
  const backend = new InMemoryParsedNoteCacheBackend();
  const cache = await ParsedNoteCache.load(backend, ROOT);
  await scan(files, cache);
  await cache.persist();
  return backend;
}

const reload = (backend: InMemoryParsedNoteCacheBackend) =>
  ParsedNoteCache.load(backend, ROOT);

describe('corpus coverage (the comparison must actually exercise optional properties)', () => {
  it('has each optional property both present and absent', async () => {
    const pages = (await scan(corpus())).pages;
    const tasks = pages.flatMap((page) => page.analysis.tasks);
    const links = pages.flatMap((page) => page.analysis.links);
    const embeds = pages.flatMap((page) => page.analysis.embeds);
    const has = <T>(items: readonly T[], test: (item: T) => boolean) =>
      items.some(test);

    for (const key of ['dueDate', 'completedAt'] as const) {
      expect(
        has(tasks, (t) => t[key] !== undefined),
        `task ${key} defined`
      ).toBe(true);
      expect(
        has(tasks, (t) => t[key] === undefined),
        `task ${key} undefined`
      ).toBe(true);
      expect(
        has(tasks, (t) => key in t && t[key] === undefined),
        `task ${key} present-with-undefined`
      ).toBe(true);
    }
    for (const key of ['heading', 'blockReference', 'alias'] as const) {
      expect(
        has(links, (l) => l[key] !== undefined),
        `link ${key} defined`
      ).toBe(true);
      expect(
        has(links, (l) => l[key] === undefined),
        `link ${key} undefined`
      ).toBe(true);
      expect(
        has(embeds, (e) => e[key] !== undefined),
        `embed ${key} defined`
      ).toBe(true);
      expect(
        has(embeds, (e) => e[key] === undefined),
        `embed ${key} undefined`
      ).toBe(true);
    }
    expect(has(pages, (p) => p.frontmatter.id === undefined)).toBe(true);
    expect(has(pages, (p) => p.frontmatter.id !== undefined)).toBe(true);
    expect(has(pages, (p) => p.analysis.tags.length === 0)).toBe(true);
    expect(has(pages, (p) => p.analysis.tags.length > 0)).toBe(true);
  });
});

describe('coverCredit through the cache (ADR-054)', () => {
  const credited = `${ROOT}/Golden/credited.md`;
  const withDownload = `${ROOT}/Golden/credited-download.md`;
  const malformed = `${ROOT}/Golden/malformed.md`;
  const none = `${ROOT}/Golden/none.md`;
  const files = {
    [credited]: GOLDEN_SAMPLES['cover credit, valid']!,
    [withDownload]: GOLDEN_SAMPLES['cover credit, with download location']!,
    [malformed]: GOLDEN_SAMPLES['cover credit, malformed (no profile url)']!,
    [none]: GOLDEN_SAMPLES['cover without credit']!,
  };

  it('survives parse, encode/decode and Page construction identically, with and without a download location', async () => {
    const fresh = await scan(files);
    const backend = await warmBackend(files);
    const cache = await reload(backend);
    const cached = await scan(files, cache);
    expect(cache.report().misses).toBe(0);

    const byPath = (result: typeof fresh, path: string) =>
      result.pages.find((page) => page.path === path)!;
    expect(byPath(cached, credited).frontmatter.coverCredit).toStrictEqual({
      name: 'Jane Doe',
      url: 'https://unsplash.com/@jane?utm_source=clutter&utm_medium=referral',
    });
    // optional property absent (no `downloadLocation` key at all) and present
    expect(
      'downloadLocation' in byPath(cached, credited).frontmatter.coverCredit!
    ).toBe(false);
    expect(
      byPath(cached, withDownload).frontmatter.coverCredit!.downloadLocation
    ).toBe('https://api.unsplash.com/photos/abc/download?ixid=xyz');
    // malformed credit and a cover without one: no credit, and loading is unaffected
    expect(byPath(cached, malformed).frontmatter.coverCredit).toBeUndefined();
    expect(byPath(cached, none).frontmatter.coverCredit).toBeUndefined();

    // the constructed Pages (application reconstruction) are identical to the uncached ones
    const freshPages = [...build(fresh).vault.pages()];
    const cachedPages = [...build(cached).vault.pages()];
    expect(cachedPages).toStrictEqual(freshPages);
    const credit = (pages: typeof freshPages, path: string) =>
      pages.find((page) => page.path === path)!.metadata.coverCredit;
    expect(credit(cachedPages, credited)).toStrictEqual({
      name: 'Jane Doe',
      url: 'https://unsplash.com/@jane?utm_source=clutter&utm_medium=referral',
    });
    expect(credit(cachedPages, withDownload)?.downloadLocation).toBeDefined();
    expect(credit(cachedPages, malformed)).toBeNull();
    expect(credit(cachedPages, none)).toBeNull();
  });
});

describe('FrontmatterParser.split', () => {
  it('derives exactly the body that parse returns, for every sample (a cache hit relies on this)', () => {
    const parser = new FrontmatterParser();
    for (const [name, text] of Object.entries(GOLDEN_SAMPLES)) {
      expect(parser.split(text).body, name).toBe(parser.parse(text).body);
    }
  });
});

describe('cached ingestion is structurally identical to uncached ingestion', () => {
  it('is identical on a first (all-miss) cached scan, a fully cached scan, and after reloading from the serialized text', async () => {
    const files = corpus();
    const uncached = await scan(files);
    const uncachedBuild = build(uncached);

    // all-miss scan through an empty cache
    const empty = await ParsedNoteCache.load(
      new InMemoryParsedNoteCacheBackend(),
      ROOT
    );
    const allMiss = await scan(files, empty);
    expect(allMiss.pages).toStrictEqual(uncached.pages);

    // serialize, then decode from text — a different object graph from the one that was parsed
    const backend = new InMemoryParsedNoteCacheBackend();
    const writer = await ParsedNoteCache.load(backend, ROOT);
    await scan(files, writer);
    await writer.persist();

    const analyze = vi.spyOn(MarkdownAnalyzer.prototype, 'analyze');
    const parse = vi.spyOn(FrontmatterParser.prototype, 'parse');
    const reader = await reload(backend);
    const cached = await scan(files, reader);

    // the expensive analyzer genuinely did not run
    expect(reader.report().misses).toBe(0);
    expect(reader.report().hits).toBe(Object.keys(files).length);
    expect(analyze).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    analyze.mockRestore();
    parse.mockRestore();

    // scan level
    expect(cached.pages).toStrictEqual(uncached.pages);
    expect(cached.directories).toStrictEqual(uncached.directories);
    expect(cached.files).toStrictEqual(uncached.files);

    // Page and Vault level (including duplicate-id reassignment)
    const cachedBuild = build(cached);
    expect([...cachedBuild.reassignedPagePaths]).toStrictEqual([
      ...uncachedBuild.reassignedPagePaths,
    ]);
    expect([...cachedBuild.reassignedFolderPaths]).toStrictEqual([
      ...uncachedBuild.reassignedFolderPaths,
    ]);
    expect(snapshot(cachedBuild.vault)).toStrictEqual(
      snapshot(uncachedBuild.vault)
    );
    expect([...cachedBuild.vault.pages()].length).toBeGreaterThan(100);
  });

  it('is identical when some files hit and some miss', async () => {
    const files = corpus();
    const backend = await warmBackend(files);
    const changed = { ...files };
    for (const path of Object.keys(files).slice(0, 15))
      changed[path] = files[path]! + '\n\n- [ ] added task @due:2027-01-01\n';

    const cache = await reload(backend);
    const mixed = await scan(changed, cache);
    expect(cache.report().misses).toBe(15);
    expect(cache.report().hits).toBe(Object.keys(files).length - 15);
    const fresh = await scan(changed);
    expect(mixed.pages).toStrictEqual(fresh.pages);
    expect(snapshot(build(mixed).vault)).toStrictEqual(
      snapshot(build(fresh).vault)
    );
  });

  it('hits for renamed and moved files (the key is the content, not the path)', async () => {
    const files = corpus();
    const backend = await warmBackend(files);
    const moved: Record<string, string> = {};
    for (const [path, text] of Object.entries(files))
      moved[path.replace(`${ROOT}/Generated/`, `${ROOT}/Moved Elsewhere/`)] =
        text;

    const cache = await reload(backend);
    const result = await scan(moved, cache);
    expect(cache.report().misses).toBe(0);
    const fresh = await scan(moved);
    expect(result.pages).toStrictEqual(fresh.pages);
    expect(snapshot(build(result).vault)).toStrictEqual(
      snapshot(build(fresh).vault)
    );
  });

  it('never serves old content for an edit, even one that keeps the same length', async () => {
    const path = `${ROOT}/A/note.md`;
    const original = '- [ ] aaaa task\n';
    const edited = '- [x] bbbb task\n'; // identical length, different content
    expect(edited.length).toBe(original.length);

    const backend = await warmBackend({ [path]: original });
    const cache = await reload(backend);
    const result = await scan({ [path]: edited }, cache);
    expect(cache.report().misses).toBe(1);
    expect(result.pages[0]!.analysis.tasks[0]!.text).toBe('bbbb task');
    expect(result.pages[0]!.analysis.tasks[0]!.completed).toBe(true);
  });

  it('handles duplicate ids exactly as without a cache (VaultBuilder still reassigns every boot)', async () => {
    const files = {
      [`${ROOT}/A/a.md`]: GOLDEN_SAMPLES['duplicate id a']!,
      [`${ROOT}/A/b.md`]: GOLDEN_SAMPLES['duplicate id b']!,
      [`${ROOT}/A/c.md`]: GOLDEN_SAMPLES['duplicate id a']!, // identical text to a: one shared entry
    };
    const backend = await warmBackend(files);
    const cache = await reload(backend);
    const cached = build(await scan(files, cache));
    const fresh = build(await scan(files));
    expect(cached.reassignedPagePaths.size).toBeGreaterThan(0);
    expect([...cached.reassignedPagePaths]).toStrictEqual([
      ...fresh.reassignedPagePaths,
    ]);
    expect(snapshot(cached.vault)).toStrictEqual(snapshot(fresh.vault));
  });

  it('is identical when the cache is corrupt, incompatible or unavailable', async () => {
    const files = corpus();
    const fresh = snapshot(build(await scan(files)).vault);

    const corrupt = new InMemoryParsedNoteCacheBackend();
    corrupt.files.set(ROOT, '{"oops');
    const unavailable = new InMemoryParsedNoteCacheBackend();
    unavailable.readFailure = new Error('nope');
    const wrongFingerprint = await warmBackend(files);
    wrongFingerprint.files.set(
      ROOT,
      wrongFingerprint.files
        .get(ROOT)!
        .replace(
          /"parserFingerprint":"[^"]*"/,
          '"parserFingerprint":"parser-0|old"'
        )
    );

    for (const backend of [corrupt, unavailable, wrongFingerprint, null]) {
      const cache = await ParsedNoteCache.load(backend, ROOT);
      expect(snapshot(build(await scan(files, cache)).vault)).toStrictEqual(
        fresh
      );
    }
  });

  it('a plain JSON round trip would NOT have been equivalent (guards the guard)', async () => {
    const [page] = (await scan({ [`${ROOT}/A/t.md`]: '- [ ] task\n' })).pages;
    const naive = JSON.parse(JSON.stringify(page!.analysis));
    expect(() => expect(naive).toStrictEqual(page!.analysis)).toThrow();
  });
});
