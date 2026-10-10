import { describe, expect, it } from 'vitest';
import { mergeConcurrentEdit } from './mergeConcurrentEdit';

describe('mergeConcurrentEdit', () => {
  it('keeps an external append and the local edit made at the same point, the external text first', () => {
    expect(mergeConcurrentEdit('Hello', 'Hello!', 'Hello [ext]')).toBe(
      'Hello [ext]!'
    );
  });

  it('keeps an external change before the local edit, shifting the local one past it', () => {
    expect(mergeConcurrentEdit('one two', 'one two!', '>> one two')).toBe(
      '>> one two!'
    );
  });

  it('keeps an external change in the middle and a local edit at the end (and the reverse)', () => {
    expect(
      mergeConcurrentEdit('aaa bbb ccc', 'aaa bbb ccc!', 'aaa BBB ccc')
    ).toBe('aaa BBB ccc!');
    expect(
      mergeConcurrentEdit('aaa bbb ccc', 'X aaa bbb ccc', 'aaa bbb CCC')
    ).toBe('X aaa bbb CCC');
  });

  it('handles deletions on either side', () => {
    expect(
      mergeConcurrentEdit('one two three', 'one three', 'one two three!')
    ).toBe('one three!');
    expect(
      mergeConcurrentEdit('one two three', 'one two three!', 'one three')
    ).toBe('one three!');
  });

  it('puts the external insert first when both insert at the same position', () => {
    expect(mergeConcurrentEdit('ab', 'aXb', 'aYb')).toBe('aYXb');
  });

  it('lets the local text win when the two edits overlap', () => {
    expect(
      mergeConcurrentEdit('aaa bbb ccc', 'aaa bXb ccc', 'aaa bYYb ccc')
    ).toBe('aaa bXb ccc');
    expect(mergeConcurrentEdit('abcdef', 'abXef', 'abYYYef')).toBe('abXef');
  });

  it('is the identity for the local text when nothing external happened', () => {
    expect(mergeConcurrentEdit('same', 'same!', 'same')).toBe('same!');
  });

  it('the merged text contains both edits for every disjoint pair on a sample document', () => {
    const base = 'alpha\nbeta\ngamma\ndelta';
    const edits = [
      (t: string) => t.replace('alpha', 'ALPHA'),
      (t: string) => t.replace('gamma', 'gamma!!'),
      (t: string) => `${t}\nepsilon`,
      (t: string) => t.replace('beta\n', ''),
    ];

    for (const local of edits) {
      for (const remote of edits) {
        if (local === remote) continue;
        const merged = mergeConcurrentEdit(base, local(base), remote(base));
        // Applying them in either order to the base gives the same text when they are independent.
        expect([local(remote(base)), remote(local(base))]).toContain(merged);
      }
    }
  });
});
