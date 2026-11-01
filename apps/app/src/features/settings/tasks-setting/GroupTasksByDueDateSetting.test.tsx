// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readGroupTasksByDueDate } from '@shared/helpers/groupTasksByDueDatePreference';
import { Settings } from '../Settings';
import { GroupTasksByDueDateSetting } from './GroupTasksByDueDateSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole('switch', { name: 'Group by due date' });

describe('GroupTasksByDueDateSetting', () => {
  it('is labelled and described as specified, and on by default', () => {
    render(<GroupTasksByDueDateSetting />);

    expect(screen.getByText('Group by due date', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Group tasks by their due date')).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('turning it off saves it, and the toggle reflects it; turning it on again clears it', () => {
    render(<GroupTasksByDueDateSetting />);

    fireEvent.click(toggle());
    expect(readGroupTasksByDueDate()).toBe(false);
    expect(localStorage.getItem('clutter-group-tasks-by-due-date')).toBe('false');
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());
    expect(readGroupTasksByDueDate()).toBe(true);
    expect(localStorage.getItem('clutter-group-tasks-by-due-date')).toBeNull();
    expect(toggle()).toBeChecked();
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-group-tasks-by-due-date', 'false');
    render(<GroupTasksByDueDateSetting />);

    expect(toggle()).not.toBeChecked();
  });
});

describe('Settings → Features → Tasks', () => {
  it('has a Tasks page, with Group by due date in its Sidebar appearance group, and nowhere else', () => {
    render(<Settings />);
    expect(screen.queryByText('Group by due date')).toBeNull();

    fireEvent.click(screen.getByText('Tasks'));

    const group = screen
      .getByText('Sidebar appearance', { selector: '.settings-group__title' })
      .closest('.settings-group')!;
    expect(group.querySelector('.settings-entry__title')).toHaveTextContent('Group by due date');
  });
});
