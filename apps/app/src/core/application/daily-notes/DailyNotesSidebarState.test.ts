import { describe, expect, it, vi } from 'vitest';

import { DailyNotesSidebarState } from './DailyNotesSidebarState';

describe('DailyNotesSidebarState', () => {
  it('starts with Earlier and Upcoming both collapsed', () => {
    const state = new DailyNotesSidebarState();

    expect(state.earlierExpanded).toBe(false);
    expect(state.upcomingExpanded).toBe(false);
  });

  it('sets each flag independently and notifies on change', () => {
    const state = new DailyNotesSidebarState();
    const listener = vi.fn();
    state.subscribe(listener);

    state.setEarlierExpanded(true);
    expect(state.earlierExpanded).toBe(true);
    expect(state.upcomingExpanded).toBe(false);

    state.setUpcomingExpanded(true);
    expect(state.upcomingExpanded).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify when a setter lands on the current value', () => {
    const state = new DailyNotesSidebarState();
    const listener = vi.fn();
    state.subscribe(listener);

    state.setEarlierExpanded(false);
    state.setUpcomingExpanded(false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying an unsubscribed listener', () => {
    const state = new DailyNotesSidebarState();
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);

    unsubscribe();
    state.setEarlierExpanded(true);

    expect(listener).not.toHaveBeenCalled();
  });
});
