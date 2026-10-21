// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readShowDailyNoteEmoji } from '@shared/helpers/showDailyNoteEmojiPreference';
import { Settings } from '../Settings';
import { ShowDailyNoteEmojiSetting } from './ShowDailyNoteEmojiSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole('switch', { name: 'Show emoji' });

describe('ShowDailyNoteEmojiSetting', () => {
  it('is labelled and described as specified, and off by default', () => {
    render(<ShowDailyNoteEmojiSetting />);

    expect(screen.getByText('Show emoji', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Show daily note emojis in the sidebar')).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
  });

  it('turning it on saves it, and the toggle reflects it; turning it off clears it', () => {
    render(<ShowDailyNoteEmojiSetting />);

    fireEvent.click(toggle());
    expect(readShowDailyNoteEmoji()).toBe(true);
    expect(toggle()).toBeChecked();

    fireEvent.click(toggle());
    expect(readShowDailyNoteEmoji()).toBe(false);
    expect(toggle()).not.toBeChecked();
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-show-daily-note-emoji', 'true');
    render(<ShowDailyNoteEmojiSetting />);

    expect(toggle()).toBeChecked();
  });
});

describe('Settings → Daily notes → Sidebar appearance', () => {
  it('holds Show emoji, in a group named Sidebar appearance (as on the Notes page), on the Daily notes page only', () => {
    render(<Settings />);
    expect(screen.queryByText('Sidebar appearance')).toBeNull();

    fireEvent.click(screen.getByText('Daily notes'));

    const group = screen.getByText('Sidebar appearance', { selector: '.settings-group__title' }).closest('.settings-group')!;
    expect(group.querySelector('.settings-entry__title')).toHaveTextContent('Show emoji');
  });

  it('does not appear on the Notes page', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Notes'));

    expect(screen.queryByText('Show emoji')).toBeNull();
  });
});
