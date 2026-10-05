// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useWikiLinkPreviewHover,
  WIKILINK_PREVIEW_OPEN_DELAY_MS as OPEN,
} from './useWikiLinkPreviewHover';
import type { WikiLinkHoverTarget } from './wikiLinkHoverPreview';

const el = document.createElement('span');
const resolved = (pageId: string): WikiLinkHoverTarget => ({ kind: 'resolved', element: el, pageId });
const unresolved = (title: string): WikiLinkHoverTarget => ({ kind: 'unresolved', element: el, title });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useWikiLinkPreviewHover', () => {
  it('opens only after the hover settles — a brief pass-over opens nothing', () => {
    const { result } = renderHook(() => useWikiLinkPreviewHover());

    act(() => result.current.editorHandlers.enter(resolved('a')));
    act(() => void vi.advanceTimersByTime(OPEN - 1));
    expect(result.current.target).toBeNull();

    act(() => result.current.editorHandlers.leave());
    act(() => void vi.advanceTimersByTime(OPEN));
    expect(result.current.target).toBeNull();
  });

  it('opens after the delay for a resolved link and for an unresolved one', () => {
    const { result } = renderHook(() => useWikiLinkPreviewHover());

    act(() => result.current.editorHandlers.enter(resolved('a')));
    act(() => void vi.advanceTimersByTime(OPEN));
    expect(result.current.target).toMatchObject({ kind: 'resolved', pageId: 'a' });

    act(() => result.current.close());
    act(() => result.current.editorHandlers.enter(unresolved('My New Idea')));
    act(() => void vi.advanceTimersByTime(OPEN));
    expect(result.current.target).toMatchObject({ kind: 'unresolved', title: 'My New Idea' });
  });

  it('closes the moment the pointer leaves the link — no grace period', () => {
    const { result } = renderHook(() => useWikiLinkPreviewHover());
    act(() => result.current.editorHandlers.enter(unresolved('x')));
    act(() => void vi.advanceTimersByTime(OPEN));
    expect(result.current.target).not.toBeNull();

    act(() => result.current.editorHandlers.leave());
    expect(result.current.target).toBeNull();
  });

  it('closes the moment the pointer leaves the preview itself', () => {
    const { result } = renderHook(() => useWikiLinkPreviewHover());
    act(() => result.current.editorHandlers.enter(resolved('a')));
    act(() => void vi.advanceTimersByTime(OPEN));

    act(() => result.current.onPreviewEnter());
    expect(result.current.target).not.toBeNull();
    act(() => result.current.onPreviewLeave());
    expect(result.current.target).toBeNull();
  });

  it('moving to another link closes the first preview at once and opens the next after the usual delay', () => {
    const { result } = renderHook(() => useWikiLinkPreviewHover());
    act(() => result.current.editorHandlers.enter(resolved('a')));
    act(() => void vi.advanceTimersByTime(OPEN));

    act(() => result.current.editorHandlers.leave());
    act(() => result.current.editorHandlers.enter(unresolved('b')));
    expect(result.current.target).toBeNull();
    act(() => void vi.advanceTimersByTime(OPEN));
    expect(result.current.target).toMatchObject({ kind: 'unresolved', title: 'b' });
  });

  it('close() is immediate and clears pending timers', () => {
    const { result } = renderHook(() => useWikiLinkPreviewHover());
    act(() => result.current.editorHandlers.enter(resolved('a')));
    act(() => void vi.advanceTimersByTime(OPEN));

    act(() => result.current.close());
    expect(result.current.target).toBeNull();
  });
});
