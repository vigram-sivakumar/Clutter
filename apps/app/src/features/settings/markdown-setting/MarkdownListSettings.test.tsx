// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';
import { readPreserveBulletStyle } from '@shared/helpers/preserveBulletStylePreference';
import { EnableEmojiListsSetting } from './EnableEmojiListsSetting';
import { PreserveBulletStyleSetting } from './PreserveBulletStyleSetting';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('PreserveBulletStyleSetting', () => {
  const toggle = () => screen.getByRole('switch', { name: 'Preserve bullet style' });

  it('is labelled and described as specified, and on by default', () => {
    render(<PreserveBulletStyleSetting />);

    expect(screen.getByText('Preserve bullet style', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(
      screen.getByText('Show the original Markdown bullet marker. Turn off to always display dots.')
    ).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('turning it off saves it without touching the other setting; turning it on clears it', () => {
    render(<PreserveBulletStyleSetting />);

    fireEvent.click(toggle());
    expect(readPreserveBulletStyle()).toBe(false);
    expect(readEnableEmojiLists()).toBe(true);
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());
    expect(readPreserveBulletStyle()).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});

describe('EnableEmojiListsSetting', () => {
  const toggle = () => screen.getByRole('switch', { name: 'Enable emoji lists' });

  it('is labelled and described as specified, and on by default', () => {
    render(<EnableEmojiListsSetting />);

    expect(screen.getByText('Enable emoji lists', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(
      screen.getByText('Treat emoji-prefixed lines as list items instead of regular paragraphs.')
    ).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('turning it off saves it without touching the other setting; turning it on clears it', () => {
    render(<EnableEmojiListsSetting />);

    fireEvent.click(toggle());
    expect(readEnableEmojiLists()).toBe(false);
    expect(readPreserveBulletStyle()).toBe(true);
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());
    expect(readEnableEmojiLists()).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});
