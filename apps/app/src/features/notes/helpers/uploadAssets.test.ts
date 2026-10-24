import { describe, expect, it } from 'vitest';
import { uploadFailureMessage } from './uploadAssets';

describe('uploadFailureMessage', () => {
  it('is null when every picked file was added, or nothing was picked', () => {
    expect(uploadFailureMessage({ total: 3, failed: [] })).toBeNull();
    expect(uploadFailureMessage({ total: 0, failed: [] })).toBeNull();
  });

  it('names the file when the only one failed, on either kind of path', () => {
    expect(uploadFailureMessage({ total: 1, failed: ['/Users/me/photo.png'] })).toBe('Couldn’t add photo.png');
    expect(uploadFailureMessage({ total: 1, failed: ['C:\\Users\\me\\photo.png'] })).toBe('Couldn’t add photo.png');
  });

  it('reports a partial failure as such, and a total one as such', () => {
    expect(uploadFailureMessage({ total: 5, failed: ['/a.png', '/b.png'] })).toBe('Couldn’t add 2 of 5 files');
    expect(uploadFailureMessage({ total: 2, failed: ['/a.png', '/b.png'] })).toBe('Couldn’t add 2 files');
  });
});
