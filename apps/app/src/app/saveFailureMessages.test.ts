import { describe, expect, it } from 'vitest';

import {
  AtomicExternalChangeError,
  AtomicNotCommittedError,
  AtomicUncertainError,
} from '@core/vault/atomicWrite/atomicWriteErrors';
import {
  announcesProfileFailure,
  copyFailureMessage,
  describeCopyFailureReason,
  describeSpaceProfileFailure,
  isUnsupportedLocation,
  SPACE_SETTINGS_FAILED_MESSAGE,
  UNSUPPORTED_LOCATION_MESSAGE,
} from './saveFailureMessages';

describe('isUnsupportedLocation: decided by the failure’s type, never its text', () => {
  it.each(['unsupportedFilesystem', 'unsupportedOperation'] as const)('is true for the %s reason', (reason) => {
    expect(isUnsupportedLocation(new AtomicNotCommittedError(reason, 'x'))).toBe(true);
  });

  it('is false for every other atomic outcome and for anything unclassified', () => {
    for (const reason of ['insufficientSpace', 'permissionDenied', 'readOnlyTarget', 'staleExpected', 'io'] as const) {
      expect(isUnsupportedLocation(new AtomicNotCommittedError(reason, 'x'))).toBe(false);
    }
    expect(isUnsupportedLocation(new AtomicUncertainError('x', []))).toBe(false);
    expect(isUnsupportedLocation(new AtomicExternalChangeError('/n.md'))).toBe(false);
    expect(isUnsupportedLocation(new Error('unsupportedFilesystem'))).toBe(false); // the words alone are not enough
    expect(isUnsupportedLocation('unsupportedFilesystem')).toBe(false);
  });
});

describe('describeSpaceProfileFailure and announcesProfileFailure', () => {
  const unsupported = describeSpaceProfileFailure(new AtomicNotCommittedError('unsupportedFilesystem', 'exfat'));
  const independent = describeSpaceProfileFailure(new AtomicNotCommittedError('insufficientSpace', 'no room'));

  it('names the unsupported location precisely, and every other cause as a settings failure', () => {
    expect(unsupported).toEqual({ text: UNSUPPORTED_LOCATION_MESSAGE, unsupportedLocation: true });
    expect(independent).toEqual({ text: SPACE_SETTINGS_FAILED_MESSAGE, unsupportedLocation: false });
    expect(describeSpaceProfileFailure(new Error('boom')).unsupportedLocation).toBe(false);
    expect(describeSpaceProfileFailure(undefined).text).toBe(SPACE_SETTINGS_FAILED_MESSAGE);
  });

  it('does not announce an automatic write that failed only because the location is unsupported', () => {
    expect(announcesProfileFailure(unsupported, false)).toBe(false);
  });

  it('always announces a change the user asked for, and any independent failure', () => {
    expect(announcesProfileFailure(unsupported, true)).toBe(true);
    expect(announcesProfileFailure(independent, false)).toBe(true);
    expect(announcesProfileFailure(independent, true)).toBe(true);
  });
});

describe('copyFailureMessage', () => {
  it.each([
    ['insufficientSpace', 'Couldn’t save a copy: the disk is full'],
    ['permissionDenied', 'Couldn’t save a copy: Clutter can’t write to this folder'],
    ['readOnlyTarget', 'Couldn’t save a copy: Clutter can’t write to this folder'],
    ['destinationExists', 'Couldn’t save a copy: a note with that name already exists'],
    ['destinationAppeared', 'Couldn’t save a copy: a note with that name already exists'],
    ['unsupportedFilesystem', 'Couldn’t save a copy: this location can’t be saved to safely'],
    ['outOfScope', 'Couldn’t save a copy: this location isn’t available for saving'],
  ] as const)('says why for %s', (reason, message) => {
    expect(copyFailureMessage(new AtomicNotCommittedError(reason, 'detail with /private/path'))).toBe(message);
  });

  it('is only "Couldn’t save a copy" when no safe reason is known, and never repeats an error’s own text', () => {
    expect(copyFailureMessage(new AtomicNotCommittedError('io', 'EIO at /Users/me/x'))).toBe('Couldn’t save a copy');
    expect(copyFailureMessage(new Error('EACCES /Users/me/x'))).toBe('Couldn’t save a copy');
    expect(describeCopyFailureReason('nope')).toBeNull();
  });
});
