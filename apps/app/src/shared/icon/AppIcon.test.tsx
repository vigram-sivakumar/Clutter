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

describe('notePencil', () => {
  it('renders the approved note and outlined pencil paths with the shared icon stroke', () => {
    const { container } = render(<AppIcon icon="notePencil" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
    expect(svg).toHaveAttribute('stroke-width', '1.2');
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute('d', 'M6.5 2H5C3.34315 2 2 3.34315 2 5L2 11C2 12.6569 3.34315 14 5 14L11 14C12.6569 14 14 12.6569 14 11V9');
    expect(paths[1]).toHaveAttribute('d', 'M6.47434 9.84189L8.32814 9.22395C8.76997 9.07668 9.17145 8.82855 9.50078 8.49922L13.5 4.5C14.0523 3.94772 14.0523 3.05228 13.5 2.5C12.9477 1.94772 12.0523 1.94772 11.5 2.5L7.50078 6.49922C7.17145 6.82855 6.92332 7.23003 6.77605 7.67186L6.15811 9.52566C6.09297 9.7211 6.2789 9.90703 6.47434 9.84189Z');
    for (const path of paths) {
      expect(path).toHaveAttribute('stroke', 'currentColor');
      expect(path).toHaveAttribute('stroke-linecap', 'round');
    }
    expect(container.querySelector('circle')).toBeNull();
  });
});
