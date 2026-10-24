import { describe, expect, it } from 'vitest';
import type { TagBatchResult } from '@core/application/tags/TagOperations';
import { tagBatchFailureMessage } from './tagBatchFeedback';

const result = (patch: Partial<TagBatchResult>): TagBatchResult => ({
  attemptedPageCount: 5,
  updatedPageIds: ['a', 'b', 'c', 'd', 'e'],
  skipped: [],
  failed: [],
  complete: true,
  ...patch,
});

describe('tagBatchFailureMessage', () => {
  it('is null for a complete batch', () => {
    expect(tagBatchFailureMessage(result({}), 'delete')).toBeNull();
    expect(tagBatchFailureMessage(result({}), 'restyle')).toBeNull();
  });

  it('distinguishes a partial result from a total failure', () => {
    const partial = result({
      updatedPageIds: ['a', 'b', 'c'],
      failed: [{ pageId: 'd', path: 'd.md', message: 'x' }],
      skipped: [{ pageId: 'e', path: 'e.md', reason: 'changed-on-disk' }],
      complete: false,
    });
    const total = result({
      updatedPageIds: [],
      failed: [{ pageId: 'a', path: 'a.md', message: 'x' }],
      complete: false,
    });

    expect(tagBatchFailureMessage(partial, 'delete')).toBe('Couldn’t remove the tag from 2 of 5 notes');
    expect(tagBatchFailureMessage(partial, 'restyle')).toBe('Couldn’t restyle 2 of 5 notes');
    expect(tagBatchFailureMessage(total, 'delete')).toBe('Couldn’t delete the tag');
    expect(tagBatchFailureMessage(total, 'restyle')).toBe('Couldn’t restyle the tags');
  });
});
