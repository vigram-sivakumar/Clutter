// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readHeaderSeparatorMode } from '@app/layouts/page/headerSeparator';
import { HeaderSeparatorSetting } from './HeaderSeparatorSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const trigger = () => screen.getByRole('button', { name: /^Header separator:/ });

describe('HeaderSeparatorSetting', () => {
  it('is labelled Header separator and shows Automatic by default', () => {
    render(<HeaderSeparatorSetting />);

    expect(screen.getByText('Header separator')).toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Automatic');
  });

  it('offers exactly Automatic, Always show and Always hide, marking the current one', () => {
    render(<HeaderSeparatorSetting />);
    fireEvent.click(trigger());

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Automatic', 'Always show', 'Always hide']);
    expect(items[0]).toHaveAttribute('aria-current', 'true');
  });

  it.each([
    ['Always show', 'show'],
    ['Always hide', 'hide'],
    ['Automatic', 'automatic'],
  ] as const)('choosing %s saves %s and the control reflects it', (label, mode) => {
    localStorage.setItem('clutter-header-separator', mode === 'automatic' ? 'show' : 'automatic');
    render(<HeaderSeparatorSetting />);
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(readHeaderSeparatorMode()).toBe(mode);
    expect(trigger()).toHaveTextContent(label);
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-header-separator', 'hide');
    render(<HeaderSeparatorSetting />);

    expect(trigger()).toHaveTextContent('Always hide');
  });
});
