// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StartupFrame } from './StartupFrame';

afterEach(cleanup);

describe('StartupFrame backdrop', () => {
  it('paints a given backdrop first, under the drag strip and the message', () => {
    const { container } = render(
      <StartupFrame backdrop={<div data-testid="art" />}>Opening</StartupFrame>
    );
    const frame = container.querySelector('.startup-frame')!;
    const children = [...frame.children];

    expect(children[0]).toHaveAttribute('data-testid', 'art');
    expect(children.at(-1)).toHaveClass('startup-frame__message');
    expect(children.length).toBe(3); // backdrop, drag strip, message
  });

  it('is the plain frame without one, and a backdrop does not mark it as an image frame', () => {
    const { container, rerender } = render(
      <StartupFrame>Opening</StartupFrame>
    );
    expect(container.querySelector('.startup-frame')!.children).toHaveLength(2);

    rerender(<StartupFrame backdrop={<div />}>Opening</StartupFrame>);
    expect(container.querySelector('.startup-frame')).not.toHaveAttribute(
      'data-backdrop'
    );
  });
});
