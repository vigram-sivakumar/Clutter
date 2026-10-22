// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readTaskItemLimitChoice } from '@shared/helpers/taskItemLimitPreference';
import { readGroupTasksByDueDate } from '@shared/helpers/groupTasksByDueDatePreference';
import { Settings } from '../Settings';
import { TaskItemsSetting } from './TaskItemsSetting';

const KEY = 'clutter-task-item-limit';
const trigger = () => screen.getByRole('button', { name: /^Show:/ });
const items = () => screen.queryAllByRole('menuitem');

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TaskItemsSetting', () => {
  it('shows the entry copy and an outline button on the default, 5 items, with nothing saved', () => {
    render(<TaskItemsSetting />);

    expect(screen.getByText('Show', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(
      screen.getByText('Choose how many tasks to show in each section before showing more')
    ).toBeInTheDocument();
    expect(trigger()).toHaveClass('button--outline');
    expect(trigger()).toHaveTextContent('5 items');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('lists the folder Show setting’s options, ticking only the selected one', () => {
    render(<TaskItemsSetting />);
    fireEvent.click(trigger());

    expect(items().map((item) => item.textContent)).toEqual(['5 items', '10 items', '15 items', '20 items', 'Show all']);
    expect(items().filter((item) => item.querySelector('svg')).map((item) => item.textContent)).toEqual(['5 items']);
  });

  it('choosing an option saves it, updates the button and closes the menu; choosing 5 clears it', () => {
    render(<TaskItemsSetting />);

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: '15 items' }));
    expect(localStorage.getItem(KEY)).toBe('15');
    expect(readTaskItemLimitChoice()).toBe(15);
    expect(trigger()).toHaveTextContent('15 items');
    expect(items()).toHaveLength(0);

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: '5 items' }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem(KEY, 'all');
    render(<TaskItemsSetting />);

    expect(trigger()).toHaveTextContent('Show all');
  });
});

describe('Settings → Features → Tasks', () => {
  it('holds Group by due date, then Show, in one Sidebar appearance group', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Tasks'));

    const group = screen.getByText('Sidebar appearance', { selector: '.settings-group__title' }).closest('.settings-group')!;
    expect([...group.querySelectorAll('.settings-entry__title')].map((el) => el.textContent)).toEqual([
      'Group by due date',
      'Show',
    ]);
  });

  it('changing the grouping mode does not reset the Show limit, either way round', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Tasks'));

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: '15 items' }));
    expect(readTaskItemLimitChoice()).toBe(15);

    const grouping = screen.getByRole('switch', { name: 'Group by due date' });
    fireEvent.click(grouping);
    expect(readGroupTasksByDueDate()).toBe(true);
    expect(readTaskItemLimitChoice()).toBe(15);
    expect(trigger()).toHaveTextContent('15 items');

    fireEvent.click(grouping);
    expect(readGroupTasksByDueDate()).toBe(false);
    expect(readTaskItemLimitChoice()).toBe(15);
    expect(trigger()).toHaveTextContent('15 items');
  });

  it('does not change the folder Show setting on the Notes page', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Tasks'));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: '20 items' }));

    fireEvent.click(screen.getByText('Notes'));
    expect(trigger()).toHaveTextContent('10 items');
  });
});
