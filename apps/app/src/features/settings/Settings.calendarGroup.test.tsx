// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from './Settings';

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
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Settings → Preferences → Calendar', () => {
  it('holds "Start week on Monday" and "Date format" together, week start first', () => {
    render(<Settings />);
    const group = screen
      .getByText('Calendar', { selector: '.settings-group__title' })
      .closest('.settings-group')!;
    const titles = Array.from(
      group.querySelectorAll('.settings-entry__title')
    ).map((el) => el.textContent);
    expect(titles).toEqual(['Start week on Monday', 'Date format']);
  });

  it('keeps the week-start switch working next to it', () => {
    render(<Settings />);
    expect(
      screen.getByRole('switch', { name: 'Start week on Monday' })
    ).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Settings — dismiss button', () => {
  it('shows a round Close settings button that calls onClose', () => {
    const onClose = vi.fn();
    render(<Settings onClose={onClose} />);
    const button = screen.getByRole('button', { name: 'Close settings' });
    expect(button).toHaveClass('round-icon-button');
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no dismiss button when it is not shown in a dialog', () => {
    render(<Settings />);
    expect(screen.queryByRole('button', { name: 'Close settings' })).toBeNull();
  });
});

describe('Settings — buttons have no leading icon', () => {
  const textButtons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('.settings button')).filter(
      (button) => button.textContent?.trim() !== '' && !button.closest('[role="menu"]')
    );

  // A dropdown button keeps its trailing caret; what none of them has is an icon in front of its text.
  const hasLeadingIcon = (button: HTMLButtonElement) => {
    // The first child node: an icon in front of the text is an element there; the text itself is a text node.
    const first = button.querySelector('.button__content')?.firstChild;
    return first instanceof Element && first.classList.contains('app-icon');
  };

  it('no text button on the Preferences page has a leading icon, and the dropdowns keep their caret', () => {
    render(<Settings />);
    const buttons = textButtons();
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(hasLeadingIcon(button), button.textContent ?? '').toBe(false);
    }
    const dropdowns = buttons.filter((button) => button.getAttribute('aria-haspopup') === 'menu');
    expect(dropdowns.length).toBeGreaterThan(0);
    for (const dropdown of dropdowns) {
      expect(dropdown.querySelector('[data-icon="caretDown"]'), dropdown.textContent ?? '').not.toBeNull();
    }
  });

  it.each(['Notes', 'Daily notes'])('none on the %s page either', (page) => {
    render(<Settings />);
    fireEvent.click(screen.getByText(page));
    for (const button of textButtons()) {
      expect(hasLeadingIcon(button), button.textContent ?? '').toBe(false);
    }
  });
});
