// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import {
  CoverImageActionsProvider,
  isRemoteCoverReference,
  useCoverImageActions,
} from './CoverImageActionsContext';

describe('CoverImageActionsContext', () => {
  it('is null where nothing provides the actions', () => {
    const { result } = renderHook(() => useCoverImageActions());

    expect(result.current).toBeNull();
  });

  it('hands the provided actions to a consumer', () => {
    const actions = { saveToVault: vi.fn(), download: vi.fn() };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CoverImageActionsProvider value={actions}>{children}</CoverImageActionsProvider>
    );
    const { result } = renderHook(() => useCoverImageActions(), { wrapper });

    expect(result.current).toBe(actions);
  });

  it.each([
    ['https://example.com/a.png', true],
    ['http://example.com/a.png', true],
    ['Assets/a.png', false],
    ['Projects/photos/a.png', false],
  ])('%s is remote: %s', (reference, expected) => {
    expect(isRemoteCoverReference(reference)).toBe(expected);
  });
});
