// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from './Settings';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Settings → Editor → Layout', () => {
  it('holds Header separator, and Preferences does not', () => {
    render(<Settings />);
    expect(screen.queryByText('Header separator')).toBeNull();

    fireEvent.click(screen.getByText('Layout'));

    expect(screen.getByText('Header separator')).toBeInTheDocument();
  });

  it('puts Header separator style directly below Header separator', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Layout'));

    const group = screen.getByText('Header separator', { selector: '.settings-entry__title' }).closest('.settings-group')!;
    const titles = Array.from(group.querySelectorAll('.settings-entry__title')).map((el) => el.textContent);
    expect(titles).toEqual(['Header separator', 'Header separator style']);
  });
});


describe('Settings → Clutter → Support', () => {
  it('shows the support page from the settings sidebar without opening payment services', () => {
    render(<Settings />);
    expect(screen.queryByText('Choose your support')).toBeNull();

    fireEvent.click(screen.getByText('Support'));

    expect(screen.getByRole('heading', { name: 'Support Clutter' })).toBeInTheDocument();
    expect(screen.getByText('Choose your support')).toBeInTheDocument();
    expect(screen.getByText('$5')).toBeInTheDocument();
    expect(screen.getByText('$15')).toBeInTheDocument();
    expect(screen.getByText('$30')).toBeInTheDocument();
    expect(screen.getByText('Free for everyone, always.')).toBeInTheDocument();
    expect(document.querySelectorAll('.support-page a')).toHaveLength(0);
  });
});
