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

  describe('fenced code blocks are never scanned for tags', () => {
    it('ignores a single #word inside a fenced code block', () => {
      const extractor = new TagExtractor();
      const occurrences = extractor.extract('```text\n#text\n```');

      expect(occurrences).toEqual([]);
    });

    it('ignores multiple hashtag-like strings inside one fenced code block', () => {
      const extractor = new TagExtractor();
      const occurrences = extractor.extract('```text\n#text\n#another-tag\n```');

      expect(occurrences).toEqual([]);
    });

    it('still detects a real tag outside the fenced code block, in the same document', () => {
      const extractor = new TagExtractor();
      const occurrences = extractor.extract(
        '#outside\n```text\n#text\n#another-tag\n```\n#alsoOutside'
      );

      expect(occurrences.map((o) => o.name)).toEqual(['outside', 'alsoOutside']);
    });

    it('ignores Markdown-looking content inside a fenced code block — headings and tags alike are never interpreted as editor syntax', () => {
      const extractor = new TagExtractor();
      const occurrences = extractor.extract('```markdown\n# Heading\n#tag\n> quote\n```');

      expect(occurrences).toEqual([]);
    });

    it('ignores fenced code regardless of the declared language, including no language at all', () => {
      const extractor = new TagExtractor();

      expect(extractor.extract('```\n#bare\n```')).toEqual([]);
      expect(extractor.extract('```javascript\n#js\n```')).toEqual([]);
      expect(extractor.extract('```markdown\n#md\n```')).toEqual([]);
    });
  });
});
