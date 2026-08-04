import { describe, expect, it } from 'vitest';
import { TaskExtractor } from './TaskExtractor';

describe('TaskExtractor', () => {
  const extractor = new TaskExtractor();

  it('extracts plain tasks with no metadata', () => {
    const tasks = extractor.extract('- [ ] Buy milk\n- [x] Walk the dog');

    expect(tasks).toEqual([
      { completed: false, text: 'Buy milk', dueDate: undefined, completedAt: undefined },
      { completed: true, text: 'Walk the dog', dueDate: undefined, completedAt: undefined },
    ]);
  });

  it('extracts @due into dueDate and strips it from the text', () => {
    const tasks = extractor.extract('- [ ] Collect the bill @due:2026-08-05');

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill',
        dueDate: '2026-08-05',
        completedAt: undefined,
      },
    ]);
  });

  it('extracts @completed into completedAt and strips it from the text', () => {
    const tasks = extractor.extract('- [x] Submit report @completed:2026-08-04');

    expect(tasks).toEqual([
      {
        completed: true,
        text: 'Submit report',
        dueDate: undefined,
        completedAt: '2026-08-04',
      },
    ]);
  });

  it('extracts multiple recognized metadata tokens regardless of order', () => {
    const inOrder = extractor.extract(
      '- [x] Submit report @due:2026-08-05 @completed:2026-08-04'
    );
    const reversed = extractor.extract(
      '- [x] Submit report @completed:2026-08-04 @due:2026-08-05'
    );

    const expected = [
      {
        completed: true,
        text: 'Submit report',
        dueDate: '2026-08-05',
        completedAt: '2026-08-04',
      },
    ];

    expect(inOrder).toEqual(expected);
    expect(reversed).toEqual(expected);
  });

  it('ignores unrecognized metadata keys, leaving them in the text untouched', () => {
    const tasks = extractor.extract('- [ ] Collect the bill @priority:high');

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill @priority:high',
        dueDate: undefined,
        completedAt: undefined,
      },
    ]);
  });

  it('does not throw and does not extract a value from malformed metadata', () => {
    const tasks = extractor.extract('- [ ] Collect the bill @due:');

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill @due:',
        dueDate: undefined,
        completedAt: undefined,
      },
    ]);
  });

  it('is pure and deterministic — same input always yields the same output', () => {
    const line = '- [ ] Collect the bill @due:2026-08-05';

    expect(extractor.extract(line)).toEqual(extractor.extract(line));
  });

  it('collapses only the whitespace left behind by a removed token', () => {
    const tasks = extractor.extract('- [ ] Collect @due:2026-08-05 the bill');

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill',
        dueDate: '2026-08-05',
        completedAt: undefined,
      },
    ]);
  });
});
