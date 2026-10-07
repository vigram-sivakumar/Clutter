import { describe, expect, it } from 'vitest';

import { scanBareDomain } from './bareDomainScanner';

describe('scanBareDomain', () => {
  describe('recognized bare domains', () => {
    const positive: readonly string[] = [
      'google.com',
      'example.com',
      'example.org',
      'example.co.uk',
      'example.co.in',
      'example.ai',
      'example.me',
      'example.co',
      'example.dev',
      'example.tech',
      'google.com/path',
      'google.com/path?q=test',
    ];

    for (const input of positive) {
      it(`recognizes ${JSON.stringify(input)}`, () => {
        const match = scanBareDomain(input, 0);
        expect(match).not.toBeNull();
        expect(match?.text).toBe(input);
        expect(match?.end).toBe(input.length);
      });
    }
  });

  describe('remains plain text', () => {
    const negative: readonly string[] = [
      'file.txt',
      'config.json',
      'app.js',
      'Node.js',
      'v1.2',
      '12.50',
      'e.g.',
      '192.168.1.1',
      'notes.md',
      'build.sh',
      'main.rs',
      'libfoo.so',
    ];

    for (const input of negative) {
      it(`does not recognize ${JSON.stringify(input)}`, () => {
        expect(scanBareDomain(input, 0)).toBeNull();
      });
    }
  });

  describe('excluded ccTLDs are a named exception, not a general rule', () => {
    it('still recognizes other two-letter ccTLDs not in the exclusion set', () => {
      // sanity check the exclusion set is narrow: "to" (Tonga) is a real
      // two-letter ccTLD and is not one of the four named exceptions.
      expect(scanBareDomain('example.to', 0)?.text).toBe('example.to');
    });

    it('rejects exactly the four named exceptions, case-insensitively', () => {
      expect(scanBareDomain('notes.MD', 0)).toBeNull();
      expect(scanBareDomain('build.Sh', 0)).toBeNull();
      expect(scanBareDomain('main.RS', 0)).toBeNull();
      expect(scanBareDomain('libfoo.SO', 0)).toBeNull();
    });
  });

  describe('within surrounding prose (scan starting at the domain itself)', () => {
    const cases: ReadonlyArray<{ sentence: string; domainStart: number; expected: string | null }> = [
      { sentence: 'See notes.md for details.', domainStart: 4, expected: null },
      { sentence: 'Run build.sh after installing dependencies.', domainStart: 4, expected: null },
      { sentence: 'The Rust code is in main.rs.', domainStart: 20, expected: null },
      { sentence: 'Load libfoo.so at runtime.', domainStart: 5, expected: null },
      { sentence: 'Visit example.dev for documentation.', domainStart: 6, expected: 'example.dev' },
      { sentence: 'Visit example.tech for more information.', domainStart: 6, expected: 'example.tech' },
      { sentence: 'Visit google.com for more information.', domainStart: 6, expected: 'google.com' },
    ];

    for (const { sentence, domainStart, expected } of cases) {
      it(`${JSON.stringify(sentence)} -> ${expected === null ? 'no match' : JSON.stringify(expected)}`, () => {
        const match = scanBareDomain(sentence, domainStart);
        if (expected === null) {
          expect(match).toBeNull();
        } else {
          expect(match?.text).toBe(expected);
        }
      });
    }
  });

  describe('trailing sentence punctuation is trimmed', () => {
    it('does not swallow a closing sentence period', () => {
      const match = scanBareDomain('google.com.', 0);
      expect(match?.text).toBe('google.com');
      expect(match?.end).toBe('google.com'.length);
    });

    it('does not swallow an enclosing closing parenthesis', () => {
      const match = scanBareDomain('google.com)', 0);
      expect(match?.text).toBe('google.com');
    });
  });

  describe('word-boundary and shape edge cases handled by the scanner itself', () => {
    it('rejects a single label with no dot at all', () => {
      expect(scanBareDomain('google', 0)).toBeNull();
    });

    it('rejects when the final label is shorter than 2 characters', () => {
      expect(scanBareDomain('e.g.', 0)).toBeNull();
    });

    it('rejects an all-numeric final label (version-number shape)', () => {
      expect(scanBareDomain('v1.2', 0)).toBeNull();
      expect(scanBareDomain('12.50', 0)).toBeNull();
    });

    it('rejects an IP-address shape', () => {
      expect(scanBareDomain('192.168.1.1', 0)).toBeNull();
    });
  });
});
