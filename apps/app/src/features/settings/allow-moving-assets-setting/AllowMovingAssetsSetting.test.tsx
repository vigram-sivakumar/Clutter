// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlags } from '@core/featureFlags';
import { Settings } from '../Settings';
import type { SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';

const toggle = () => screen.getByRole('switch', { name: 'Allow moving assets to folders' });
const defaultFlag = featureFlags.allowMovingAssetsSetting;

function makeSpace(initial = false) {
  let on = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const source: SpaceSettingsSource = {
    getCoverPosition: () => 'side',
    setCoverPosition: vi.fn(),
    getAutoDeleteArchived: () => false,
    setAutoDeleteArchived: vi.fn(),
    getAutoDeleteUnusedTags: () => false,
    setAutoDeleteUnusedTags: vi.fn(),
    getAllowMovingAssetsToFolders: () => on,
    setAllowMovingAssetsToFolders: vi.fn((enabled) => {
      on = enabled;
      notify();
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, set: (next: boolean) => { on = next; notify(); } };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  featureFlags.allowMovingAssetsSetting = defaultFlag;
  cleanup();
  vi.unstubAllGlobals();
});

const openAssetsPage = (source?: SpaceSettingsSource) => {
  render(<Settings spaceSettings={source} />);
  fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText('Assets'));
};

describe('the "Allow moving assets to folders" setting, behind its feature flag', () => {
  it('is hidden for now: the flag is off, and the Assets page does not show it', () => {
    expect(defaultFlag).toBe(false);
    openAssetsPage(makeSpace().source);

    expect(screen.queryByText('Allow moving assets to folders')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Allow moving assets to folders' })).toBeNull();
    // The page's other setting is untouched.
    expect(screen.getByText('Show assets in folders')).toBeInTheDocument();
  });

  describe('with the flag on', () => {
    beforeEach(() => {
      featureFlags.allowMovingAssetsSetting = true;
    });

    it('shows the toggle with its title and description, on the Assets page only, in the same group as the other setting', () => {
      openAssetsPage(makeSpace().source);

      expect(screen.getByText('Allow moving assets to folders')).toBeInTheDocument();
      expect(
        screen.getByText('Allow assets and asset folders to be moved into regular folders in your Space')
      ).toBeInTheDocument();
      expect(document.querySelectorAll('.settings-group')).toHaveLength(1);
      expect(within(document.querySelector('.settings-group') as HTMLElement).getAllByRole('switch')).toHaveLength(2);

      for (const page of ['Notes', 'Daily notes', 'Tags']) {
        fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText(page));
        expect(screen.queryByRole('switch', { name: 'Allow moving assets to folders' })).toBeNull();
      }
    });

    it('is off by default, with or without a Space to read from', () => {
      openAssetsPage(makeSpace().source);
      expect(toggle()).toHaveAttribute('aria-checked', 'false');
      cleanup();

      openAssetsPage(undefined);
      expect(toggle()).toHaveAttribute('aria-checked', 'false');
    });

    it('turning it on and off asks the Space to save it, and the page follows at once', () => {
      const { source } = makeSpace();
      openAssetsPage(source);

      fireEvent.click(toggle());
      expect(source.setAllowMovingAssetsToFolders).toHaveBeenLastCalledWith(true);
      expect(toggle()).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(toggle());
      expect(source.setAllowMovingAssetsToFolders).toHaveBeenLastCalledWith(false);
      expect(toggle()).toHaveAttribute('aria-checked', 'false');
    });

    it('follows the Space: another Space shows its own value, and a change made elsewhere shows here', () => {
      const first = makeSpace(true);
      const { rerender } = render(<Settings spaceSettings={first.source} />);
      fireEvent.click(within(document.querySelector('.settings-sidebar') as HTMLElement).getByText('Assets'));
      expect(toggle()).toHaveAttribute('aria-checked', 'true');

      const other = makeSpace(false);
      rerender(<Settings spaceSettings={other.source} />);
      expect(toggle()).toHaveAttribute('aria-checked', 'false');

      act(() => other.set(true));
      expect(toggle()).toHaveAttribute('aria-checked', 'true');
    });
  });
});
