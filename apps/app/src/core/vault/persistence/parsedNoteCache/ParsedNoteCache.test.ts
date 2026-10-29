import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryParsedNoteCacheBackend } from '../../testing/InMemoryParsedNoteCacheBackend';
import { FrontmatterParser } from '../../ingest/FrontmatterParser';
import { MarkdownAnalyzer } from '../../ingest/analysis';
import { ParsedNoteCache, sha256Hex } from './ParsedNoteCache';
import {
  buildParserFingerprint,
  PARSER_FINGERPRINT,
  PARSER_VERSION,
} from './parserFingerprint';
import { ROOT, build, scan, snapshot } from './parsedNoteCacheTestSupport';
import { GOLDEN_SAMPLES } from './parseCorpus';

const FILES: Record<string, string> = {
  [`${ROOT}/A/one.md`]: GOLDEN_SAMPLES['no frontmatter, rich body']!,
  [`${ROOT}/A/two.md`]: GOLDEN_SAMPLES['frontmatter with id and title']!,
  [`${ROOT}/B/three.md`]: GOLDEN_SAMPLES['tasks with and without metadata']!,
};

async function loadWith(backend: InMemoryParsedNoteCacheBackend | null) {
  return ParsedNoteCache.load(backend, ROOT);
}

/** A backend already holding a valid cache for FILES. */
async function warmBackend() {
  const backend = new InMemoryParsedNoteCacheBackend();
  const cache = await loadWith(backend);
  await scan(FILES, cache);
  await cache.persist();
  expect(backend.files.has(ROOT)).toBe(true);
  return backend;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ParsedNoteCache loading: anything unusable means no cache, never an error', () => {
  const uncached = async () => snapshot(build(await scan(FILES)).vault);

  async function expectDiscardedAndEquivalent(
    backend: InMemoryParsedNoteCacheBackend,
    reason: RegExp
  ) {
    const cache = await loadWith(backend);
    expect(cache.report().loadStatus).toBe('discarded');
    expect(cache.report().loadReason).toMatch(reason);
    expect(cache.report().entriesLoaded).toBe(0);
    // ordinary parsing still produces exactly the uncached result
    expect(snapshot(build(await scan(FILES, cache)).vault)).toStrictEqual(
      await uncached()
    );
  }

  it('is disabled with no backend, and parses normally', async () => {
    const cache = await loadWith(null);
    expect(cache.report().loadStatus).toBe('disabled');
    expect(await cache.keyOf('text')).toBeNull();
    expect(snapshot(build(await scan(FILES, cache)).vault)).toStrictEqual(
      await uncached()
    );
  });

  it('is disabled when no digest is available', async () => {
    vi.stubGlobal('crypto', undefined);
    const cache = await loadWith(new InMemoryParsedNoteCacheBackend());
    expect(cache.report().loadStatus).toBe('disabled');
  });

  it('treats a throwing backend as unavailable', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.readFailure = new Error('permission denied');
    const cache = await loadWith(backend);
    expect(cache.report().loadStatus).toBe('unavailable');
    expect(snapshot(build(await scan(FILES, cache)).vault)).toStrictEqual(
      await uncached()
    );
    expect((await cache.persist()).writeStatus).toBe('disabled');
  });

  it('treats a missing file as an empty cache', async () => {
    const cache = await loadWith(new InMemoryParsedNoteCacheBackend());
    expect(cache.report().loadStatus).toBe('empty');
  });

  it('loads a valid cache', async () => {
    const cache = await loadWith(await warmBackend());
    expect(cache.report().loadStatus).toBe('loaded');
    expect(cache.report().entriesLoaded).toBe(3);
  });

  it('discards corrupt JSON', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.files.set(ROOT, '{"format":1,"entri');
    await expectDiscardedAndEquivalent(backend, /not valid JSON/);
  });

  it('discards a truncated valid cache', async () => {
    const backend = await warmBackend();
    backend.files.set(ROOT, backend.files.get(ROOT)!.slice(0, 200));
    await expectDiscardedAndEquivalent(backend, /not valid JSON/);
  });

  it('discards a non-object document', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.files.set(ROOT, '[1,2,3]');
    await expectDiscardedAndEquivalent(backend, /malformed envelope/);
  });

  it('discards a wrong format, wrong parser fingerprint and wrong space id', async () => {
    for (const [field, value, reason] of [
      ['format', 2, /format/],
      ['parserFingerprint', 'parser-0|old', /fingerprint/],
      ['spaceId', 'someone-else', /space id/],
    ] as const) {
      const backend = await warmBackend();
      const envelope = JSON.parse(backend.files.get(ROOT)!);
      envelope[field] = value;
      backend.files.set(ROOT, JSON.stringify(envelope));
      await expectDiscardedAndEquivalent(backend, reason);
    }
  });

  it('discards a cache whose entries were altered although the JSON is valid (checksum)', async () => {
    const backend = await warmBackend();
    const envelope = JSON.parse(backend.files.get(ROOT)!);
    const key = Object.keys(envelope.entries)[0]!;
    envelope.entries[key].analysis.tasks = [];
    backend.files.set(ROOT, JSON.stringify(envelope));
    await expectDiscardedAndEquivalent(backend, /checksum mismatch/);
  });

  it('discards a malformed entry or key even with a matching checksum', async () => {
    for (const mutate of [
      (entries: Record<string, unknown>) => {
        entries[Object.keys(entries)[0]!] = { frontmatter: {} };
      },
      (entries: Record<string, unknown>) => {
        entries['not-a-hash'] = entries[Object.keys(entries)[0]!];
      },
    ]) {
      const backend = await warmBackend();
      const envelope = JSON.parse(backend.files.get(ROOT)!);
      mutate(envelope.entries);
      envelope.checksum = await sha256Hex(JSON.stringify(envelope.entries));
      backend.files.set(ROOT, JSON.stringify(envelope));
      await expectDiscardedAndEquivalent(backend, /malformed entry/);
    }
  });

  it('discards an oversize file reported by the native store', async () => {
    const backend = await warmBackend();
    backend.maxBytes = 10;
    await expectDiscardedAndEquivalent(backend, /oversize/);
  });
});

