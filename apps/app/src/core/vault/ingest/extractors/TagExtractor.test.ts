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

  it('preserves separator characters (-/_) exactly as typed — no normalization or rewriting of source spelling', () => {
    const extractor = new TagExtractor();
    const occurrences = extractor.extract(
      '#Product-design #product_design #PRODUCT-DESIGN'
    );

    expect(occurrences.map((o) => o.name)).toEqual([
      'Product-design',
      'product_design',
      'PRODUCT-DESIGN',
    ]);
  });

  it('a space terminates a tag — Bear-style "#tag with spaces#" is NOT supported as one tag', () => {
    const extractor = new TagExtractor();
    const occurrences = extractor.extract('#product design#');

    // Only "product" is a tag; "design#" is ordinary text (a bare "#"
    // preceded by a non-whitespace character, "n", is not a valid tag
    // start per isValidTagPrecedingContext/TagExtractor's own (^|\s) rule).
    expect(occurrences.map((o) => o.name)).toEqual(['product']);
  });
});
