// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useResponsiveSnap } from './useResponsiveSnap';

afterEach(cleanup);

/** Records whether the attribute was on at each style flush: the moment the browser would evaluate transitions. */
function setup(initial: { narrow: boolean; coverNarrow: boolean; manual?: boolean }) {
  const flushes: boolean[] = [];

  function Harness({ narrow, coverNarrow, manual }: { narrow: boolean; coverNarrow: boolean; manual?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const snap = useResponsiveSnap(narrow, coverNarrow, ref);

    return (
      <div data-testid="layout" data-responsive-snap={snap || undefined} data-manual={manual || undefined}>
        <div
          ref={(el) => {
            (ref as { current: HTMLDivElement | null }).current = el;
            if (el) {
              el.getBoundingClientRect = () => {
                flushes.push(el.parentElement!.hasAttribute('data-responsive-snap'));
                return new DOMRect();
              };
            }
          }}
        />
      </div>
    );
  }

  const utils = render(<Harness {...initial} />);
  const layout = () => utils.getByTestId('layout');
  const update = (next: { narrow: boolean; coverNarrow: boolean; manual?: boolean }) => utils.rerender(<Harness {...next} />);

  return { flushes, layout, update };
}

describe('useResponsiveSnap — suppression lasts one commit', () => {
  it('is off on the first render, even when launched narrow', () => {
    const { layout, flushes } = setup({ narrow: true, coverNarrow: false });

    expect(layout()).not.toHaveAttribute('data-responsive-snap');
    expect(flushes).toEqual([]);
  });

  it('is on when the style flush happens at the sidebar breakpoint, then cleared', () => {
    const { layout, flushes, update } = setup({ narrow: false, coverNarrow: false });

    update({ narrow: true, coverNarrow: false });

    expect(flushes).toEqual([true]);
    expect(layout()).not.toHaveAttribute('data-responsive-snap');
  });

  it('covers the cover breakpoint too', () => {
    const { layout, flushes, update } = setup({ narrow: true, coverNarrow: false });

    update({ narrow: true, coverNarrow: true });

    expect(flushes).toEqual([true]);
    expect(layout()).not.toHaveAttribute('data-responsive-snap');
  });

  it('handles both breakpoints flipping in one render with a single suppression', () => {
    const { layout, flushes, update } = setup({ narrow: false, coverNarrow: false });

    update({ narrow: true, coverNarrow: true });
    expect(flushes).toEqual([true]);

    update({ narrow: false, coverNarrow: false });
    expect(flushes).toEqual([true, true]);
    expect(layout()).not.toHaveAttribute('data-responsive-snap');
  });

  it('does not suppress an unrelated update after a flip (a manual toggle keeps its animation)', () => {
    const { layout, flushes, update } = setup({ narrow: false, coverNarrow: false });

    update({ narrow: true, coverNarrow: false });
    update({ narrow: true, coverNarrow: false, manual: true });

    expect(flushes).toEqual([true]);
    expect(layout()).toHaveAttribute('data-manual');
    expect(layout()).not.toHaveAttribute('data-responsive-snap');
  });
});
