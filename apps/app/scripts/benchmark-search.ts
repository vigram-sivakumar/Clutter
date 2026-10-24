/**
 * Search matcher benchmark — a diagnostic, not a test: it asserts nothing and is not part of `npm test` / CI.
 *
 *   cd apps/app
 *   node --expose-gc --max-old-space-size=8192 --import tsx scripts/benchmark-search.ts [sizes...]
 *
 * (sizes default to 1000 10000 50000). It drives the real ranking pass (`RankingJob`, the code `SearchService` runs
 * per query) over seeded, deterministic synthetic vaults and prints what it measured. Nothing here is a threshold.
 *
 * What each row means:
 *   prepare  — folding every page's Markdown into its prefilter text (the work a first query pays, and what the
 *              overlay does in idle slices when it opens). Memory is the retained growth of V8's heap AND of
 *              ArrayBuffer backing stores (typed arrays are off-heap and invisible to `heapUsed` alone), after gc().
 *   cold     — the first run of a query on prepared pages: it also parses the Markdown of each page it has to confirm.
 *   warm     — the same query repeated; memos exist, so this is the steady-state cost of a refresh.
 *   slices   — the same cold query driven in 8 ms slices on UNPREPARED pages: the number of slices, and the longest
 *              single slice, which is how long the main thread is ever held at once.
 *   all-parsed — worst case: the Markdown of every page parsed and mapped (what happens if queries have confirmed
 *              every page), with its memory.
 */
import { BodyText, parseQuery } from '../src/core/application/search/matchPage';
import { foldString } from '../src/core/application/search/foldText';
import { RankingJob, rankPages, type ScanCandidate } from '../src/core/application/search/rankPages';
import { makeVault, type SyntheticPage } from './searchBenchmarkVault';

const LIMIT = 50;
const WARM_RUNS = 25;

