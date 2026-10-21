// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readFolderItemLimitChoice,
  writeFolderItemLimitChoice,
} from '@shared/helpers/folderItemLimitPreference';
import { Settings } from '../Settings';
import { FolderItemsSetting } from './FolderItemsSetting';

const KEY = 'clutter-folder-item-limit';
const trigger = () => screen.getByRole('button', { name: /^Show:/ });
const items = () => screen.queryAllByRole('menuitem');

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
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FolderItemsSetting', () => {
  it('shows the entry copy and an outline button on the default, 10 items, with nothing saved', () => {
    render(<FolderItemsSetting />);
    expect(screen.getByText('Show', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(
      screen.getByText('Choose how many items to show in each folder before showing more')
    ).toBeInTheDocument();
    expect(trigger()).toHaveClass('button--outline');
    expect(trigger()).toHaveTextContent('10 items');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('lists 5, 10, 15, 20 items and Show all, ticking only the selected one', () => {
    render(<FolderItemsSetting />);
    fireEvent.click(trigger());
    expect(items().map((item) => item.textContent)).toEqual([
      '5 items',
      '10 items',
      '15 items',
      '20 items',
      'Show all',
    ]);
    expect(items().filter((item) => item.querySelector('svg[data-icon="tick"], [data-icon="tick"]')).length).toBe(1);
    expect(screen.getByRole('menuitem', { name: '10 items' })).toHaveAttribute('aria-current', 'true');
  });

  it.each([
    ['5 items', '5'],
    ['15 items', '15'],
    ['20 items', '20'],
    ['Show all', 'all'],
  ])('choosing %s saves it, labels the button and closes the menu', (label, stored) => {
    render(<FolderItemsSetting />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    expect(localStorage.getItem(KEY)).toBe(stored);
    expect(trigger()).toHaveTextContent(label);
    expect(items()).toHaveLength(0);
  });

  it('choosing 10 items again clears the saved value', () => {
    writeFolderItemLimitChoice(20);
    render(<FolderItemsSetting />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: '10 items' }));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readFolderItemLimitChoice()).toBe(10);
  });

  it('shows the saved choice on the next start, and follows a change made elsewhere', () => {
    writeFolderItemLimitChoice(15);
    render(<FolderItemsSetting />);
    expect(trigger()).toHaveTextContent('15 items');
    act(() => writeFolderItemLimitChoice('all'));
    expect(trigger()).toHaveTextContent('Show all');
  });
});

describe('Settings — Notes page', () => {
  it('shows the Show setting before the Templates group', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Notes'));
    const groups = Array.from(document.querySelectorAll('.settings-group__title')).map(
      (el) => el.textContent
    );
    expect(groups).toEqual(['Sidebar appearance', 'Template']);
    expect(trigger()).toBeInTheDocument();
  });

  it('does not show it on the Daily notes page', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Daily notes'));
    expect(screen.queryByRole('button', { name: /^Show:/ })).toBeNull();
  });
});
