// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from '../Settings';
import type { SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';
import { AutoDeleteArchivedSetting } from './AutoDeleteArchivedSetting';

const toggle = () => screen.getByRole('switch', { name: 'Automatically delete archived items' });

function makeSpace(initial = false) {
  let autoDelete = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const source: SpaceSettingsSource = {
    getCoverPosition: () => 'side',
    setCoverPosition: vi.fn(),
    getAutoDeleteArchived: () => autoDelete,
    getAllowMovingAssetsToFolders: () => false,
    setAllowMovingAssetsToFolders: vi.fn(),
    getAutoDeleteUnusedTags: () => false,
    setAutoDeleteUnusedTags: vi.fn(),
    setAutoDeleteArchived: vi.fn((enabled) => {
      autoDelete = enabled;
      notify();
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, set: (next: boolean) => { autoDelete = next; notify(); } };
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AutoDeleteArchivedSetting', () => {
  it('shows the entry copy and a switch that is OFF for a Space that never chose', () => {
    render(<AutoDeleteArchivedSetting source={makeSpace().source} />);
    expect(
      screen.getByText('Automatically delete archived items', { selector: '.settings-entry__title' })
    ).toBeInTheDocument();
    expect(screen.getByText('Permanently delete archived items after 30 days')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('is off, and turns nothing on, when no Space is supplied', () => {
    render(<AutoDeleteArchivedSetting />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('turning it on and off is written to the Space', () => {
    const { source } = makeSpace();
    render(<AutoDeleteArchivedSetting source={source} />);

    fireEvent.click(toggle());
    expect(source.setAutoDeleteArchived).toHaveBeenLastCalledWith(true);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle());
    expect(source.setAutoDeleteArchived).toHaveBeenLastCalledWith(false);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it("shows each Space's own value: one Space on does not turn another on", () => {
    const on = makeSpace(true);
    const off = makeSpace(false);
    const { rerender } = render(<AutoDeleteArchivedSetting source={on.source} />);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');

    rerender(<AutoDeleteArchivedSetting source={off.source} />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');

    rerender(<AutoDeleteArchivedSetting source={on.source} />);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });

  it('follows a change made elsewhere', () => {
    const { source, set } = makeSpace();
    render(<AutoDeleteArchivedSetting source={source} />);
    act(() => set(true));
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Settings — Preferences page', () => {
  it('has it in a "Data & storage" group, after Calendar', () => {
    render(<Settings spaceSettings={makeSpace().source} />);
    const groups = Array.from(document.querySelectorAll('.settings-group')).map((group) => ({
      title: group.querySelector('.settings-group__title')?.textContent,
      entries: Array.from(group.querySelectorAll('.settings-entry__title')).map((el) => el.textContent),
    }));
    // The Reset section closes the page, after every group of settings.
    expect(groups.map((group) => group.title)).toEqual(['Appearance', 'Startup', 'Calendar', 'Data & storage', 'Reset']);
    expect(groups[3]?.entries).toEqual(['Automatically delete archived items']);
  });
});
