// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppIcon } from './AppIcon';

afterEach(cleanup);

describe('AppIcon data-icon', () => {
  it('names the icon so CSS can style one by kind (the menu selection tick)', () => {
    const { container } = render(<AppIcon icon="tick" />);
    expect(container.querySelector('.app-icon')).toHaveAttribute(
      'data-icon',
      'tick'
    );
  });

  it('is absent for an emoji or an empty slot', () => {
    const { container } = render(
      <>
        <AppIcon emoji="🎉" />
        <AppIcon />
      </>
    );
    expect(container.querySelectorAll('[data-icon]')).toHaveLength(0);
  });
});

describe('AppIcon stroke', () => {
  it('draws a 1.2px line at every size: the default stroke width, with the fixed-stroke class that keeps it from scaling', () => {
    const { container } = render(
      <>
        <AppIcon icon="dismiss" />
        <AppIcon icon="dismiss" size={10} />
        <AppIcon icon="dismiss" size={64} />
      </>
    );

    for (const icon of container.querySelectorAll('.app-icon')) {
      expect(icon).toHaveClass('app-icon--fixed-stroke');
      expect(icon.querySelector('svg')).toHaveAttribute('stroke-width', '1.2');
    }
  });

  it('keeps its own scaling stroke when a caller passes a strokeWidth', () => {
    const { container } = render(<AppIcon icon="dismiss" size={64} strokeWidth={0.8} />);

    expect(container.querySelector('.app-icon')).not.toHaveClass('app-icon--fixed-stroke');
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '0.8');
  });

  it('has no fixed-stroke class on an emoji or an empty slot', () => {
    const { container } = render(
      <>
        <AppIcon emoji="🎉" />
        <AppIcon />
      </>
    );

    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
});

