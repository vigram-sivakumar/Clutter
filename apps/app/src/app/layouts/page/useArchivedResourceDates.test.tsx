// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';

import { useArchivedResourceDates } from './useArchivedResourceDates';

const applicationWith = (entries: Record<string, { originalPath: string; archivedAt?: string }>) => {
  const read = vi.fn().mockResolvedValue(new Map(Object.entries(entries)));
  return { application: { resourceArchiveStore: { read } } as unknown as Application, read };
};

describe('useArchivedResourceDates — the Archive page\'s read of the archive record', () => {
  it('maps each archived path to the date the app recorded; an entry with no date has none', async () => {
    const { application } = applicationWith({
      '/vault/Archive/a.png': { originalPath: '/vault/a.png', archivedAt: '2026-10-06T09:30:00.000Z' },
      '/vault/Archive/old.png': { originalPath: '/vault/old.png' },
    });

    const { result } = renderHook(() => useArchivedResourceDates(application, ['/vault/Archive/a.png', '/vault/Archive/old.png'], true));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('/vault/Archive/a.png')).toBe('2026-10-06T09:30:00.000Z');
    expect(result.current.has('/vault/Archive/old.png')).toBe(false);
  });

  it('reads nothing at all unless it is the Archive', async () => {
    const { application, read } = applicationWith({});

    renderHook(() => useArchivedResourceDates(application, [], false));
    await act(async () => {});

    expect(read).not.toHaveBeenCalled();
  });

  it('re-reads when the set of archived files changes (a file archived or restored)', async () => {
    const { application, read } = applicationWith({});

    const { rerender } = renderHook(({ paths }) => useArchivedResourceDates(application, paths, true), {
      initialProps: { paths: ['/vault/Archive/a.png'] },
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    rerender({ paths: ['/vault/Archive/a.png', '/vault/Archive/b.png'] });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('an unreadable record means no dates, not a broken page', async () => {
    const application = { resourceArchiveStore: { read: vi.fn().mockRejectedValue(new Error('unreadable')) } } as unknown as Application;

    const { result } = renderHook(() => useArchivedResourceDates(application, ['/vault/Archive/a.png'], true));
    await act(async () => {});

    expect(result.current.size).toBe(0);
  });
});
