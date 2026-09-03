// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from './Controls';

afterEach(() => {
  cleanup();
});

function renderControls(overrides: Partial<Parameters<typeof Controls>[0]> = {}) {
  const props = {
    isSidebarVisible: true,
    onToggleSidebarVisible: vi.fn(),
    ...overrides,
  };

  const result = render(<Controls {...props} />);

  return { ...result, props };
}

describe('Controls sidebar toggle (ADR-021, M4)', () => {
  it('clicking the sidebar-toggle button calls onToggleSidebarVisible', () => {
    const onToggleSidebarVisible = vi.fn();
    const { container } = renderControls({ onToggleSidebarVisible });

    const toggleButton = container.querySelector('.sidebar-toggle button')!;
    fireEvent.click(toggleButton);

    expect(onToggleSidebarVisible).toHaveBeenCalledTimes(1);
  });

  it('reflects isSidebarVisible via aria-pressed rather than a visual active state', () => {
    const { container, rerender } = render(
      <Controls isSidebarVisible onToggleSidebarVisible={vi.fn()} />
    );
    const toggleButton = container.querySelector('.sidebar-toggle button')!;
    expect(toggleButton.getAttribute('aria-pressed')).toBe('true');

    rerender(
      <Controls isSidebarVisible={false} onToggleSidebarVisible={vi.fn()} />
    );
    expect(
      container.querySelector('.sidebar-toggle button')!.getAttribute('aria-pressed')
    ).toBe('false');
  });
});

describe('Controls no longer renders navigation history (relocated to PageTopBar)', () => {
  it('renders no history-controls group — the arrows live in the topbar now', () => {
    const { container } = renderControls();

    expect(container.querySelector('.history-controls')).toBeNull();
  });

  it('leaves the create buttons enabled, no longer gated on navigation history', () => {
    const { container } = renderControls();

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '.create-controls button'
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(false);
    }
  });
});
