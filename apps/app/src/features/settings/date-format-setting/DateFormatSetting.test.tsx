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

import { formatDateFormatExample } from '@shared/helpers/time/dateDisplay';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';

import {
  readDateFormatChoice,
  writeDateFormatChoice,
} from '@shared/helpers/time/dateFormatPreference';
import { DateFormatSetting } from './DateFormatSetting';

const KEY = 'clutter-date-format';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  setSystemLocaleOverride('en-IN');
  cleanup();
  vi.unstubAllGlobals();
});

const trigger = () => screen.getByRole('button', { name: /^Date format:/ });
const items = () => screen.queryAllByRole('menuitem');
const nameOf = (item: HTMLElement) => item.getAttribute('aria-label');
const exampleOf = (item: HTMLElement) => item.textContent;
const choose = (name: string) => {
  fireEvent.click(trigger());
  fireEvent.click(
    screen.getByRole('menuitem', { name: new RegExp(`^${name}`) })
  );
};

const EXPLICIT: [string, string][] = [
  ['full', 'Full date'],
  ['short', 'Short date'],
  ['weekday', 'Date with day'],
  ['mdy', 'Month/Day/Year'],
  ['dmy', 'Day/Month/Year'],
  ['ymd', 'Year/Month/Day'],
];

// What each locale's menu shows: the seven options, Relative first, in menu order.
const EXAMPLES: Record<string, string[]> = {
  'en-IN': [
    'Relative',
    '20 October 2026',
    '20 Oct',
    'Tue, 20 Oct 2026',
    '10/20/2026',
    '20/10/2026',
    '2026/10/20',
  ],
  'en-GB': [
    'Relative',
    '20 October 2026',
    '20 Oct',
    'Tue, 20 Oct 2026',
    '10/20/2026',
    '20/10/2026',
    '2026/10/20',
  ],
  'en-US': [
    'Relative',
    'October 20, 2026',
    'Oct 20',
    'Tue, Oct 20, 2026',
    '10/20/2026',
    '20/10/2026',
    '2026/10/20',
  ],
};

