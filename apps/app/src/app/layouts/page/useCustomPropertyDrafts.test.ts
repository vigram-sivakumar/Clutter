// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCustomPropertyDrafts } from './useCustomPropertyDrafts';

describe('useCustomPropertyDrafts', () => {
  it('adds unnamed drafts of a type, with distinct ids', () => {
    const { result } = renderHook(() => useCustomPropertyDrafts('p1'));

    act(() => result.current.add('date'));
    act(() => result.current.add('text'));

    expect(result.current.drafts).toEqual([
      { id: 0, type: 'date' },
      { id: 1, type: 'text' },
    ]);
  });

  it('names a draft and removes it', () => {
    const { result } = renderHook(() => useCustomPropertyDrafts('p1'));
    act(() => result.current.add('number'));

    act(() => result.current.name(0, 'Estimate'));
    expect(result.current.drafts).toEqual([{ id: 0, type: 'number', name: 'Estimate' }]);

    act(() => result.current.remove(0));
    expect(result.current.drafts).toEqual([]);
  });

  it('drops every draft when the page changes — they are transient, never carried to another note', () => {
    const { result, rerender } = renderHook(({ pageId }) => useCustomPropertyDrafts(pageId), {
      initialProps: { pageId: 'p1' },
    });
    act(() => result.current.add('url'));
    expect(result.current.drafts).toHaveLength(1);

    rerender({ pageId: 'p2' });
    expect(result.current.drafts).toEqual([]);

    // A new draft belongs to the new page, and the old one doesn't come back.
    act(() => result.current.add('text'));
    expect(result.current.drafts).toHaveLength(1);
    rerender({ pageId: 'p1' });
    expect(result.current.drafts).toEqual([]);
  });
});
