// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { StartupSetting } from './StartupSetting';
import { readStartupBehavior } from './startupPreference';

const trigger = () => screen.getByRole('button', { name: /^Open on launch:/ });
const items = () => screen.queryAllByRole('menuitem');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('StartupSetting', () => {
  it('defaults to "Today\'s note" and offers exactly two options', () => {
    render(<StartupSetting />);
    expect(trigger()).toHaveTextContent("Today's note");
    expect(readStartupBehavior()).toBe('todays-note');
    fireEvent.click(trigger());
    expect(items().map((i) => i.textContent)).toEqual([
      'Last opened note',
      "Today's note",
    ]);
  });

  it('ticks only the selected option', () => {
    render(<StartupSetting />);
    fireEvent.click(trigger());
    const ticked = () =>
      items()
        .filter((i) => i.querySelector('svg'))
        .map((i) => i.textContent);
    expect(ticked()).toEqual(["Today's note"]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Last opened note' }));
    fireEvent.click(trigger());
    expect(ticked()).toEqual(['Last opened note']);
  });

  it('stays shown as active only while the menu is open', () => {
    render(<StartupSetting />);
    expect(trigger()).not.toHaveClass('button--active');
    fireEvent.click(trigger());
    expect(trigger()).toHaveClass('button--active');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Last opened note' }));
    expect(trigger()).not.toHaveClass('button--active');
  });

  it('updates the label, persists the choice and closes the menu', () => {
    const { unmount } = render(<StartupSetting />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Last opened note' }));
    expect(items()).toHaveLength(0);
    expect(trigger()).toHaveTextContent('Last opened note');
    expect(readStartupBehavior()).toBe('last-opened-note');

    unmount();
    render(<StartupSetting />);
    expect(trigger()).toHaveTextContent('Last opened note');

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: "Today's note" }));
    expect(readStartupBehavior()).toBe('todays-note');
  });

  it('ignores an unrecognised stored value', () => {
    localStorage.setItem('clutter-startup-behavior', 'something-else');
    expect(readStartupBehavior()).toBe('todays-note');
  });
});