function buildCandidates(pages: readonly SyntheticPage[]): ScanCandidate[] {
  return pages.map((page) => ({
    id: page.id,
    meta: {
      title: foldString(page.title),
      aliases: page.aliases.map(foldString),
      headings: [foldString(page.markdown.slice(2, page.markdown.indexOf('\n')))],
      tags: page.tags.map((tag) => foldString(tag).replace(/[-_]+/g, ' ')),
    },
    body: new BodyText(page.markdown),
    updatedMs: Date.parse(page.updatedAt),
    sortTitle: foldString(page.title),
  }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)]!;
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

const gc = (globalThis as { gc?: () => void }).gc;

/** Retained memory in MB: the JS heap plus ArrayBuffer backing stores (which `heapUsed` leaves out). */
function memoryMb(): { heap: number; buffers: number } {
  gc?.();
  gc?.();

  const usage = process.memoryUsage();

  return { heap: usage.heapUsed / 1024 / 1024, buffers: usage.arrayBuffers / 1024 / 1024 };
}

function time<T>(run: () => T): { ms: number; value: T } {
  const start = performance.now();
  const value = run();

  return { ms: performance.now() - start, value };
}

const f = (ms: number): string => (ms < 10 ? ms.toFixed(2) : ms.toFixed(1)).padStart(9);

function benchmark(count: number): void {
  console.log(`\n=== ${count.toLocaleString()} notes ===`);

  const generated = time(() => makeVault(count));
  const { pages, commonWord, rareWord, titleWord } = generated.value;
  const totalBytes = pages.reduce((sum, page) => sum + page.markdown.length, 0);
  console.log(`vault: ${(totalBytes / 1024 / 1024).toFixed(1)} MB of Markdown (generated in ${(generated.ms / 1000).toFixed(1)} s, not measured)`);

  // Pages read from disk are flat strings; the generator's are concatenations. Flatten them first so that cost is not
  // counted as the search's memory.
  pages.forEach((page) => page.markdown.charCodeAt(0));

  const before = memoryMb();
  const built = time(() => buildCandidates(pages));
  const candidates = built.value;
  const afterObjects = memoryMb();
  const prepared = time(() => candidates.forEach((candidate) => candidate.body.prefilter));
  const after = memoryMb();
  const perNote = (mb: number): string => ((mb * 1024) / count).toFixed(2);

  console.log(`objects ${f(built.ms)} ms   +${perNote(afterObjects.heap - before.heap)} KB/note (page objects and titles)`);
  console.log(
    `prepare ${f(prepared.ms)} ms   +${perNote(after.heap - afterObjects.heap)} KB/note heap, +${perNote(after.buffers - afterObjects.buffers)} KB/note buffers` +
      `   total +${((after.heap + after.buffers - before.heap - before.buffers)).toFixed(1)} MB (${perNote(after.heap + after.buffers - before.heap - before.buffers)} KB/note)`
  );

  const queries: Array<[string, string]> = [
    ['rare word (~few notes)', rareWord],
    ['common word (~30% of notes)', commonWord],
    ['word in some titles', titleWord],
    ['two words', `${commonWord} ${titleWord}`],
    ['no match', 'qqqqnomatch'],
    ['one letter', 'a'],
    ['non-ASCII', 'café'],
    ['partial phrase (word + 1 letter)', `${commonWord} ${titleWord.slice(0, 1)}`],
    ['typo in a title word', `${titleWord.slice(0, 1)}${titleWord[2]}${titleWord[1]}${titleWord.slice(3)}`],
  ];

  console.log(`${'query'.padEnd(30)}${'cold ms'.padStart(10)}${'warm med'.padStart(10)}${'warm p95'.padStart(10)}${'hits'.padStart(6)}`);

  for (const [label, text] of queries) {
    const fresh = buildCandidates(pages);
    fresh.forEach((candidate) => candidate.body.prefilter); // prepared, but nothing parsed yet
    const query = parseQuery(text)!;
    const cold = time(() => rankPages(query, fresh, LIMIT));
    const warm: number[] = [];

    for (let run = 0; run < WARM_RUNS; run++) {
      warm.push(time(() => rankPages(query, fresh, LIMIT)).ms);
    }

    console.log(`${label.padEnd(30)}${f(cold.ms)} ${f(median(warm))} ${f(percentile95(warm))}${String(cold.value.length).padStart(6)}`);
  }

  // Typing: each keystroke is a new query against prepared pages.
  const typed = [commonWord.slice(0, 2), commonWord.slice(0, 3), commonWord.slice(0, 4), commonWord];
  const keystrokes = typed.map((text) => time(() => rankPages(parseQuery(text)!, candidates, LIMIT)).ms);
  console.log(`typing "${commonWord}" (prefixes, pages prepared): ${keystrokes.map((ms) => ms.toFixed(1)).join(' / ')} ms`);

  // The first query on a vault nothing has prepared, run in 8 ms slices: how long is the thread held at a time?
  const unprepared = buildCandidates(pages);
  const job = new RankingJob(parseQuery(rareWord)!, unprepared, LIMIT);
  const slices: number[] = [];
  let total = 0;

  while (true) {
    const slice = time(() => job.step(8));

    slices.push(slice.ms);
    total += slice.ms;

    if (slice.value) break;
  }

  console.log(
    `first query, nothing prepared, 8 ms slices: ${slices.length} slices, longest ${Math.max(...slices).toFixed(1)} ms, ` +
      `median ${median(slices).toFixed(1)} ms, total ${total.toFixed(0)} ms`
  );

  // Worst case: every page's Markdown parsed and mapped.
  const worstBefore = memoryMb();
  const parsed = time(() => candidates.forEach((candidate) => candidate.body.visible));
  const worstAfter = memoryMb();
  console.log(
    `all-parsed ${f(parsed.ms)} ms   +${perNote(worstAfter.heap - worstBefore.heap)} KB/note heap, +${perNote(worstAfter.buffers - worstBefore.buffers)} KB/note buffers` +
      `   (all notes: ${perNote(worstAfter.heap + worstAfter.buffers - before.heap - before.buffers)} KB/note)`
  );
}

const sizes = process.argv.slice(2).map(Number).filter(Boolean);

console.log(`node ${process.version} · ${process.platform} ${process.arch} · ${new Date().toISOString()}`);
if (!gc) console.log('(run with --expose-gc for stable heap numbers)');

for (const size of sizes.length > 0 ? sizes : [1000, 10000, 50000]) {
  benchmark(size);
}
