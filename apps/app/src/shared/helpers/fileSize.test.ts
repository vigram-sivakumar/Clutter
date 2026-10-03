import { describe, expect, it } from 'vitest';

import { formatFileSize } from './fileSize';

describe('formatFileSize', () => {
  it('uses decimal units with one decimal under ten and none above', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(812)).toBe('812 B');
    expect(formatFileSize(1000)).toBe('1 KB');
    expect(formatFileSize(1234)).toBe('1.2 KB');
    expect(formatFileSize(12_345)).toBe('12 KB');
    expect(formatFileSize(1_234_567)).toBe('1.2 MB');
    expect(formatFileSize(3_500_000_000)).toBe('3.5 GB');
  });

  it('rolls a value that rounds up to 1000 into the next unit', () => {
    expect(formatFileSize(999_999)).toBe('1 MB');
  });

  it('is empty for an invalid size', () => {
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
  });
});
