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

    const titles = Array.from(document.querySelectorAll('.settings-entry__title')).map((el) => el.textContent);
    expect(titles).toEqual(['Header separator', 'Header separator style']);
  });
});
