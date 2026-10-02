// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppIcon } from '@shared/icon';

import { PropertyList } from './PropertyList';
import type { PropertyListItem } from './PropertyList.types';

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

afterEach(() => cleanup());

const trigger = (name: string) => screen.queryByRole('button', { name: `${name} actions` });
const itemLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

function renderWith(item: Partial<PropertyListItem> = {}) {
  const onHide = vi.fn();
  const onClear = vi.fn();
  const onDelete = vi.fn();
  render(
    <PropertyList
      items={[
        { name: 'priority', type: 'text', value: 'high', editable: false, onHide, onClear, onDelete, ...item } as PropertyListItem,
      ]}
    />
  );
  return { onHide, onClear, onDelete };
}

describe('PropertyList — a property’s menu', () => {
  it('has a horizontal-dots button in the name, labelled with the property', () => {
    renderWith();

    const button = trigger('priority')!;
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // It sits beside the type icon, which is still there.
    expect(document.querySelectorAll('.property-list__name .property__icon--type')).toHaveLength(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows horizontal dots (not the vertical dots other menus use)', () => {
    renderWith();

    const icon = trigger('priority')!.querySelector('svg')!.outerHTML;
    const horizontal = render(<AppIcon icon="moreHorizontal" />).container.querySelector('svg')!.outerHTML;
    const vertical = render(<AppIcon icon="moreVertical" />).container.querySelector('svg')!.outerHTML;

    expect(icon).toBe(horizontal);
    expect(icon).not.toBe(vertical);
  });

  it('clicking it opens Hide, Clear, a divider, then Delete', () => {
    renderWith();

    fireEvent.click(trigger('priority')!);

    expect(trigger('priority')).toHaveAttribute('aria-expanded', 'true');
    expect(itemLabels()).toEqual(['Hide', 'Clear', 'Delete']);
    // The divider sits immediately above Delete, and nowhere else.
    const dividers = document.querySelectorAll('.menu [role="separator"]');
    expect(dividers).toHaveLength(1);
    expect(dividers[0]!.nextElementSibling?.textContent).toBe('Delete');
  });

  it.each([
    ['Hide', 'onHide'],
    ['Clear', 'onClear'],
    ['Delete', 'onDelete'],
  ] as const)('choosing %s calls only %s and closes the menu', (label, handler) => {
    const handlers = renderWith();

    fireEvent.click(trigger('priority')!);
    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(handlers[handler]).toHaveBeenCalledOnce();
    for (const other of Object.keys(handlers).filter((name) => name !== handler)) {
      expect(handlers[other as keyof typeof handlers]).not.toHaveBeenCalled();
    }
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists only the actions the adapter supplies, with the divider only when something precedes Delete', () => {
    renderWith({ onClear: undefined, onDelete: undefined });
    fireEvent.click(trigger('priority')!);
    expect(itemLabels()).toEqual(['Hide']);
    expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(0);
    cleanup();

    renderWith({ onHide: undefined, onClear: undefined });
    fireEvent.click(trigger('priority')!);
    expect(itemLabels()).toEqual(['Delete']);
    // Nothing above Delete, so no stray divider at the top.
    expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(0);
    cleanup();

    renderWith({ onClear: undefined });
    fireEvent.click(trigger('priority')!);
    expect(itemLabels()).toEqual(['Hide', 'Delete']);
    expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(1);
  });

  it('Remove sits after a divider, calls only onRemove, and closes the menu', () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    renderWith({ onHide: undefined, onDelete: undefined, onClear, onRemove });

    fireEvent.click(trigger('priority')!);
    expect(itemLabels()).toEqual(['Clear', 'Remove']);
    expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a property with no actions has no menu button at all', () => {
    renderWith({ onHide: undefined, onClear: undefined, onDelete: undefined });

    expect(trigger('priority')).toBeNull();
    expect(document.querySelectorAll('.property-list__name button')).toHaveLength(0);
  });

  it('each row has its own menu, so one row’s action never reaches another', () => {
    const first = { onHide: vi.fn() };
    const second = { onHide: vi.fn() };
    render(
      <PropertyList
        items={[
          { name: 'a', type: 'text', value: '', editable: false, ...first },
          { name: 'b', type: 'text', value: '', editable: false, ...second },
        ]}
      />
    );

    fireEvent.click(trigger('b')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide' }));

    expect(second.onHide).toHaveBeenCalledOnce();
    expect(first.onHide).not.toHaveBeenCalled();
  });

  it('a click on the menu button is not a click on the value or the row', () => {
    renderWith();

    fireEvent.click(trigger('priority')!);

    // Opening the menu doesn't start editing or navigate anything.
    expect(document.querySelector('.editable-text:focus')).toBeNull();
  });
});
