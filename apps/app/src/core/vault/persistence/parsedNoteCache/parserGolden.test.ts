import { describe, expect, it } from 'vitest';
import { FrontmatterParser } from '../../ingest/FrontmatterParser';
import { GOLDEN_SAMPLES } from './parseCorpus';
import { PARSER_VERSION } from './parserFingerprint';

/**
 * Pins what `FrontmatterParser.parse` returns for a fixed corpus, together
 * with `PARSER_VERSION`. The parsed-note cache trusts a matching content hash
 * only while the parser is unchanged (ADR-053); this test is what makes a
 * forgotten version bump impossible to ship silently — and it also fails when
 * a dependency upgrade changes parse output.
 *
 * If it fails: parser/analysis output changed. Bump PARSER_VERSION in
 * parserFingerprint.ts (invalidating every existing cache), then regenerate
 * the golden file with `npx vitest run parserGolden -u` and review the diff.
 */
describe('parser golden corpus', () => {
  it('matches the pinned output for the current PARSER_VERSION', async () => {
    const parser = new FrontmatterParser();
    const samples = Object.fromEntries(
      Object.entries(GOLDEN_SAMPLES).map(([name, text]) => [
        name,
        parser.parse(text),
      ])
    );
    // undefined-valued keys are made visible (they matter to the cache).
    const text = JSON.stringify(
      { parserVersion: PARSER_VERSION, samples },
      (_k, v) => (v === undefined ? '<undefined>' : v),
      1
    );
    try {
      await expect(text).toMatchFileSnapshot('./__golden__/parserCorpus.json');
    } catch (error) {
      throw new Error(
        'Parser output changed. Bump PARSER_VERSION (parserFingerprint.ts) so existing parsed-note caches are invalidated, ' +
          'then regenerate with `npx vitest run parserGolden -u`.\n\n' +
          String((error as Error).message)
      );
    }
  });
});
