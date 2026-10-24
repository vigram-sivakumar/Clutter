// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from '../Settings';
import { SettingsSidebar } from '../settings-sidebar/SettingsSidebar';
import type { SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';

const toggle = () => screen.getByRole('switch', { name: 'Automatically delete unused tags' });

function makeSpace(initial = false) {
  let on = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const source: SpaceSettingsSource = {
    getCoverPosition: () => 'side',
    setCoverPosition: vi.fn(),
    getAutoDeleteArchived: () => false,
    setAutoDeleteArchived: vi.fn(),
    getAllowMovingAssetsToFolders: () => false,
    setAllowMovingAssetsToFolders: vi.fn(),
    getAutoDeleteUnusedTags: () => on,
    setAutoDeleteUnusedTags: vi.fn((enabled) => {
      on = enabled;
      notify();
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, set: (next: boolean) => { on = next; notify(); } };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openTagsPage = (source?: SpaceSettingsSource) => {
  render(<Settings spaceSettings={source} />);
  fireEvent.click(screen.getByText('Tags'));
};

describe('Settings — Tags page', () => {
  it('is listed under Features, after Daily notes, with the tag icon', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);

    const rows = Array.from(document.querySelectorAll('.entry')).map(
      (el) => el.querySelector('.entry__content')?.textContent ?? el.textContent
    );
    expect(rows.slice(rows.indexOf('Features'), rows.indexOf('Editor'))).toEqual(['Features', 'Notes', 'Daily notes', 'Tags', 'Tasks', 'Assets', 'Templates']);
    expect(screen.getByText('Tags').closest('.entry')!.querySelector('.entry__leading svg')).not.toBeNull();
  });

  it('opens its own page with the auto-delete setting, titled and described as specified', () => {
    openTagsPage(makeSpace().source);

    expect(screen.getByRole('heading', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByText('Automatically delete unused tags')).toBeInTheDocument();
    expect(screen.getByText('Remove tags that are no longer used by any notes')).toBeInTheDocument();
    // Beside the Tag display group's Show tag emojis.
    expect(document.querySelectorAll('.settings-group')).toHaveLength(2);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.getByRole('switch', { name: 'Show tag emojis' })).toBeInTheDocument();
  });

  it('is off by default, with or without a Space to read from', () => {
    openTagsPage(makeSpace().source);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    cleanup();

    openTagsPage(undefined);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('turning it on and off asks the Space to save it, and shows the Space’s own value', () => {
    const { source } = makeSpace();
    openTagsPage(source);

    fireEvent.click(toggle());
    expect(source.setAutoDeleteUnusedTags).toHaveBeenLastCalledWith(true);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle());
    expect(source.setAutoDeleteUnusedTags).toHaveBeenLastCalledWith(false);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('follows the Space: a different Space shows its own value, and a change made elsewhere shows here', () => {
    const first = makeSpace(true);
    const { rerender } = render(<Settings spaceSettings={first.source} />);
    fireEvent.click(screen.getByText('Tags'));
    expect(toggle()).toHaveAttribute('aria-checked', 'true');

    rerender(<Settings spaceSettings={makeSpace(false).source} />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');

    const other = makeSpace(false);
    rerender(<Settings spaceSettings={other.source} />);
    act(() => other.set(true));
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });

  it('is on this page only, not on the others', () => {
    render(<Settings spaceSettings={makeSpace().source} />);
    const sidebar = document.querySelector('.settings-sidebar') as HTMLElement;
    for (const page of ['Preferences', 'Notes', 'Daily notes', 'Assets']) {
      fireEvent.click(within(sidebar).getByText(page));
      expect(screen.queryByRole('switch', { name: 'Automatically delete unused tags' })).toBeNull();
    }
  });
});
