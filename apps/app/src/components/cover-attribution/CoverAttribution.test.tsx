// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { CoverAttribution, coverAttributionLabel } from './CoverAttribution';

vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PROFILE = 'https://unsplash.com/@alex?utm_source=clutter&utm_medium=referral';
const HOME = 'https://unsplash.com?utm_source=clutter&utm_medium=referral';

describe('CoverAttribution', () => {
  it('reads "Photo by [Photographer] on Unsplash" with both links', () => {
    const { container } = render(
      <CoverAttribution attribution={{ kind: 'credit', name: 'Alex Doe', profileUrl: PROFILE }} />
    );

    expect(container.querySelector('.cover-attribution')).toHaveTextContent('Photo by Alex Doe on Unsplash');
    expect(screen.getByText('Alex Doe')).toHaveAttribute('href', PROFILE);
    expect(screen.getByText('Unsplash')).toHaveAttribute('href', HOME);
  });

  it('keeps the full name as tooltip and accessible label, so truncation never hides it', () => {
    const name = 'Maximilian Bartholomew Featherstonehaugh-Cholmondeley III';
    render(<CoverAttribution attribution={{ kind: 'credit', name, profileUrl: PROFILE }} />);

    const link = screen.getByText(name);
    expect(link).toHaveAttribute('title', name);
    expect(link).toHaveAttribute('aria-label', `${name} on Unsplash`);
    expect(screen.getByRole('link', { name: `${name} on Unsplash` })).toBe(link);
    // The name is its own shrinkable element; "Photo by", "on" and Unsplash are not part of it.
    expect(link.className).toBe('cover-attribution__name');
  });

  it('is a single line: one paragraph, the name the only part allowed to shrink', () => {
    const { container } = render(
      <CoverAttribution attribution={{ kind: 'credit', name: 'Alex Doe', profileUrl: PROFILE }} />
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelectorAll('.cover-attribution__name')).toHaveLength(1);
    expect(container.querySelectorAll('.cover-attribution__text, .cover-attribution__unsplash').length).toBeGreaterThan(0);
  });

  it('a credit-less Unsplash cover reads "by Unsplash", linking only Unsplash', () => {
    const { container } = render(<CoverAttribution attribution={{ kind: 'unsplash' }} />);

    expect(container.querySelector('.cover-attribution')).toHaveTextContent(/^by Unsplash$/);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Unsplash' })).toHaveAttribute('href', HOME);
  });

  it('opens links externally (not in-app) without activating the surface underneath', () => {
    const onSurface = vi.fn();
    render(
      <div onClick={onSurface} onKeyDown={onSurface}>
        <CoverAttribution attribution={{ kind: 'credit', name: 'Alex Doe', profileUrl: PROFILE }} />
      </div>
    );

    fireEvent.click(screen.getByText('Alex Doe'));
    fireEvent.click(screen.getByText('Unsplash'));
    fireEvent.keyDown(screen.getByText('Unsplash'), { key: 'Enter' });

    expect(openExternalUrl).toHaveBeenNthCalledWith(1, PROFILE);
    expect(openExternalUrl).toHaveBeenNthCalledWith(2, HOME);
    expect(onSurface).not.toHaveBeenCalled();
  });

  it('coverAttributionLabel words both cases', () => {
    expect(coverAttributionLabel({ kind: 'credit', name: 'Alex Doe', profileUrl: PROFILE })).toBe(
      'Photo by Alex Doe on Unsplash'
    );
    expect(coverAttributionLabel({ kind: 'unsplash' })).toBe('by Unsplash');
  });
});
