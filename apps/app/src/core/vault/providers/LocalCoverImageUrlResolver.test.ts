import { describe, expect, it, vi } from 'vitest';

import { LocalCoverImageUrlResolver } from './LocalCoverImageUrlResolver';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

describe('LocalCoverImageUrlResolver', () => {
  it('delegates to convertFileSrc', () => {
    const resolver = new LocalCoverImageUrlResolver();

    expect(resolver.toLoadableUrl('/vault/Assets/photo.png')).toBe(
      'asset:///vault/Assets/photo.png'
    );
  });
});
