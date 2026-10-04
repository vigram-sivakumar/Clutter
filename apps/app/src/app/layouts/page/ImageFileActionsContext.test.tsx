// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import {
  ImageFileActionsProvider,
  isRemoteImageReference,
  useImageFileActions,
} from './ImageFileActionsContext';

describe('ImageFileActionsContext', () => {
  it('is null where nothing provides the actions', () => {
    const { result } = renderHook(() => useImageFileActions());

    expect(result.current).toBeNull();
  });

  it('hands the provided actions to a consumer', () => {
    const actions = { saveToVault: vi.fn(), download: vi.fn() };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ImageFileActionsProvider value={actions}>{children}</ImageFileActionsProvider>
    );
    const { result } = renderHook(() => useImageFileActions(), { wrapper });

    expect(result.current).toBe(actions);
  });

  it.each([
    ['https://example.com/a.png', true],
    ['http://example.com/a.png', true],
    ['Assets/a.png', false],
    ['Projects/photos/a.png', false],
  ])('%s is remote: %s', (reference, expected) => {
    expect(isRemoteImageReference(reference)).toBe(expected);
  });
});
