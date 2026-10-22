// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';
import { Settings } from '../Settings';
import { ShowTagEmojisSetting } from './ShowTagEmojisSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole('switch', { name: 'Show tag emojis' });

describe('ShowTagEmojisSetting', () => {
  it('is labelled and described as specified, and on by default', () => {
    render(<ShowTagEmojisSetting />);

    expect(screen.getByText('Show tag emojis', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Show tag emojis in the editor and its Tags property.')).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('turning it off saves it, and the toggle reflects it; turning it on clears it', () => {
    render(<ShowTagEmojisSetting />);

    fireEvent.click(toggle());
    expect(readShowTagEmojis()).toBe(false);
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());
    expect(readShowTagEmojis()).toBe(true);
    expect(toggle()).toBeChecked();
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-show-tag-emojis', 'false');
    render(<ShowTagEmojisSetting />);

    expect(toggle()).not.toBeChecked();
  });
});

describe('Settings → Features → Tags', () => {
  it('holds Show tag emojis in its own group, on the Tags page only', () => {
    render(<Settings />);
    expect(screen.queryByText('Show tag emojis')).toBeNull();

    fireEvent.click(screen.getByText('Tags'));

    const group = screen.getByText('Tag display', { selector: '.settings-group__title' }).closest('.settings-group')!;
    expect(group.querySelector('.settings-entry__title')).toHaveTextContent('Show tag emojis');
  });

  it('does not appear on the Notes page', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Notes'));

    expect(screen.queryByText('Show tag emojis')).toBeNull();
  });
});
