// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';
import { readPreferClutterQuoteSyntax } from '@shared/helpers/preferClutterQuoteSyntaxPreference';
import { PreferClutterQuoteSyntaxSetting } from './PreferClutterQuoteSyntaxSetting';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('PreferClutterQuoteSyntaxSetting', () => {
  const toggle = () => screen.getByRole('switch', { name: 'Prefer Clutter quote syntax' });

  it('is labelled and described as specified, and off by default', () => {
    render(<PreferClutterQuoteSyntaxSetting />);

    expect(screen.getByText('Prefer Clutter quote syntax', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Automatically convert standard Markdown blockquote markers to Clutter’s native quote syntax when typing'
      )
    ).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
  });

  it('turning it on saves it without touching another setting; turning it off clears it', () => {
    render(<PreferClutterQuoteSyntaxSetting />);

    fireEvent.click(toggle());
    expect(readPreferClutterQuoteSyntax()).toBe(true);
    expect(readEnableEmojiLists()).toBe(true);
    expect(toggle()).toBeChecked();

    fireEvent.click(toggle());
    expect(readPreferClutterQuoteSyntax()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('shows a saved choice when it is shown again (as after a restart)', () => {
    render(<PreferClutterQuoteSyntaxSetting />);
    fireEvent.click(toggle());
    cleanup();

    render(<PreferClutterQuoteSyntaxSetting />);
    expect(toggle()).toBeChecked();
  });
});
