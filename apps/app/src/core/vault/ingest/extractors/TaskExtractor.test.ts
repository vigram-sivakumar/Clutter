import { describe, expect, it } from 'vitest';
import { TaskExtractor } from './TaskExtractor';

describe('TaskExtractor', () => {
  const extractor = new TaskExtractor();

  it('extracts plain tasks with no metadata', () => {
    const tasks = extractor.extract('- [ ] Buy milk\n- [x] Walk the dog');

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Buy milk',
        dueDate: undefined,
        completedAt: undefined,
        rawText: '- [ ] Buy milk',
      },
      {
        completed: true,
        text: 'Walk the dog',
        dueDate: undefined,
        completedAt: undefined,
        rawText: '- [x] Walk the dog',
      },
    ]);
  });

  it('extracts @due into dueDate and strips it from the text', () => {
    const line = '- [ ] Collect the bill @due:2026-08-05';
    const tasks = extractor.extract(line);

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill',
        dueDate: '2026-08-05',
        completedAt: undefined,
        rawText: line,
      },
    ]);
  });

  it('extracts @completed into completedAt and strips it from the text', () => {
    const line = '- [x] Submit report @completed:2026-08-04';
    const tasks = extractor.extract(line);

    expect(tasks).toEqual([
      {
        completed: true,
        text: 'Submit report',
        dueDate: undefined,
        completedAt: '2026-08-04',
        rawText: line,
      },
    ]);
  });

  it('extracts multiple recognized metadata tokens regardless of order', () => {
    const lineInOrder = '- [x] Submit report @due:2026-08-05 @completed:2026-08-04';
    const lineReversed = '- [x] Submit report @completed:2026-08-04 @due:2026-08-05';

    const inOrder = extractor.extract(lineInOrder);
    const reversed = extractor.extract(lineReversed);

    const expectedBase = {
      completed: true,
      text: 'Submit report',
      dueDate: '2026-08-05',
      completedAt: '2026-08-04',
    };

    expect(inOrder).toEqual([{ ...expectedBase, rawText: lineInOrder }]);
    expect(reversed).toEqual([{ ...expectedBase, rawText: lineReversed }]);
  });

  it('ignores unrecognized metadata keys, leaving them in the text untouched', () => {
    const line = '- [ ] Collect the bill @priority:high';
    const tasks = extractor.extract(line);

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill @priority:high',
        dueDate: undefined,
        completedAt: undefined,
        rawText: line,
      },
    ]);
  });

  it('does not throw and does not extract a value from malformed metadata', () => {
    const line = '- [ ] Collect the bill @due:';
    const tasks = extractor.extract(line);

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill @due:',
        dueDate: undefined,
        completedAt: undefined,
        rawText: line,
      },
    ]);
  });

  it('is pure and deterministic — same input always yields the same output', () => {
    const line = '- [ ] Collect the bill @due:2026-08-05';

    expect(extractor.extract(line)).toEqual(extractor.extract(line));
  });

  it('collapses only the whitespace left behind by a removed token', () => {
    const line = '- [ ] Collect @due:2026-08-05 the bill';
    const tasks = extractor.extract(line);

    expect(tasks).toEqual([
      {
        completed: false,
        text: 'Collect the bill',
        dueDate: '2026-08-05',
        completedAt: undefined,
        rawText: line,
      },
    ]);
  });

  it('captures the exact original line as rawText, unmodified by metadata stripping', () => {
    const line = '  - [ ] Indented task @due:2026-08-05 @energy:high';
    const tasks = extractor.extract(line);

    expect(tasks[0]!.rawText).toBe(line);
  });
});
