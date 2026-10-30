// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';

const { warmCoverImages } = vi.hoisted(() => ({ warmCoverImages: vi.fn(async () => {}) }));
vi.mock('@shared/helpers/coverImagePreloader', () => ({ warmCoverImages }));

import { coverImageUrlsToWarm, useCoverImageWarmup, WARM_COVER_LIMIT } from './coverWarmup';

function item(cover: string | null, coverHidden = false, archived = false) {
  return { id: `${cover}-${archived}`, path: archived ? '/v/Archive/x.md' : '/v/x.md', metadata: { cover, coverHidden } };
}

function appWith(pages: ReturnType<typeof item>[], folders: ReturnType<typeof item>[] = []): Application {
  return {
    vault: {
      pages: () => pages[Symbol.iterator](),
      folders: () => folders[Symbol.iterator](),
      isPageEffectivelyArchived: (p: { path: string }) => p.path.includes('/Archive/'),
      isFolderEffectivelyArchived: (id: string) => id.endsWith('-true'),
    },
    resolveCoverImageForDisplay: (cover: string | null) =>
      cover === null ? null : cover.startsWith('http') ? cover : cover === 'Assets/gone.png' ? null : `asset://localhost/v/${cover}`,
  } as unknown as Application;
}

describe('coverImageUrlsToWarm', () => {
  it('lists each shown cover once, resolved the way the page resolves it', () => {
    const app = appWith(
      [item('https://images.unsplash.com/a?w=4800'), item('https://images.unsplash.com/a?w=4800'), item('Assets/mountain.png'), item(null)],
      [item('https://images.unsplash.com/f?w=4800')]
    );

    expect(coverImageUrlsToWarm(app)).toEqual([
      'https://images.unsplash.com/a?w=4800',
      'asset://localhost/v/Assets/mountain.png',
      'https://images.unsplash.com/f?w=4800',
    ]);
  });

  it('skips hidden covers, archived items and a cover whose file is gone', () => {
    const app = appWith(
      [item('https://x/hidden', true), item('https://x/archived', false, true), item('Assets/gone.png'), item('https://x/shown')],
      [item('https://x/archived-folder', false, true)]
    );

    expect(coverImageUrlsToWarm(app)).toEqual(['https://x/shown']);
  });

  it('stops at the limit', () => {
    const app = appWith(Array.from({ length: 30 }, (_, i) => item(`https://x/${i}`)));

    expect(coverImageUrlsToWarm(app)).toHaveLength(WARM_COVER_LIMIT);
    expect(coverImageUrlsToWarm(app, 3)).toHaveLength(3);
  });
});

describe('useCoverImageWarmup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    warmCoverImages.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('warms the covers only after the app has settled, not at startup', () => {
    renderHook(() => useCoverImageWarmup(appWith([item('https://x/a')])));

    expect(warmCoverImages).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_600);

    expect(warmCoverImages).toHaveBeenCalledTimes(1);
    expect((warmCoverImages.mock.calls[0] as unknown as [string[]])[0]).toEqual(['https://x/a']);
  });

  it('does nothing if the app goes away first', () => {
    const { unmount } = renderHook(() => useCoverImageWarmup(appWith([item('https://x/a')])));
    unmount();
    vi.advanceTimersByTime(5_000);

    expect(warmCoverImages).not.toHaveBeenCalled();
  });
});
