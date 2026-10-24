// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readShowAssetsInFolders, writeShowAssetsInFolders } from '@shared/helpers/showAssetsInFoldersPreference';
import { Settings } from '../Settings';
import { SettingsSidebar } from '../settings-sidebar/SettingsSidebar';
import { ShowAssetsInFoldersSetting } from './ShowAssetsInFoldersSetting';

const KEY = 'clutter-show-assets-in-folders';
const toggle = () => screen.getByRole('switch', { name: 'Show assets in folders' });

beforeEach(() => {
  localStorage.clear();
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

describe('ShowAssetsInFoldersSetting', () => {
  it('shows the entry copy and a switch that is on by default, with nothing saved', () => {
    render(<ShowAssetsInFoldersSetting />);
    expect(screen.getByText('Show assets in folders', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Show asset files alongside notes in regular folders')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowAssetsInFolders()).toBe(true);
  });

  it('turning it off saves the choice; turning it on again clears the saved value', () => {
    render(<ShowAssetsInFoldersSetting />);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readShowAssetsInFolders()).toBe(false);

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('shows the saved choice on the next start, and follows a change made elsewhere', () => {
    writeShowAssetsInFolders(false);
    render(<ShowAssetsInFoldersSetting />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    act(() => writeShowAssetsInFolders(true));
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });

  it.each(['', 'true', 'off', '0', 'FALSE'])('treats an unrecognised saved value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);
    expect(readShowAssetsInFolders()).toBe(true);
  });

  it('is app-wide: it lives in the browser store, never in a Space or a note', () => {
    writeShowAssetsInFolders(false);
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });
});

describe('Settings — Assets page', () => {
  it('is listed under Features after Daily notes, Tags and Tasks, with its own icon', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);
    const order = Array.from(document.querySelectorAll('.entry')).map(
      (el) => el.querySelector('.entry__content')?.textContent ?? el.textContent
    );
    // The three section headers (General, Features, Editor) and the six pages, in order: Assets is the last of Features, after Tasks.
    expect(order).toEqual(['General', 'Preferences', 'Features', 'Notes', 'Daily notes', 'Tags', 'Tasks', 'Assets', 'Templates', 'Editor', 'Layout']);
    const row = screen.getByText('Assets').closest('.entry')!;
    expect(row.querySelector('.entry__leading svg')).not.toBeNull();
  });

  it('opens its own page, with one untitled group holding the setting', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Assets'));

    expect(screen.getByRole('heading', { name: 'Assets' })).toBeInTheDocument();
    expect(document.querySelectorAll('.settings-group')).toHaveLength(1);
    expect(document.querySelector('.settings-group__title')).toBeNull();
    expect(document.querySelector('.settings-group__header')).toBeNull();
    expect(toggle()).toBeInTheDocument();
  });

  it('is not on the other pages', () => {
    render(<Settings />);
    for (const page of ['Notes', 'Daily notes']) {
      fireEvent.click(screen.getByText(page));
      expect(screen.queryByRole('switch', { name: 'Show assets in folders' })).toBeNull();
    }
  });
});