describe('ParsedNoteCache as a memo', () => {
  it('hits only for identical text, and a hit never calls the analyzer', async () => {
    const cache = await loadWith(await warmBackend());
    const analyze = vi.spyOn(MarkdownAnalyzer.prototype, 'analyze');
    const parse = vi.spyOn(FrontmatterParser.prototype, 'parse');

    await scan(FILES, cache);
    expect(cache.report().hits).toBe(3);
    expect(cache.report().misses).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();

    // one byte different: a miss, parsed for real
    const edited = {
      ...FILES,
      [`${ROOT}/A/one.md`]: FILES[`${ROOT}/A/one.md`]! + 'x',
    };
    await scan(edited, cache);
    expect(cache.report().misses).toBe(1);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('hands out independent copies, so mutating one hit cannot affect another file', async () => {
    const identical = {
      [`${ROOT}/A/x.md`]: '- [ ] task\n',
      [`${ROOT}/A/y.md`]: '- [ ] task\n',
    };
    const cache = await loadWith(new InMemoryParsedNoteCacheBackend());
    await scan(identical, cache); // records one entry for both
    const first = cache.recall((await cache.keyOf('- [ ] task\n'))!)!;
    const second = cache.recall((await cache.keyOf('- [ ] task\n'))!)!;
    expect(first).not.toBe(second);
    expect(first.analysis.tasks[0]).not.toBe(second.analysis.tasks[0]);
  });

  it('keeps one entry for identical files', async () => {
    const cache = await loadWith(new InMemoryParsedNoteCacheBackend());
    await scan(
      { [`${ROOT}/A/x.md`]: 'same\n', [`${ROOT}/A/y.md`]: 'same\n' },
      cache
    );
    const report = await cache.persist();
    expect(report.entriesWritten).toBe(1);
  });
});

describe('ParsedNoteCache persistence is best effort and only when something changed', () => {
  it('writes after a scan with misses, then not at all for an unchanged scan', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const first = await loadWith(backend);
    await scan(FILES, first);
    expect((await first.persist()).writeStatus).toBe('written');
    expect(backend.writes).toHaveLength(1);

    const second = await loadWith(backend);
    await scan(FILES, second);
    expect((await second.persist()).writeStatus).toBe('unchanged');
    expect(backend.writes).toHaveLength(1);
  });

  it('rewrites when a file changed and drops entries for deleted and changed files', async () => {
    const backend = await warmBackend();
    const cache = await loadWith(backend);
    const changed = { ...FILES };
    delete changed[`${ROOT}/B/three.md`];
    changed[`${ROOT}/A/one.md`] = 'brand new text';
    await scan(changed, cache);
    const report = await cache.persist();
    expect(report.writeStatus).toBe('written');
    expect(report.entriesWritten).toBe(2); // two.md (kept) + the new text; three and old one dropped
    expect((await loadWith(backend)).report().entriesLoaded).toBe(2);
  });

  it('is deterministic: the same scan produces byte-identical cache text', async () => {
    const a = new InMemoryParsedNoteCacheBackend();
    const b = new InMemoryParsedNoteCacheBackend();
    for (const backend of [a, b]) {
      const cache = await loadWith(backend);
      await scan(FILES, cache);
      await cache.persist();
    }
    expect(a.files.get(ROOT)).toBe(b.files.get(ROOT));
  });

  it('replaces a corrupt cache', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.files.set(ROOT, 'garbage');
    const cache = await loadWith(backend);
    await scan(FILES, cache);
    expect((await cache.persist()).writeStatus).toBe('written');
    expect((await loadWith(backend)).report().loadStatus).toBe('loaded');
  });

  it('survives a write failure: reports it, never throws, scan results unaffected', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.writeFailure = new Error('disk full');
    const cache = await loadWith(backend);
    const result = await scan(FILES, cache);
    const report = await cache.persist();
    expect(report.writeStatus).toBe('failed');
    expect(report.writeReason).toMatch(/disk full/);
    expect(snapshot(build(result).vault)).toStrictEqual(
      snapshot(build(await scan(FILES)).vault)
    );
  });

  it('skips and reports an oversize cache without failing', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    backend.maxBytes = 50;
    const cache = await loadWith(backend);
    await scan(FILES, cache);
    const report = await cache.persist();
    expect(report.writeStatus).toBe('skipped-oversize');
    expect(backend.files.has(ROOT)).toBe(false);
  });

  it('does not write once cancelled (shutdown never waits on the cache)', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await loadWith(backend);
    await scan(FILES, cache);
    cache.cancel();
    expect((await cache.persist()).writeStatus).toBe('cancelled');
    expect(backend.writes).toHaveLength(0);
  });

  it('releases its entries after the write so a session does not hold them', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await loadWith(backend);
    await scan(FILES, cache);
    await cache.persist();
    expect(
      cache.recall((await cache.keyOf(FILES[`${ROOT}/A/one.md`]!))!)
    ).toBeUndefined();
    expect(cache.report().writeStatus).toBe('written'); // the report survives the release
  });

  it('writes at most once', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await loadWith(backend);
    await scan(FILES, cache);
    await cache.persist();
    await cache.persist();
    expect(backend.writes).toHaveLength(1);
  });

  it('writes nothing for an empty space', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await loadWith(backend);
    await scan({}, cache);
    expect((await cache.persist()).writeStatus).toBe('unchanged');
  });
});

