// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageHeaderControls } from './PageHeaderControls';
import type { PageHeaderControlsProps } from './PageHeaderControls';
import type { AddPropertyMenuProps } from './AddPropertyMenu';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
});

function renderControls(overrides: Partial<PageHeaderControlsProps> = {}) {
  return render(<PageHeaderControls {...overrides} />);
}

const control = () => screen.getByRole('button', { name: /propert/i });

const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);
const toggle = (shown: boolean, onToggle = vi.fn()) => ({ mode: 'toggle', shown, onToggle }) as const;
const add = () => {
  const onShowProperty = vi.fn();
  const onAddCustomProperty = vi.fn();
  return {
    onShowProperty,
    onAddCustomProperty,
    control: {
      mode: 'add',
      menu: {
        systemProperties: [{ id: 'created', label: 'Created', icon: 'calendar' }],
        hiddenProperties: [{ key: 'Due date', type: 'date' }],
        onShowProperty,
        onAddCustomProperty,
      } satisfies AddPropertyMenuProps,
    } as const,
  };
};

describe('the title section\'s Properties control', () => {
  it('is absent without a control, and is a button beside More actions — not a More actions item', () => {
    renderControls();
    expect(screen.queryByRole('button', { name: /propert/i })).toBeNull();
    cleanup();

    renderControls({ propertiesControl: toggle(true) });
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual([
      'More actions',
      'Hide properties',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: /propert/i })).toBeNull();
  });

  describe('toggle mode (once a property exists)', () => {
    it.each([
      [false, 'Show properties'],
      [true, 'Hide properties'],
    ])('shown=%s reads "%s", toggles once on click and opens no menu', (shown, label) => {
      const onToggle = vi.fn();
      renderControls({ propertiesControl: toggle(shown, onToggle) });

      expect(control()).toHaveTextContent(label);
      fireEvent.click(control());

      expect(onToggle).toHaveBeenCalledOnce();
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('is never "Add a property"', () => {
      renderControls({ propertiesControl: toggle(false) });
      expect(control()).not.toHaveTextContent('Add a property');
    });
  });

  describe('add mode (before the first property)', () => {
    it('reads "Add a property" and opens the existing Add properties menu: system, hidden and new types', () => {
      renderControls({ propertiesControl: add().control });

      expect(control()).toHaveTextContent('Add a property');
      fireEvent.click(control());

      expect(screen.getByRole('menu', { name: 'Add properties' })).toBeInTheDocument();
      expect(items()).toEqual([
        'Created',
        'Due date',
        'Text',
        'Date',
        'URL',
        'Number',
        'Boolean',
        'Multi-select',
      ]);
    });

    it.each([
      ['a system property', 'Created', 'created'],
      ['a hidden custom property', 'Due date', 'Due date'],
    ])('choosing %s shows it by its canonical key and closes the menu', (_l, item, key) => {
      const { control: c, onShowProperty, onAddCustomProperty } = add();
      renderControls({ propertiesControl: c });

      fireEvent.click(control());
      fireEvent.click(screen.getByRole('menuitem', { name: item }));

      expect(onShowProperty).toHaveBeenCalledExactlyOnceWith(key);
      expect(onAddCustomProperty).not.toHaveBeenCalled();
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it.each(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select'])(
      'choosing the new type %s starts a draft and closes the menu',
      (label) => {
        const { control: c, onShowProperty, onAddCustomProperty } = add();
        renderControls({ propertiesControl: c });

        fireEvent.click(control());
        fireEvent.click(screen.getByRole('menuitem', { name: label }));

        expect(onAddCustomProperty).toHaveBeenCalledOnce();
        expect(onShowProperty).not.toHaveBeenCalled();
        expect(screen.queryByRole('menu')).toBeNull();
      }
    );

    it('closing the menu without choosing changes nothing', () => {
      const { control: c, onShowProperty, onAddCustomProperty } = add();
      renderControls({ propertiesControl: c });

      fireEvent.click(control());
      fireEvent.click(control());

      expect(screen.queryByRole('menu')).toBeNull();
      expect(onShowProperty).not.toHaveBeenCalled();
      expect(onAddCustomProperty).not.toHaveBeenCalled();
    });
  });
});
