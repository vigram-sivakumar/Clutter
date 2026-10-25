// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ResourceContextMenu } from './ResourceContextMenu';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

describe('ResourceContextMenu — an immediate action', () => {
  it('runs once, with no menu shown, then finishes — even where effects mount twice (React StrictMode in development)', () => {
    const archive = vi.fn();
    const onDone = vi.fn();

    render(
      <StrictMode>
        <ResourceContextMenu
          menu={{ menu: [{ id: 'archive', label: 'Move to trash' }], handlers: { archive } }}
          point={{ x: 0, y: 0 }}
          immediate="archive"
          onDone={onDone}
        />
      </StrictMode>
    );

    expect(archive).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });
});
