// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageTopBar } from './Page.TopBar';

afterEach(() => {
  cleanup();
});

function renderTopBar(overrides: Partial<Parameters<typeof PageTopBar>[0]> = {}) {
  const props = {
    canNavigateBack: false,
    canNavigateForward: false,
    onNavigateBack: vi.fn(),
    onNavigateForward: vi.fn(),
    ...overrides,
  };

  const result = render(<PageTopBar {...props} />);

  return { ...result, props };
}

function historyButtons(container: HTMLElement) {
  const [back, forward] = container.querySelectorAll<HTMLButtonElement>(
    '.history-controls button'
  );

  return { back: back!, forward: forward! };
}

describe('PageTopBar history buttons (ADR-027, relocated here from Controls)', () => {
  it('both buttons are disabled when history is empty', () => {
    const { container } = renderTopBar();

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '.history-controls button'
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
    }
  });

  it('Previous is enabled exactly when canNavigateBack is true', () => {
    const { container, rerender } = render(
      <PageTopBar
        canNavigateBack={false}
        canNavigateForward={false}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
      />
    );
    expect(historyButtons(container).back.disabled).toBe(true);

    rerender(
      <PageTopBar
        canNavigateBack={true}
        canNavigateForward={false}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
      />
    );
    expect(historyButtons(container).back.disabled).toBe(false);
  });

  it('Next is enabled exactly when canNavigateForward is true', () => {
    const { container } = renderTopBar({ canNavigateForward: true });

    expect(historyButtons(container).forward.disabled).toBe(false);
  });

  it('clicking Previous calls onNavigateBack when enabled', () => {
    const onNavigateBack = vi.fn();
    const { container } = renderTopBar({ canNavigateBack: true, onNavigateBack });

    fireEvent.click(historyButtons(container).back);

    expect(onNavigateBack).toHaveBeenCalledTimes(1);
  });

  it('clicking Next calls onNavigateForward when enabled', () => {
    const onNavigateForward = vi.fn();
    const { container } = renderTopBar({
      canNavigateForward: true,
      onNavigateForward,
    });

    fireEvent.click(historyButtons(container).forward);

    expect(onNavigateForward).toHaveBeenCalledTimes(1);
  });

  it('clicking a disabled Previous/Next does not call its handler', () => {
    const onNavigateBack = vi.fn();
    const onNavigateForward = vi.fn();
    const { container } = renderTopBar({ onNavigateBack, onNavigateForward });

    const { back, forward } = historyButtons(container);
    fireEvent.click(back);
    fireEvent.click(forward);

    expect(onNavigateBack).not.toHaveBeenCalled();
    expect(onNavigateForward).not.toHaveBeenCalled();
  });

  it('the sidebar-toggle button is unaffected by history state', () => {
    const onToggleSidebarVisible = vi.fn();
    const { container } = renderTopBar({ onToggleSidebarVisible });

    const toggleButton = container.querySelector('.topbar__sidebar-toggle')!;
    fireEvent.click(toggleButton);

    expect(onToggleSidebarVisible).toHaveBeenCalledTimes(1);
  });
});
