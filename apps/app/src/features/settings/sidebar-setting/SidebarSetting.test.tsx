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

import { SidebarSetting } from './SidebarSetting';
import {
  readDefaultSidebarTab,
  readLaunchSidebarTab,
  readUseLastSidebarTab,
} from './defaultSidebarTab';

const KEY = 'clutter-default-sidebar-tab';
const trigger = () => screen.getByRole('button', { name: /^Default tab:/ });
const items = () => screen.queryAllByRole('menuitem');
const labels = () =>
  items().map((i) => i.querySelector('.menu__item-label')?.textContent);
const choose = (name: string) => {
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('menuitem', { name }));
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('SidebarSetting', () => {
  it('defaults to "Last selected tab", listed first, then the four tabs in order, without icons', () => {
    render(<SidebarSetting />);
    expect(trigger()).toHaveTextContent('Last selected tab');
    expect(readUseLastSidebarTab()).toBe(true);
    expect(readLaunchSidebarTab()).toBeUndefined();
    expect(items()).toHaveLength(0);
    fireEvent.click(trigger());
    expect(labels()).toEqual([
      'Last selected tab',
      'Notes',
      'Daily notes',
      'Tasks',
      'Tags',
    ]);
    expect(items().some((i) => i.querySelector('.entry__leading'))).toBe(false);
  });

  it('ticks only the selected option and is shown active only while open', () => {
    render(<SidebarSetting />);
    expect(trigger()).not.toHaveClass('button--active');
    fireEvent.click(trigger());
    expect(trigger()).toHaveClass('button--active');
    const ticked = () =>
      items()
        .filter((i) => i.querySelector('.entry__meta svg'))
        .map((i) => i.querySelector('.menu__item-label')?.textContent);
    expect(ticked()).toEqual(['Last selected tab']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }));
    expect(trigger()).not.toHaveClass('button--active');
    fireEvent.click(trigger());
    expect(ticked()).toEqual(['Tags']);
  });

  it.each([
    ['Notes', 'notes'],
    ['Daily notes', 'daily-notes'],
    ['Tasks', 'tasks'],
    ['Tags', 'tags'],
  ])(
    'choosing %s configures %s, persists it and closes the menu',
    (name, id) => {
      const { unmount } = render(<SidebarSetting />);
      choose(name);
      expect(items()).toHaveLength(0);
      expect(trigger()).toHaveTextContent(name);
      expect(localStorage.getItem(KEY)).toBe(id);
      expect(readUseLastSidebarTab()).toBe(false);
      expect(readLaunchSidebarTab()).toBe(id);

      unmount();
      render(<SidebarSetting />);
      expect(trigger()).toHaveTextContent(name);
    }
  );

  it('"Last selected tab" stops forcing a launch tab and persists', () => {
    const { unmount } = render(<SidebarSetting />);
    choose('Tags');
    expect(readLaunchSidebarTab()).toBe('tags');
    choose('Last selected tab');
    expect(trigger()).toHaveTextContent('Last selected tab');
    expect(readUseLastSidebarTab()).toBe(true);
    expect(readLaunchSidebarTab()).toBeUndefined();

    unmount();
    render(<SidebarSetting />);
    expect(trigger()).toHaveTextContent('Last selected tab');
  });

  it('keeps the explicitly chosen tab when switching to "Last selected tab" and back', () => {
    render(<SidebarSetting />);
    choose('Tags');
    choose('Last selected tab');
    expect(readDefaultSidebarTab()).toBe('tags');
    choose('Tags');
    expect(readLaunchSidebarTab()).toBe('tags');
  });

  it('does not offer Search — it is an overlay, not a tab to start on', () => {
    render(<SidebarSetting />);
    fireEvent.click(trigger());
    expect(labels()).not.toContain('Search');
  });

  it('a saved choice of the old Search tab opens Notes, and the setting shows Notes', () => {
    localStorage.setItem(KEY, 'search');
    localStorage.setItem('clutter-use-last-sidebar-tab', 'false');

    expect(readDefaultSidebarTab()).toBe('notes');
    expect(readLaunchSidebarTab()).toBe('notes');

    render(<SidebarSetting />);
    expect(trigger()).toHaveTextContent('Notes');
  });

  it('a saved Search choice leaves "Last selected tab" as it was', () => {
    localStorage.setItem(KEY, 'search');

    expect(readUseLastSidebarTab()).toBe(true);
    expect(readLaunchSidebarTab()).toBeUndefined();
  });

  it('every other saved tab is still honoured', () => {
    localStorage.setItem('clutter-use-last-sidebar-tab', 'false');

    for (const tab of ['notes', 'daily-notes', 'tasks', 'tags']) {
      localStorage.setItem(KEY, tab);
      expect(readLaunchSidebarTab()).toBe(tab);
    }
  });

  it.each([null, '', 'bogus', 'Notes'])(
    'falls back to Notes for a missing or invalid value (%s)',
    (stored) => {
      if (stored !== null) localStorage.setItem(KEY, stored);
      expect(readDefaultSidebarTab()).toBe('notes');
      // With "Last selected tab" off, the (invalid or missing) explicit tab shows as Notes.
      localStorage.setItem('clutter-use-last-sidebar-tab', 'false');
      render(<SidebarSetting />);
      expect(trigger()).toHaveTextContent('Notes');
      expect(readLaunchSidebarTab()).toBe('notes');
    }
  );
});
