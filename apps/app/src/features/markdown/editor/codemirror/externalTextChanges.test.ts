import { describe, expect, it } from 'vitest';
import { ChangeSet, Text } from '@codemirror/state';
import { externalTextChanges } from './externalTextChanges';

function apply(before: string, after: string) {
  const diff = externalTextChanges(before, after);
  const changes = ChangeSet.of(diff.changes, before.length);
  expect(changes.apply(Text.of(before.split('\n'))).toString()).toBe(after);
  return { ...diff, changes };
}

describe('external text mapping', () => {
  it('keeps the unchanged middle of separated changes outside every changed range', () => {
    const { changes, precise } = apply(
      'first\nMIDDLE\nlast',
      'FIRST\nMIDDLE\nLAST'
    );
    expect(precise).toBe(true);
    changes.iterChangedRanges((from, to) =>
      expect(to <= 5 || from >= 13).toBe(true)
    );
  });

  it.each([
    ['', ''],
    ['', 'new'],
    ['old', ''],
    ['same', 'same'],
    ['a\r\nb\n', 'A\r\nb\nC'],
    ['🙂你好\n🌱', '🙂您好\n🌳'],
    ['aaaa', 'baabaa'],
    ['one two one', 'one three one'],
  ])('reconstructs %j → %j in UTF-16 document coordinates', (before, after) => {
    apply(before, after);
  });

  it('exhaustively reconstructs short strings and finds a minimum insertion/deletion script', () => {
    const strings = [''];
    let generation = [''];
    for (let size = 0; size < 4; size++) {
      generation = generation.flatMap((prefix) =>
        ['a', 'b', '\n'].map((letter) => prefix + letter)
      );
      strings.push(...generation);
    }
    for (const before of strings)
      for (const after of strings) {
        const { changes, precise } = apply(before, after);
        expect(precise).toBe(true);
        let cost = 0;
        changes.iterChangedRanges((a, b, c, d) => {
          cost += b - a + d - c;
        });
        const costs = Array.from({ length: before.length + 1 }, () =>
          new Array<number>(after.length + 1).fill(0)
        );
        for (let i = 0; i <= before.length; i++)
          for (let j = 0; j <= after.length; j++) {
            costs[i]![j] =
              i === 0
                ? j
                : j === 0
                  ? i
                  : before[i - 1] === after[j - 1]
                    ? costs[i - 1]![j - 1]!
                    : 1 + Math.min(costs[i - 1]![j]!, costs[i]![j - 1]!);
          }
        expect(cost).toBe(costs[before.length]![after.length]);
      }
  });

  it('maps sparse changes in a long note precisely', () => {
    const middle = 'unchanged\n'.repeat(10_000);
    const { precise } = apply(`old\n${middle}old`, `new\n${middle}new`);
    expect(precise).toBe(true);
  });

  it('bounds search work even when two sparse changes enclose a very large equal span', () => {
    const middle = 's'.repeat(1_000_100);
    expect(apply(`x${middle}x`, `y${middle}y`).precise).toBe(false);
  });

  it('marks a budget-limited replacement unsafe for history while still reproducing the exact document', () => {
    expect(apply('a'.repeat(2000), 'b'.repeat(2000)).precise).toBe(false);
  });
});