describe('DateFormatSetting — the entry and its button', () => {
  it('shows the entry copy and an outline button, in the trailing slot', () => {
    render(<DateFormatSetting />);
    expect(
      screen.getByText('Date format', { selector: '.settings-entry__title' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Choose how dates are displayed throughout Clutter')
    ).toBeInTheDocument();
    expect(trigger()).toHaveClass('button--outline');
    expect(trigger().closest('.settings-entry__trailing')).not.toBeNull();
  });

  it('shows only the chosen format\'s example date on the button, not its name', () => {
    render(<DateFormatSetting />);
    expect(trigger()).toHaveTextContent(/^Relative$/);
    choose('Month/Day/Year');
    expect(trigger()).toHaveTextContent(/^10\/20\/2026$/);
  });

  it('starts on the relative format (the default), with nothing saved', () => {
    render(<DateFormatSetting />);
    expect(trigger()).toHaveAttribute('aria-label', 'Date format: Relative');
    expect(readDateFormatChoice()).toBe('relative');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps its trigger in the active (forced-hover) state only while the menu is open', () => {
    render(<DateFormatSetting />);
    expect(trigger()).not.toHaveClass('button--active');
    fireEvent.click(trigger());
    expect(trigger()).toHaveClass('button--active');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: /^Short date/ }));
    expect(trigger()).not.toHaveClass('button--active');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('DateFormatSetting — the menu', () => {
  it('lists Relative first, then the six other options, in order', () => {
    render(<DateFormatSetting />);
    fireEvent.click(trigger());
    expect(items().map(nameOf)).toEqual([
      'Relative',
      ...EXPLICIT.map(([, label]) => label),
    ]);
  });

  it.each(Object.keys(EXAMPLES))(
    "shows each option's example in the system locale (%s), from the app's own formatter",
    (locale) => {
      setSystemLocaleOverride(locale);
      render(<DateFormatSetting />);
      fireEvent.click(trigger());
      expect(items().map(exampleOf)).toEqual(EXAMPLES[locale]);
      expect(items().map(exampleOf)).toEqual(
        (
          [
            'relative',
            'full',
            'short',
            'weekday',
            'mdy',
            'dmy',
            'ymd',
          ] as const
        ).map((format) =>
          // Relative is shown by its name; every other row is the app's own example for that format.
          format === 'relative' ? 'Relative' : formatDateFormatExample(format, { locale })
        )
      );
    }
  );

  it('follows a change of the system locale without anything stored', () => {
    setSystemLocaleOverride('en-US');
    const view = render(<DateFormatSetting />);
    fireEvent.click(trigger());
    expect(exampleOf(items()[3]!)).toBe('Tue, Oct 20, 2026');
    cleanup();
    view.unmount();
    setSystemLocaleOverride('en-IN');
    render(<DateFormatSetting />);
    fireEvent.click(trigger());
    expect(exampleOf(items()[3]!)).toBe('Tue, 20 Oct 2026');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('always abbreviates the weekday of "Date with day" to three letters', () => {
    render(<DateFormatSetting />);
    fireEvent.click(trigger());
    for (const locale of Object.keys(EXAMPLES)) {
      setSystemLocaleOverride(locale);
      cleanup();
      render(<DateFormatSetting />);
      fireEvent.click(trigger());
      const example = exampleOf(
        screen.getByRole('menuitem', { name: /^Date with day/ })
      )!;
      expect(example.split(',')[0]).toMatch(/^[A-Z][a-z]{2}$/);
    }
  });

  it('ticks only the selected option, in the trailing slot', () => {
    render(<DateFormatSetting />);
    const ticked = () =>
      items()
        .filter((i) => i.querySelector('.entry__meta svg'))
        .map(nameOf);
    fireEvent.click(trigger());
    expect(ticked()).toEqual(['Relative']);
    fireEvent.click(
      screen.getByRole('menuitem', { name: /^Day\/Month\/Year/ })
    );
    fireEvent.click(trigger());
    expect(ticked()).toEqual(['Day/Month/Year']);
    expect(
      screen.getByRole('menuitem', { name: /^Day\/Month\/Year/ })
    ).toHaveAttribute('aria-current', 'true');
  });

  it('closes the menu after a selection', () => {
    render(<DateFormatSetting />);
    choose('Full date');
    expect(items()).toHaveLength(0);
  });
});

describe('DateFormatSetting — selecting and persisting', () => {
  it.each(EXPLICIT)(
    'selecting %s updates the label and saves it',
    (value, label) => {
      render(<DateFormatSetting />);
      choose(label);
      expect(trigger()).toHaveAttribute('aria-label', `Date format: ${label}`);
      expect(localStorage.getItem(KEY)).toBe(value);
      expect(readDateFormatChoice()).toBe(value);
    }
  );

  it.each(EXPLICIT)('restores %s after a restart', (value, label) => {
    writeDateFormatChoice(value as Parameters<typeof writeDateFormatChoice>[0]);
    render(<DateFormatSetting />);
    expect(trigger()).toHaveAttribute('aria-label', `Date format: ${label}`);
  });

  it('returns to the default through "Relative", clearing the saved value', () => {
    render(<DateFormatSetting />);
    choose('Month/Day/Year');
    expect(localStorage.getItem(KEY)).toBe('mdy');
    choose('Relative');
    expect(trigger()).toHaveAttribute('aria-label', 'Date format: Relative');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readDateFormatChoice()).toBe('relative');
  });

  it('follows a change made elsewhere', () => {
    render(<DateFormatSetting />);
    act(() => writeDateFormatChoice('ymd'));
    expect(trigger()).toHaveAttribute('aria-label', 'Date format: Year/Month/Day');
  });

  it('falls back to Relative for an invalid saved value', () => {
    localStorage.setItem(KEY, 'not-a-format');
    render(<DateFormatSetting />);
    expect(trigger()).toHaveAttribute('aria-label', 'Date format: Relative');
  });
});
