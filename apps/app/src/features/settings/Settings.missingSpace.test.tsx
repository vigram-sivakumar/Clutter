// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { Settings } from './Settings';
import type { SettingsSpace } from './settings-sidebar/SettingsSidebar';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function spaces(onChangeMissingSpaceLocation: SettingsSpace['onChangeMissingSpaceLocation']): SettingsSpace {
  return {
    onChangeMissingSpaceLocation,
    spaces: [
      { path: '/Users/me/Open', name: 'Open', avatar: null, active: true },
      { path: '/Users/me/Gone', name: 'Gone', avatar: null, active: false, missing: true },
    ],
  };
}

describe('Settings → a Space page', () => {
  it('offers Change location for a missing Space and runs the shell\'s recovery flow for that Space', () => {
    const recover = vi.fn();
    render(<Settings space={spaces(recover)} />);

    fireEvent.click(screen.getByText('Gone'));
    expect(screen.getByText('Missing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change location' }));

    expect(recover).toHaveBeenCalledExactlyOnceWith('/Users/me/Gone');
  });

  it('keeps a valid Space\'s page as it was: no Missing badge, no Change location', () => {
    render(<Settings space={spaces(vi.fn())} />);

    fireEvent.click(screen.getByText('Open'));

    expect(screen.queryByText('Missing')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change location' })).toBeNull();
  });
});