describe('parser fingerprint', () => {
  it('changes with the version and with any dependency version, and is order independent', () => {
    const base = buildParserFingerprint({ a: '1.0.0', b: '2.0.0' }, 1);
    expect(buildParserFingerprint({ b: '2.0.0', a: '1.0.0' }, 1)).toBe(base);
    expect(buildParserFingerprint({ a: '1.0.1', b: '2.0.0' }, 1)).not.toBe(
      base
    );
    expect(buildParserFingerprint({ a: '1.0.0', b: '2.0.0' }, 2)).not.toBe(
      base
    );
  });

  it('a cache written under another fingerprint is discarded', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const other = await ParsedNoteCache.load(
      backend,
      ROOT,
      'parser-0|different'
    );
    await scan(FILES, other);
    await other.persist();
    const cache = await loadWith(backend);
    expect(cache.report().loadStatus).toBe('discarded');
    expect(cache.report().loadReason).toMatch(/fingerprint/);
  });

  it('includes the injected build-time dependency versions when present', () => {
    expect(PARSER_FINGERPRINT).toMatch(/^parser-\d+\|/);
    for (const name of [
      '@lezer/markdown',
      '@lezer/common',
      '@lezer/highlight',
      '@codemirror/language',
      '@codemirror/state',
    ]) {
      expect(PARSER_FINGERPRINT).toContain(`${name}@`);
    }
  });
});

