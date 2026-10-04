import { describe, expect, it } from 'vitest';

import { pickAssetDisplayName, sanitizeAssetDisplayName } from './assetDisplayName';

describe('sanitizeAssetDisplayName', () => {
  it.each([
    ['Mountain at dawn', 'Mountain at dawn'],
    ['  Café  au   lait  ', 'Café au lait'],
    ['மலை காட்சி', 'மலை காட்சி'],
    ['🌄 Sunrise', '🌄 Sunrise'],
    ['Mountain.JPG', 'Mountain'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a-b-c-d-e-f-g-h-i-j'],
    ['../../etc/passwd', 'etc-passwd'],
    ['.hidden', 'hidden'],
    ['Trailing dots...', 'Trailing dots'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeAssetDisplayName(input)).toBe(expected);
  });

  it.each(['', '   ', '...', '---', 'image', 'Image', 'IMG', 'photo', 'Screenshot', 'IMG_1234', 'DSC 0042', '12345', 'https://example.com/a.png', '\u0000\u0001'])(
    'is null for %j (nothing useful to name a file after)',
    (input) => {
      expect(sanitizeAssetDisplayName(input)).toBeNull();
    }
  );

  it('bounds the length without cutting a character in half', () => {
    const name = sanitizeAssetDisplayName('🌄'.repeat(200))!;

    expect(Array.from(name).length).toBeLessThanOrEqual(80);
    expect(name).toMatch(/^(🌄)+$/u);
  });

  it('never contains a path separator or a control character', () => {
    for (const input of ['a/b', 'a\\b', 'a\nb', 'a\u0007b', '/..//x']) {
      expect(sanitizeAssetDisplayName(input) ?? '').not.toMatch(/[/\\\u0000-\u001f]/);
    }
  });
});

describe('pickAssetDisplayName', () => {
  it('takes the first usable candidate, skipping generic or empty ones', () => {
    expect(pickAssetDisplayName(['', 'image', 'Screenshot', 'Team offsite', 'Other'])).toBe('Team offsite');
  });

  it('is undefined when nothing is usable', () => {
    expect(pickAssetDisplayName(['', 'image'])).toBeUndefined();
    expect(pickAssetDisplayName([])).toBeUndefined();
  });
});
