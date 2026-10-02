import { describe, expect, it } from 'vitest';

import { parseWebUrl } from './parseWebUrl';

describe('parseWebUrl', () => {
  it('accepts http and https URLs', () => {
    expect(parseWebUrl('https://example.com/a?b=1')?.hostname).toBe('example.com');
    expect(parseWebUrl('http://example.com')?.protocol).toBe('http:');
  });

  it('rejects non-web schemes and non-URLs', () => {
    expect(parseWebUrl('javascript:alert(1)')).toBeNull();
    expect(parseWebUrl('data:text/plain,hi')).toBeNull();
    expect(parseWebUrl('file:///etc/hosts')).toBeNull();
    expect(parseWebUrl('example.com')).toBeNull();
    expect(parseWebUrl('not a url')).toBeNull();
  });
});
