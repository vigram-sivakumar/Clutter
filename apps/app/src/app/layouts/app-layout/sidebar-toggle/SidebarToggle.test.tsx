// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarToggle } from './SidebarToggle';

afterEach(() => {
  cleanup();
});

describe('SidebarToggle', () => {
  it('calls onToggleSidebarVisible when clicked', () => {
    const onToggleSidebarVisible = vi.fn();
    const { container } = render(
      <SidebarToggle isSidebarVisible onToggleSidebarVisible={onToggleSidebarVisible} />
    );

    const button = container.querySelector('.sidebar-toggle button')!;
    fireEvent.click(button);

    expect(onToggleSidebarVisible).toHaveBeenCalledTimes(1);
  });

  it('reflects isSidebarVisible via aria-pressed rather than a visual active state', () => {
    const { container, rerender } = render(
      <SidebarToggle isSidebarVisible onToggleSidebarVisible={vi.fn()} />
    );
    const button = container.querySelector('.sidebar-toggle button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');

    rerender(<SidebarToggle isSidebarVisible={false} onToggleSidebarVisible={vi.fn()} />);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
