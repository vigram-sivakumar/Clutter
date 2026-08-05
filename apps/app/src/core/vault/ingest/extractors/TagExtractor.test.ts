import { describe, expect, it } from 'vitest';
import { TagExtractor } from './TagExtractor';

describe('TagExtractor', () => {
  it('preserves exactly what the user typed — no rewriting or case normalization', () => {
    const extractor = new TagExtractor();
    const occurrences = extractor.extract('#Project #project #ProJET #UI #iOS');

    expect(occurrences.map((o) => o.name)).toEqual([
      'Project',
      'project',
      'ProJET',
      'UI',
      'iOS',
    ]);
  });

  it('does not deduplicate at extraction time — that is TagBuilder’s job, not the extractor’s', () => {
    const extractor = new TagExtractor();
    const occurrences = extractor.extract('#project appears twice: #project');

    expect(occurrences).toHaveLength(2);
  });
});
