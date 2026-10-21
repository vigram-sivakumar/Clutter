// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readHeaderSeparatorMode, readHeaderSeparatorStyle } from '@app/layouts/page/headerSeparator';
import { HeaderSeparatorStyleSetting } from './HeaderSeparatorStyleSetting';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const trigger = () => screen.getByRole('button', { name: /^Header separator style:/ });
const items = () => screen.getAllByRole('menuitem');

describe('HeaderSeparatorStyleSetting', () => {
  it('is labelled Header separator style and defaults to Line', () => {
    render(<HeaderSeparatorStyleSetting />);

    expect(screen.getByText('Header separator style')).toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Line');
  });

  it('offers Line, Wavy and Dotted, marking the current one', () => {
    render(<HeaderSeparatorStyleSetting />);
    fireEvent.click(trigger());

    expect(items().map((item) => item.textContent)).toEqual(['Line', 'Wavy', 'Dotted']);
    expect(items()[0]).toHaveAttribute('aria-current', 'true');
  });

  it('shows no divider in the menu options, only a tick on the current one', () => {
    render(<HeaderSeparatorStyleSetting />);
    fireEvent.click(trigger());

    for (const item of items()) expect(item.querySelector('.page-divider')).toBeNull();
    expect(items()[0]!.querySelector('.entry__trailing svg')).not.toBeNull();
    expect(items()[1]!.querySelector('.entry__trailing svg')).toBeNull();
  });

  it('draws the selected style\'s divider beside the selected value', () => {
    localStorage.setItem('clutter-header-separator-style', 'dotted');
    render(<HeaderSeparatorStyleSetting />);

    expect(trigger()).toHaveTextContent('Dotted');
    expect(trigger().querySelector('.page-divider')).toHaveAttribute('data-variant', 'dotted');
  });

  it.each([
    ['Wavy', 'wavy'],
    ['Dotted', 'dotted'],
    ['Line', 'solid'],
  ] as const)('choosing %s saves %s and the control reflects it', (label, style) => {
    localStorage.setItem('clutter-header-separator-style', style === 'solid' ? 'wavy' : 'solid');
    render(<HeaderSeparatorStyleSetting />);
    fireEvent.click(trigger());

    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: label }));

    expect(readHeaderSeparatorStyle()).toBe(style);
    expect(trigger()).toHaveTextContent(label);
    expect(trigger().querySelector('.page-divider')).toHaveAttribute('data-variant', style);
  });

  it('shows the saved choice when it is opened again', () => {
    localStorage.setItem('clutter-header-separator-style', 'wavy');
    render(<HeaderSeparatorStyleSetting />);

    expect(trigger()).toHaveTextContent('Wavy');
  });

  it('never changes the visibility setting', () => {
    localStorage.setItem('clutter-header-separator', 'hide');
    render(<HeaderSeparatorStyleSetting />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wavy' }));

    expect(readHeaderSeparatorStyle()).toBe('wavy');
    expect(readHeaderSeparatorMode()).toBe('hide');
  });
});
