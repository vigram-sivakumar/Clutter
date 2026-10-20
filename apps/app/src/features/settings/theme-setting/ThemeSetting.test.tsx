// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { resetThemeStoreForTests, useTheme } from '@design-system/useTheme';
import { ThemeSetting } from './ThemeSetting';

let systemDark = false;
let changeListeners: (() => void)[] = [];

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') && systemDark,
    media: query,
    addEventListener: (_: string, l: () => void) => changeListeners.push(l),
    removeEventListener: (_: string, l: () => void) => {
      changeListeners = changeListeners.filter((x) => x !== l);
    },
  })) as unknown as typeof window.matchMedia;
}

const trigger = () => screen.getByRole('button', { name: /^Theme:/ });
const items = () => screen.queryAllByRole('menuitem');
const theme = () => document.documentElement.getAttribute('data-theme');

/** Mirrors App: a second `useTheme()` caller that must stay in sync with the settings one. */
function AppMirror() {
  useTheme();
  return null;
}

function renderSetting() {
  return render(
    <>
      <AppMirror />
      <ThemeSetting />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  resetThemeStoreForTests();
  systemDark = false;
  changeListeners = [];
  stubMatchMedia();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeSetting', () => {
  it('defaults to "Use system theme" and opens a menu of exactly three options', () => {
    renderSetting();
    expect(trigger()).toHaveTextContent('Use system theme');
    expect(items()).toHaveLength(0);
    fireEvent.click(trigger());
    expect(items().map((i) => i.textContent)).toEqual([
      'Use system theme',
      'Light',
      'Dark',
    ]);
  });

  it('ticks only the selected option', () => {
    renderSetting();
    fireEvent.click(trigger());
    const ticked = () =>
      items()
        .filter((i) => i.querySelector('svg'))
        .map((i) => i.textContent);
    expect(ticked()).toEqual(['Use system theme']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dark' }));
    fireEvent.click(trigger());
    expect(ticked()).toEqual(['Dark']);
  });

  it('keeps the trigger shown active only while the menu is open', () => {
    renderSetting();
    expect(trigger()).not.toHaveClass('button--active');
    fireEvent.click(trigger());
    expect(trigger()).toHaveClass('button--active');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Light' }));
    expect(trigger()).not.toHaveClass('button--active');
  });

  it('applies the choice, persists it and closes the menu', () => {
    renderSetting();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dark' }));
    expect(items()).toHaveLength(0);
    expect(theme()).toBe('dark');
    expect(localStorage.getItem('clutter-theme')).toBe('dark');
    expect(trigger()).toHaveTextContent('Dark');

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Light' }));
    expect(theme()).toBe('light');
    expect(localStorage.getItem('clutter-theme')).toBe('light');
  });

  it('follows OS changes only while on system theme', () => {
    systemDark = true;
    renderSetting();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use system theme' }));
    expect(theme()).toBe('dark');

    systemDark = false;
    act(() => changeListeners.forEach((l) => l()));
    expect(theme()).toBe('light');

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dark' }));
    expect(changeListeners).toHaveLength(0);
    systemDark = false;
    act(() => changeListeners.forEach((l) => l()));
    expect(theme()).toBe('dark');
  });

  it('restores the saved preference on start', () => {
    localStorage.setItem('clutter-theme', 'dark');
    renderSetting();
    expect(trigger()).toHaveTextContent('Dark');
  });
});
