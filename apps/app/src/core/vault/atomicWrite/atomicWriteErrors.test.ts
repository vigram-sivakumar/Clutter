import { describe, expect, it } from 'vitest';

import {
  AtomicExternalChangeError,
  AtomicNotCommittedError,
  AtomicUncertainError,
  classifyWriteRefusal,
  type WriteRefusal,
} from './atomicWriteErrors';
import type { NotCommittedReason } from './AtomicWriteContract';

describe('classifyWriteRefusal: the UI words a category, never the writer’s own classes or text', () => {
  const expected: Record<NotCommittedReason, WriteRefusal> = {
    insufficientSpace: 'disk-full',
    permissionDenied: 'no-permission',
    readOnlyTarget: 'no-permission',
    destinationExists: 'name-taken',
    destinationAppeared: 'name-taken',
    unsupportedFilesystem: 'unsupported-location',
    unsupportedOperation: 'unsupported-location',
    outOfScope: 'unavailable',
    invalidTarget: 'unavailable',
    unsupportedSymlink: 'unavailable',
    notARegularFile: 'unavailable',
    staleExpected: 'unknown',
    targetChanged: 'unknown',
    metadataPreservationFailed: 'unknown',
    targetMissing: 'unknown',
    io: 'unknown',
  };

  it.each(Object.entries(expected) as [NotCommittedReason, WriteRefusal][])('%s is %s', (reason, category) => {
    expect(classifyWriteRefusal(new AtomicNotCommittedError(reason, 'detail'))).toBe(category);
  });

  it('everything that is not a typed refusal is unknown, whatever its text says', () => {
    expect(classifyWriteRefusal(new Error('unsupportedFilesystem'))).toBe('unknown');
    expect(classifyWriteRefusal(new AtomicUncertainError('x', []))).toBe('unknown');
    expect(classifyWriteRefusal(new AtomicExternalChangeError('/n.md'))).toBe('unknown');
    expect(classifyWriteRefusal('disk is full')).toBe('unknown');
    expect(classifyWriteRefusal(undefined)).toBe('unknown');
  });
});
