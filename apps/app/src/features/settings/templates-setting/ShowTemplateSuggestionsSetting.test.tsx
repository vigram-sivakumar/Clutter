// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readShowTemplateSuggestions } from '@shared/helpers/showTemplateSuggestionsPreference';
import { Settings } from '../Settings';
import { ShowTemplateSuggestionsSetting } from './ShowTemplateSuggestionsSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole('switch', { name: 'Show template suggestions' });

describe('ShowTemplateSuggestionsSetting', () => {
  it('is labelled and described as specified, and on by default', () => {
    render(<ShowTemplateSuggestionsSetting />);

    expect(screen.getByText('Show template suggestions', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Show template suggestions when creating a new note')).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('turning it off saves it, and turning it on clears it', () => {
    render(<ShowTemplateSuggestionsSetting />);

    fireEvent.click(toggle());
    expect(readShowTemplateSuggestions()).toBe(false);
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());
    expect(readShowTemplateSuggestions()).toBe(true);
    expect(toggle()).toBeChecked();
  });
});

describe('Settings → Editor → Layout', () => {
  it('sits directly below Show references, in the same group', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Layout'));

    const references = screen.getByText('Show references', { selector: '.settings-entry__title' });
    const suggestions = screen.getByText('Show template suggestions', { selector: '.settings-entry__title' });
    const group = references.closest('.settings-group')!;
    expect(suggestions.closest('.settings-group')).toBe(group);
    const titles = Array.from(group.querySelectorAll('.settings-entry__title')).map((node) => node.textContent);
    expect(titles).toEqual(['Show references', 'Show template suggestions']);
  });
});
