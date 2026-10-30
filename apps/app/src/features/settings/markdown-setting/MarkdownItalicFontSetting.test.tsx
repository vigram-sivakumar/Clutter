// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMarkdownItalicFont } from '@shared/helpers/markdownItalicFontPreference';
import { Settings } from '../Settings';
import { MarkdownItalicFontSetting } from './MarkdownItalicFontSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole('switch', { name: 'Italic font' });

describe('MarkdownItalicFontSetting', () => {
  it('is labelled and described as specified, and off by default', () => {
    render(<MarkdownItalicFontSetting />);

    expect(screen.getByText('Italic font', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Use a distinct font for italic text in your notes')).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
  });

  it('turning it on saves it, and the toggle reflects it; turning it off clears it', () => {
    render(<MarkdownItalicFontSetting />);

    fireEvent.click(toggle());
    expect(readMarkdownItalicFont()).toBe(true);
    expect(toggle()).toBeChecked();

    fireEvent.click(toggle());
    expect(readMarkdownItalicFont()).toBe(false);
    expect(toggle()).not.toBeChecked();
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-markdown-italic-font', 'true');
    render(<MarkdownItalicFontSetting />);

    expect(toggle()).toBeChecked();
  });
});

describe('Settings → Editor → Markdown', () => {
  it('holds the setting in a Markdown group, on the Markdown page only', () => {
    render(<Settings />);
    expect(screen.queryByText('Italic font')).toBeNull();

    fireEvent.click(screen.getByText('Markdown', { selector: '.entry *' }));

    const group = screen.getByText('Markdown', { selector: '.settings-group__title' }).closest('.settings-group')!;
    expect(group.querySelector('.settings-entry__title')).toHaveTextContent('Italic font');
  });
});
