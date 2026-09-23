// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Controls } from './Controls';

afterEach(() => {
  cleanup();
});

describe('Controls no longer renders navigation history (relocated to PageTopBar)', () => {
  it('renders no history-controls group — the arrows live in the topbar now', () => {
    const { container } = render(<Controls />);

    expect(container.querySelector('.history-controls')).toBeNull();
  });

  it('leaves the create buttons enabled, no longer gated on navigation history', () => {
    const { container } = render(<Controls />);

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '.create-controls button'
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(false);
    }
  });
});

describe('Controls no longer renders the sidebar-toggle button (moved to SidebarToggle)', () => {
  it('renders no .sidebar-toggle — that control lives in AppLayout now', () => {
    const { container } = render(<Controls />);

    expect(container.querySelector('.sidebar-toggle')).toBeNull();
  });
});