describe('parser version 2 (coverCredit, ADR-054): an entry that predates it can never be served', () => {
  const CREDIT_PATH = `${ROOT}/A/credit.md`;
  const files = { [CREDIT_PATH]: GOLDEN_SAMPLES['cover credit, valid']! };
  const previousFingerprint = PARSER_FINGERPRINT.replace(
    /^parser-\d+/,
    `parser-${PARSER_VERSION - 1}`
  );

  /** A cache exactly as the previous parser would have written it: no coverCredit in the entry. */
  async function cacheFromThePreviousParser() {
    const backend = new InMemoryParsedNoteCacheBackend();
    const writer = await ParsedNoteCache.load(
      backend,
      ROOT,
      previousFingerprint
    );
    await scan(files, writer);
    await writer.persist();
    const envelope = JSON.parse(backend.files.get(ROOT)!);
    for (const entry of Object.values(envelope.entries) as Array<{
      frontmatter: Record<string, unknown>;
    }>) {
      delete entry.frontmatter.coverCredit; // before version 2 this line was an unowned property
    }
    envelope.checksum = await sha256Hex(JSON.stringify(envelope.entries)); // internally consistent
    backend.files.set(ROOT, JSON.stringify(envelope));
    return backend;
  }

  it('the version was bumped, so the current fingerprint differs from the previous one', () => {
    expect(PARSER_VERSION).toBeGreaterThanOrEqual(2);
    expect(previousFingerprint).not.toBe(PARSER_FINGERPRINT);
  });

  it('is discarded on load, and the note is parsed fresh with its coverCredit', async () => {
    const backend = await cacheFromThePreviousParser();
    const cache = await loadWith(backend);
    expect(cache.report().loadStatus).toBe('discarded');
    expect(cache.report().loadReason).toMatch(/fingerprint/);

    const [page] = (await scan(files, cache)).pages;
    expect(cache.report().hits).toBe(0);
    expect(page!.frontmatter.coverCredit).toEqual({
      name: 'Jane Doe',
      url: 'https://unsplash.com/@jane?utm_source=clutter&utm_medium=referral',
    });
  });

  it('control: without the version guard the stale entry WOULD have hidden the credit (the hazard the bump prevents)', async () => {
    const backend = await cacheFromThePreviousParser();
    const unguarded = await ParsedNoteCache.load(
      backend,
      ROOT,
      previousFingerprint
    );
    const [page] = (await scan(files, unguarded)).pages;
    expect(unguarded.report().hits).toBe(1);
    expect(page!.frontmatter.coverCredit).toBeUndefined();
  });
});

describe('parser version 5 (task dueTime): a cache written by version 4 is never served', () => {
  const TASK_PATH = `${ROOT}/A/tasks.md`;
  const files = { [TASK_PATH]: '- [ ] call @due:2026-08-20\n' };
  const version4Fingerprint = PARSER_FINGERPRINT.replace(/^parser-\d+/, 'parser-4');

  it('discards the old cache on load and parses the note fresh', async () => {
    const backend = new InMemoryParsedNoteCacheBackend();
    const writer = await ParsedNoteCache.load(backend, ROOT, version4Fingerprint);
    await scan(files, writer);
    await writer.persist();

    const cache = await loadWith(backend);
    expect(cache.report().loadStatus).toBe('discarded');
    expect(cache.report().loadReason).toMatch(/fingerprint/);
    await scan(files, cache);
    expect(cache.report().hits).toBe(0);
  });
});
