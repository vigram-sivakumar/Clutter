import { describe, expect, it } from 'vitest';

import { TaskExtractor } from './TaskExtractor';

// A task's due-date token may optionally carry a time of day.
describe('TaskExtractor with a timed @date', () => {
  const extractor = new TaskExtractor();

  it('a date-only task still gets its due date, with no due time', () => {
    const task = extractor.extract('- [ ] Pay rent @2026-10-23')[0];
    expect(task?.dueDate).toBe('2026-10-23');
    expect(task?.dueTime).toBeUndefined();
  });

  it('a timed bare date splits into dueDate and dueTime', () => {
    const task = extractor.extract('- [ ] Call @2026-10-23T07:00')[0];
    expect(task?.dueDate).toBe('2026-10-23');
    expect(task?.dueTime).toBe('07:00');
  });

  it('a timed legacy @due: value also splits into dueDate and dueTime', () => {
    const task = extractor.extract('- [ ] Call @due:2026-10-23T07:00')[0];
    expect(task?.dueDate).toBe('2026-10-23');
    expect(task?.dueTime).toBe('07:00');
  });

  it('a malformed trailing time is not read as a date mention at all', () => {
    const task = extractor.extract('- [ ] Call @2026-10-23T7:00')[0];
    expect(task?.dueDate).toBeUndefined();
    expect(task?.dueTime).toBeUndefined();
  });
});
