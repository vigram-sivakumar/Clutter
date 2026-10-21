// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from '../Settings';
import type { SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';
import { CoverPositionSetting } from './CoverPositionSetting';

const trigger = () => screen.getByRole('button', { name: /^Default cover position:/ });
const items = () => screen.queryAllByRole('menuitem');

/** A Space's settings over mutable state: choosing notifies, and a different Space can be swapped in. */
function makeSpace(initial: { cover?: 'side' | 'above'; autoDelete?: boolean } = {}) {
  let cover = initial.cover ?? 'side';
  let autoDelete = initial.autoDelete ?? false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const source: SpaceSettingsSource = {
    getCoverPosition: () => cover,
    setCoverPosition: vi.fn((position) => {
      cover = position;
      notify();
    }),
    getAutoDeleteArchived: () => autoDelete,
    getAutoDeleteUnusedTags: () => false,
    setAutoDeleteUnusedTags: vi.fn(),
    setAutoDeleteArchived: vi.fn((enabled) => {
      autoDelete = enabled;
      notify();
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, set: (next: 'side' | 'above') => { cover = next; notify(); } };
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CoverPositionSetting', () => {
  it('shows the entry copy and an outline button on Right, the current behaviour, for a Space that never chose', () => {
    render(<CoverPositionSetting source={makeSpace().source} />);
    expect(screen.getByText('Default cover position', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Choose where cover images appear on notes')).toBeInTheDocument();
    expect(trigger()).toHaveClass('button--outline');
    expect(trigger()).toHaveTextContent('Right');
  });

  it('shows the defaults, and changes nothing, when no Space is supplied', () => {
    render(<CoverPositionSetting />);
    expect(trigger()).toHaveTextContent('Right');
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Top' }));
    expect(trigger()).toHaveTextContent('Right');
  });

  it('lists Top and Right, ticking only the selected one', () => {
    render(<CoverPositionSetting source={makeSpace().source} />);
    fireEvent.click(trigger());
    expect(items().map((item) => item.textContent)).toEqual(['Top', 'Right']);
    expect(items().filter((item) => item.querySelector('[data-icon="tick"]')).map((item) => item.textContent)).toEqual([
      'Right',
    ]);
  });

  it('choosing Top writes it to the Space, labels the button and closes the menu', () => {
    const { source } = makeSpace();
    render(<CoverPositionSetting source={source} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Top' }));

    expect(source.setCoverPosition).toHaveBeenCalledWith('above');
    expect(trigger()).toHaveTextContent('Top');
    expect(items()).toHaveLength(0);
  });

  it('choosing Right is written too: a chosen Right is not the same as never having chosen', () => {
    const { source } = makeSpace({ cover: 'above' });
    render(<CoverPositionSetting source={source} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Right' }));

    expect(source.setCoverPosition).toHaveBeenCalledWith('side');
  });

  it("shows each Space's own value: switching Space switches what it reads", () => {
    const first = makeSpace({ cover: 'above' });
    const second = makeSpace({ cover: 'side' });
    const { rerender } = render(<CoverPositionSetting source={first.source} />);
    expect(trigger()).toHaveTextContent('Top');

    rerender(<CoverPositionSetting source={second.source} />);
    expect(trigger()).toHaveTextContent('Right');

    rerender(<CoverPositionSetting source={first.source} />);
    expect(trigger()).toHaveTextContent('Top');
  });

  it('follows a change made elsewhere', () => {
    const { source, set } = makeSpace();
    render(<CoverPositionSetting source={source} />);
    act(() => set('above'));
    expect(trigger()).toHaveTextContent('Top');
  });
});

describe('Settings — Preferences page', () => {
  it('is part of the Appearance group, after Theme, not a group of its own', () => {
    render(<Settings spaceSettings={makeSpace().source} />);
    const groups = Array.from(document.querySelectorAll('.settings-group')).map((group) => ({
      title: group.querySelector('.settings-group__title')?.textContent,
      entries: Array.from(group.querySelectorAll('.settings-entry__title')).map((el) => el.textContent),
    }));
    expect(groups.slice(0, 2).map((group) => group.title)).toEqual(['Appearance', 'Startup']);
    expect(groups[0]?.entries).toEqual(['Theme', 'Default cover position']);
  });

  it('is not on the Notes page', () => {
    render(<Settings spaceSettings={makeSpace().source} />);
    fireEvent.click(screen.getByText('Notes'));
    expect(screen.queryByRole('button', { name: /^Default cover position:/ })).toBeNull();
  });
});
