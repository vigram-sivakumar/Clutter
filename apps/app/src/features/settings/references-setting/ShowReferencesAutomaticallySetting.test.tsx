// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readShowReferencesAutomatically } from '@shared/helpers/showReferencesAutomaticallyPreference';
import { Settings } from '../Settings';
import { ShowReferencesAutomaticallySetting } from './ShowReferencesAutomaticallySetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toggle = () => screen.getByRole('switch', { name: 'Show references' });

describe('ShowReferencesAutomaticallySetting', () => {
  it('is labelled and described as specified, and on by default', () => {
    render(<ShowReferencesAutomaticallySetting />);

    expect(screen.getByText('Show references', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Automatically show references when a page has at least one reference')).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it('turning it off saves it, and the toggle reflects it; turning it on clears it', () => {
    render(<ShowReferencesAutomaticallySetting />);

    fireEvent.click(toggle());
    expect(readShowReferencesAutomatically()).toBe(false);
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());
    expect(readShowReferencesAutomatically()).toBe(true);
    expect(toggle()).toBeChecked();
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-show-references-automatically', 'false');
    render(<ShowReferencesAutomaticallySetting />);

    expect(toggle()).not.toBeChecked();
  });
});

describe('Settings → Editor → Layout', () => {
  it('holds it in a group of its own, with no header, below the Header separator settings', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Layout'));

    const entry = screen.getByText('Show references', { selector: '.settings-entry__title' });
    const group = entry.closest('.settings-group')!;
    const separatorGroup = screen.getByText('Header separator', { selector: '.settings-entry__title' }).closest('.settings-group')!;
    expect(group).not.toBe(separatorGroup);
    expect(group.querySelector('.settings-group__title')).toBeNull();
    expect(separatorGroup.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not appear on the Preferences page', () => {
    render(<Settings />);

    expect(screen.queryByText('Show references')).toBeNull();
  });
});
