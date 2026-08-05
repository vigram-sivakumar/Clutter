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
    canNavigateBack: false,
    canNavigateForward: false,
    onNavigateBack: vi.fn(),
    onNavigateForward: vi.fn(),
    ...overrides,
  };

  const result = render(<Controls {...props} />);

  return { ...result, props };
}

describe('Controls history buttons (ADR-027)', () => {
  it('both buttons are disabled when history is empty', () => {
    const { container } = renderControls();

    const buttons = container.querySelectorAll<HTMLButtonElement>('.history-controls button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
    }
  });

  it('Previous is enabled exactly when canNavigateBack is true', () => {
    const { container, rerender } = render(
      <Controls
        isSidebarVisible
        onToggleSidebarVisible={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
      />
    );
    const [previousButton] = container.querySelectorAll<HTMLButtonElement>(
      '.history-controls button'
    );
    expect(previousButton!.disabled).toBe(true);

    rerender(
      <Controls
        isSidebarVisible
        onToggleSidebarVisible={vi.fn()}
        canNavigateBack={true}
        canNavigateForward={false}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
      />
    );
    const [previousButtonAfter] = container.querySelectorAll<HTMLButtonElement>(
      '.history-controls button'
    );
    expect(previousButtonAfter!.disabled).toBe(false);
  });

  it('Next is enabled exactly when canNavigateForward is true', () => {
    const { container } = renderControls({ canNavigateForward: true });

    const [, nextButton] = container.querySelectorAll<HTMLButtonElement>(
      '.history-controls button'
    );
    expect(nextButton!.disabled).toBe(false);
  });

  it('clicking Previous calls onNavigateBack when enabled', () => {
    const onNavigateBack = vi.fn();
    const { container } = renderControls({ canNavigateBack: true, onNavigateBack });

    const [previousButton] = container.querySelectorAll('.history-controls button');
    fireEvent.click(previousButton!);

    expect(onNavigateBack).toHaveBeenCalledTimes(1);
  });

  it('clicking Next calls onNavigateForward when enabled', () => {
    const onNavigateForward = vi.fn();
    const { container } = renderControls({ canNavigateForward: true, onNavigateForward });

    const [, nextButton] = container.querySelectorAll('.history-controls button');
    fireEvent.click(nextButton!);

    expect(onNavigateForward).toHaveBeenCalledTimes(1);
  });

  it('clicking a disabled Previous/Next does not call its handler', () => {
    const onNavigateBack = vi.fn();
    const onNavigateForward = vi.fn();
    const { container } = renderControls({ onNavigateBack, onNavigateForward });

    const [previousButton, nextButton] = container.querySelectorAll('.history-controls button');
    fireEvent.click(previousButton!);
    fireEvent.click(nextButton!);

    expect(onNavigateBack).not.toHaveBeenCalled();
    expect(onNavigateForward).not.toHaveBeenCalled();
  });

  it('the sidebar-toggle button is unaffected by history state', () => {
    const onToggleSidebarVisible = vi.fn();
    const { container } = renderControls({ onToggleSidebarVisible });

    const toggleButton = container.querySelector('.sidebar-toggle button')!;
    fireEvent.click(toggleButton);

    expect(onToggleSidebarVisible).toHaveBeenCalledTimes(1);
  });
});
