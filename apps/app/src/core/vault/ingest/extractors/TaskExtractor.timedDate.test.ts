import { describe, expect, it } from 'vitest';

import { TaskExtractor } from './TaskExtractor';

// Task extraction is deliberately untouched by timed @date references.
describe('TaskExtractor with a timed @date', () => {
  const extractor = new TaskExtractor();

  it('a date-only task still gets its due date', () => {
    expect(extractor.extract('- [ ] Pay rent @2026-10-23')[0]?.dueDate).toBe('2026-10-23');
  });

  it('a timed date is not read as a bare date (task semantics unchanged: no new due-date source)', () => {
    expect(extractor.extract('- [ ] Call @2026-10-23T07:00')[0]?.dueDate).toBeUndefined();
  });
});
