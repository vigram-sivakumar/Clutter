// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Overlay } from '@components/overlay/Overlay';
import { installNativeContextMenuPolicy, suppressNativeContextMenu } from './suppressNativeContextMenu';

let stop: () => void;
beforeEach(() => {
  // jsdom has no ResizeObserver; the shared Overlay's positioning observes with one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  stop = suppressNativeContextMenu();
});
afterEach(() => {
  stop();
  cleanup();
});

const rightClick = (target: Element | Document) => {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('suppressNativeContextMenu', () => {
  it('suppresses the native menu on blank space, the document and any element', () => {
    render(<div data-testid="area">area</div>);

    expect(rightClick(screen.getByTestId('area')).defaultPrevented).toBe(true);
    expect(rightClick(document.body).defaultPrevented).toBe(true);
    expect(rightClick(document).defaultPrevented).toBe(true);
  });

  it('does not stop propagation: a custom handler still runs', () => {
    const custom = vi.fn();
    render(
      <div data-testid="row" onContextMenu={custom}>
        row
      </div>
    );

    rightClick(screen.getByTestId('row'));

    expect(custom).toHaveBeenCalledOnce();
  });

  it('leaves an open overlay\'s dismissal as it was: it closes, and nothing opens twice', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <div data-testid="row" onContextMenu={() => setOpen(true)}>
            row
          </div>
          <Overlay open={open} onClose={() => setOpen(false)} position="centered">
            <div>menu</div>
          </Overlay>
        </>
      );
    }
    render(<Harness />);

    const event = rightClick(screen.getByTestId('row'));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByText('menu')).not.toBeInTheDocument();
  });

  it('does not interfere with left-click or text selection events', () => {
    const onClick = vi.fn();
    render(<button onClick={onClick}>go</button>);
    fireEvent.click(screen.getByText('go'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stops suppressing once cleaned up', () => {
    stop();
    expect(rightClick(document.body).defaultPrevented).toBe(false);
    stop = suppressNativeContextMenu();
  });
});

describe('installNativeContextMenuPolicy', () => {
  it('development: leaves the native menu alone on blank space and elsewhere', () => {
    stop();
    const cleanup = installNativeContextMenuPolicy(false);

    expect(rightClick(document.body).defaultPrevented).toBe(false);

    cleanup();
    stop = suppressNativeContextMenu();
  });

  it('production: suppresses it on blank space, while custom handlers still run', () => {
    stop();
    const cleanup = installNativeContextMenuPolicy(true);
    const custom = vi.fn();
    render(<div data-testid="row" onContextMenu={custom}>row</div>);

    expect(rightClick(document.body).defaultPrevented).toBe(true);
    rightClick(screen.getByTestId('row'));
    expect(custom).toHaveBeenCalledOnce();

    cleanup();
    stop = suppressNativeContextMenu();
  });

  it('defaults to the build mode (PROD), which is false under test', () => {
    stop();
    const cleanup = installNativeContextMenuPolicy();
    expect(rightClick(document.body).defaultPrevented).toBe(import.meta.env.PROD);
    cleanup();
    stop = suppressNativeContextMenu();
  });
});
