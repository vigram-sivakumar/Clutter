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
        startOffset: 0,
        endOffset: 14,
      },
      {
        completed: true,
        text: 'Walk the dog',
        dueDate: undefined,
        completedAt: undefined,
        rawText: '- [x] Walk the dog',
        startOffset: 15,
        endOffset: 33,
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
        startOffset: 0,
        endOffset: 38,
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
        startOffset: 0,
        endOffset: 41,
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
      startOffset: 0,
      endOffset: 57,
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
        startOffset: 0,
        endOffset: 37,
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
        startOffset: 0,
        endOffset: 28,
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
        startOffset: 0,
        endOffset: 38,
      },
    ]);
  });

  it('captures the exact original line as rawText, unmodified by metadata stripping', () => {
    const line = '  - [ ] Indented task @due:2026-08-05 @energy:high';
    const tasks = extractor.extract(line);

    expect(tasks[0]!.rawText).toBe(line);
  });

  it('gives two textually-identical task lines distinct, correctly-ordered offsets', () => {
    const content = [
      '- [ ] Buy groceries',
      '- [ ] Finish report',
      '- [ ] Buy groceries',
    ].join('\n');

    const tasks = extractor.extract(content);

    expect(tasks).toHaveLength(3);
    expect(tasks[0]!.rawText).toBe(tasks[2]!.rawText);
    expect(tasks[0]!.startOffset).not.toBe(tasks[2]!.startOffset);

    for (const task of tasks) {
      expect(content.slice(task.startOffset, task.endOffset)).toBe(task.rawText);
    }

    expect(tasks[0]).toMatchObject({ startOffset: 0, endOffset: 19 });
    expect(tasks[1]).toMatchObject({ startOffset: 20, endOffset: 39 });
    expect(tasks[2]).toMatchObject({ startOffset: 40, endOffset: 59 });
  });

  it('preserves leading indentation in the computed offset range', () => {
    const content = 'Some paragraph.\n  - [ ] Indented task';
    const tasks = extractor.extract(content);

    expect(tasks).toHaveLength(1);
    // startOffset points at the indentation itself, not the `-` marker.
    expect(content.slice(tasks[0]!.startOffset, tasks[0]!.endOffset)).toBe('  - [ ] Indented task');
  });

  describe('bare @YYYY-MM-DD Date references (v1: no @due: required)', () => {
    it('a bare Date reference on a task line becomes its due date', () => {
      const line = '- [ ] Finish report @2026-08-20';
      const tasks = extractor.extract(line);

      expect(tasks).toEqual([
        {
          completed: false,
          text: 'Finish report @2026-08-20',
          dueDate: '2026-08-20',
          completedAt: undefined,
          rawText: line,
          startOffset: 0,
          endOffset: 31,
        },
      ]);
    });

    it('unlike @due:, the bare Date reference is NOT stripped from text — it is real content, not hidden metadata', () => {
      const tasks = extractor.extract('- [ ] Finish report @2026-08-20');

      expect(tasks[0]!.text).toContain('@2026-08-20');
    });

    it('a Date reference in ordinary (non-task) content does not produce a task at all', () => {
      const tasks = extractor.extract('The meeting is on @2026-08-20.');

      expect(tasks).toEqual([]);
    });

    it('a task with no Date reference and no @due: has no due date, same as before this change', () => {
      const tasks = extractor.extract('- [ ] Buy milk');

      expect(tasks[0]!.dueDate).toBeUndefined();
    });

    it('legacy @due: still wins over a bare Date reference when both are present on the same line', () => {
      const line = '- [ ] Reschedule @due:2026-08-01 to @2026-08-20';
      const tasks = extractor.extract(line);

      expect(tasks[0]!.dueDate).toBe('2026-08-01');
    });

    it('multiple bare Date references on one task line: the FIRST one becomes the due date, deterministically', () => {
      const line = '- [ ] Moved from @2026-08-01 to @2026-08-20';
      const tasks = extractor.extract(line);

      expect(tasks[0]!.dueDate).toBe('2026-08-01');
      // Neither is stripped — both remain visible, real content.
      expect(tasks[0]!.text).toContain('@2026-08-01');
      expect(tasks[0]!.text).toContain('@2026-08-20');
    });

    it('a shape-valid but calendar-invalid bare Date is still captured as dueDate — no validation here, matching @due:\'s own pre-existing leniency', () => {
      const tasks = extractor.extract('- [ ] Odd date @2026-13-45');

      expect(tasks[0]!.dueDate).toBe('2026-13-45');
    });

    it('foo@2026-08-20 (no preceding whitespace) is not recognized as a Date reference at all', () => {
      const tasks = extractor.extract('- [ ] Ref foo@2026-08-20');

      expect(tasks[0]!.dueDate).toBeUndefined();
    });

    it('@2026-08-20x (trailing letter) is not recognized as a Date reference', () => {
      const tasks = extractor.extract('- [ ] Ref @2026-08-20x');

      expect(tasks[0]!.dueDate).toBeUndefined();
    });
  });

  describe('fenced code blocks are never scanned for tasks', () => {
    it('detects a task outside a fence', () => {
      const tasks = extractor.extract('- [ ] Real task');

      expect(tasks.map((t) => t.text)).toEqual(['Real task']);
    });

    it('ignores a task marker inside a ``` fence', () => {
      const tasks = extractor.extract('```text\n- [ ] Not a task\n```');

      expect(tasks).toEqual([]);
    });

    it('ignores a task marker inside a ~~~ fence', () => {
      const tasks = extractor.extract('~~~text\n- [ ] Not a task\n~~~');

      expect(tasks).toEqual([]);
    });

    it('ignores a checked task marker inside a fence', () => {
      const tasks = extractor.extract('```text\n- [x] Not a task either\n```');

      expect(tasks).toEqual([]);
    });

    it('detects only the tasks outside the fence when real tasks surround it', () => {
      const content = [
        '- [ ] Real task',
        '',
        '```text',
        '- [ ] This is not a task',
        '- [x] Neither is this',
        '```',
        '',
        '- [ ] Another real task',
      ].join('\n');

      const tasks = extractor.extract(content);

      expect(tasks.map((t) => t.text)).toEqual(['Real task', 'Another real task']);
    });

    it('ignores tasks inside multiple fenced blocks in the same document', () => {
      const content = [
        '- [ ] Before',
        '```text',
        '- [ ] Inside first fence',
        '```',
        '- [ ] Between',
        '~~~text',
        '- [ ] Inside second fence',
        '~~~',
        '- [ ] After',
      ].join('\n');

      const tasks = extractor.extract(content);

      expect(tasks.map((t) => t.text)).toEqual(['Before', 'Between', 'After']);
    });
  });
});
