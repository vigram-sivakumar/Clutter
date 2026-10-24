// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readApplyTemplateCover } from '@shared/helpers/applyTemplateCoverPreference';
import { readApplyTemplateIcon } from '@shared/helpers/applyTemplateIconPreference';
import { Settings } from '../Settings';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openTemplates = () => {
  render(<Settings />);
  fireEvent.click(screen.getByText('Templates'));
};
const icon = () => screen.getByRole('switch', { name: 'Apply template icon' });
const cover = () => screen.getByRole('switch', { name: 'Apply template cover image' });

describe('Settings → Features → Templates', () => {
  it('is a section in the Settings navigation, after Assets, and opens its own page', () => {
    render(<Settings />);
    const templates = screen.getByText('Templates').closest('.entry')!;
    const assets = screen.getByText('Assets').closest('.entry')!;

    expect(assets.compareDocumentPosition(templates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Apply template icon')).toBeNull();

    fireEvent.click(screen.getByText('Templates'));

    expect(screen.getByRole('heading', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByText('Apply template icon', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Apply template cover image', { selector: '.settings-entry__title' })).toBeInTheDocument();
  });

  it('holds both settings, icon above cover, on the Templates page only', () => {
    openTemplates();

    const titles = Array.from(document.querySelectorAll('.settings-entry__title')).map((el) => el.textContent);
    expect(titles).toEqual(['Apply template icon', 'Apply template cover image']);

    fireEvent.click(screen.getByText('Notes'));
    expect(screen.queryByText('Apply template icon')).toBeNull();
  });

  it('both are on by default', () => {
    openTemplates();

    expect(icon()).toBeChecked();
    expect(cover()).toBeChecked();
    expect(readApplyTemplateIcon()).toBe(true);
    expect(readApplyTemplateCover()).toBe(true);
  });

  it('turning one off saves only that one; turning it on clears it', () => {
    openTemplates();

    fireEvent.click(icon());
    expect(readApplyTemplateIcon()).toBe(false);
    expect(readApplyTemplateCover()).toBe(true);
    expect(icon()).not.toBeChecked();
    expect(cover()).toBeChecked();

    fireEvent.click(icon());
    fireEvent.click(cover());
    expect(readApplyTemplateIcon()).toBe(true);
    expect(readApplyTemplateCover()).toBe(false);
    expect(localStorage.getItem('clutter-apply-template-icon')).toBeNull();
  });

  it('shows the saved choices when opened again (as after a restart)', () => {
    localStorage.setItem('clutter-apply-template-icon', 'false');
    localStorage.setItem('clutter-apply-template-cover', 'false');
    openTemplates();

    expect(icon()).not.toBeChecked();
    expect(cover()).not.toBeChecked();
  });
});
