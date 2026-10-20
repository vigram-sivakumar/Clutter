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
