// @vitest-environment jsdom

import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { Overlay } from './Overlay';
import type { OverlayAlignment, OverlaySide } from './Overlay.types';

type RectInput = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function createRect({ top, left, width, height }: RectInput): DOMRect {
  return {
    x: left,
    y: top,
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

type HarnessProps = {
  initialOpen?: boolean;
  side?: OverlaySide;
  alignment?: OverlayAlignment;
  offset?: number;
  backdrop?: false | 'transparent' | 'tinted';
  animate?: boolean;
  onClose?: () => void;
};

function Harness({
  initialOpen = true,
  side,
  alignment,
  offset,
  backdrop,
  animate,
  onClose,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid="overlay-anchor"
        onClick={() => setOpen(true)}
      >
        Open overlay
      </button>

      <Overlay
        open={open}
        anchorRef={anchorRef as RefObject<HTMLElement>}
        side={side}
        alignment={alignment}
        offset={offset}
        backdrop={backdrop}
        animate={animate}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">Overlay action</button>
      </Overlay>
    </>
  );
}

let anchorRect: DOMRect;
let surfaceRect: DOMRect;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 768,
  });

  anchorRect = createRect({
    top: 100,
    left: 200,
    width: 100,
    height: 40,
  });

  surfaceRect = createRect({
    top: 0,
    left: 0,
    width: 160,
    height: 120,
  });

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      if (this.classList.contains('overlay__surface')) {
        return surfaceRect;
      }

      if (this.dataset.testid === 'overlay-anchor') {
        return anchorRect;
      }

      return createRect({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
      });
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Overlay', () => {
  it('does not render when closed', () => {
    render(<Harness initialOpen={false} />);

    expect(screen.queryByText('Overlay action')).toBeNull();
    expect(document.body.querySelector('.overlay')).toBeNull();
  });

  it('renders its content in a portal attached to document.body', () => {
    const { container } = render(<Harness />);

    expect(screen.getByText('Overlay action')).not.toBeNull();
    expect(container.querySelector('.overlay')).toBeNull();
    expect(document.body.querySelector('.overlay')).not.toBeNull();
  });

  it('uses bottom and start as the default position', async () => {
    render(<Harness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;
    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('146px');
      expect(surface.style.left).toBe('200px');
    });

    expect(content.style.transformOrigin).toBe('top left');
    expect(content.classList.contains('overlay__content--animated')).toBe(true);
    expect(content.classList.contains('overlay__content--bottom')).toBe(true);
  });

  it('positions end alignment against the far edge of the anchor', async () => {
    render(<Harness side="bottom" alignment="end" />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;
    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('146px');
      expect(surface.style.left).toBe('140px');
    });

    expect(content.style.transformOrigin).toBe('top right');
    expect(content.classList.contains('overlay__content--bottom')).toBe(true);
  });

  it('omits animation classes when animation is disabled', () => {
    render(<Harness animate={false} />);

    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    expect(content.classList.contains('overlay__content--animated')).toBe(
      false
    );
    expect(content.classList.contains('overlay__content--bottom')).toBe(false);
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const backdrop = document.body.querySelector(
      '.overlay__backdrop'
    ) as HTMLDivElement;

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Overlay action')).toBeNull();
  });

  it('a backdrop click does not bubble into an ancestor click handler (React bubbles portaled events through the component tree, not the DOM tree)', () => {
    const onClose = vi.fn();
    const onAncestorClick = vi.fn();

    render(
      <div onClick={onAncestorClick}>
        <Harness onClose={onClose} />
      </div>
    );

    const backdrop = document.body.querySelector(
      '.overlay__backdrop'
    ) as HTMLDivElement;

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAncestorClick).not.toHaveBeenCalled();
  });

  it('does not render a backdrop when backdrop is disabled', () => {
    render(<Harness backdrop={false} />);

    expect(document.body.querySelector('.overlay__backdrop')).toBeNull();
    expect(screen.getByText('Overlay action')).not.toBeNull();
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Overlay action')).toBeNull();
  });

  it('ignores keyboard keys other than Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Overlay action')).not.toBeNull();
  });

  it('restores focus to the anchor after closing', async () => {
    render(<Harness />);

    const anchor = screen.getByTestId('overlay-anchor');
    const overlayAction = screen.getByText('Overlay action');

    overlayAction.focus();
    expect(document.activeElement).toBe(overlayAction);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(document.activeElement).toBe(anchor);
    });
  });

  it('flips above the anchor when there is not enough room below', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 300,
    });

    anchorRect = createRect({
      top: 260,
      left: 100,
      width: 80,
      height: 20,
    });

    surfaceRect = createRect({
      top: 0,
      left: 0,
      width: 120,
      height: 100,
    });

    render(<Harness side="bottom" alignment="start" offset={6} />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;
    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('154px');
      expect(surface.style.left).toBe('100px');
    });

    expect(content.style.transformOrigin).toBe('bottom left');
    expect(content.classList.contains('overlay__content--top')).toBe(true);
  });

  it('flips to the left when there is not enough room on the right', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 300,
    });

    anchorRect = createRect({
      top: 100,
      left: 260,
      width: 20,
      height: 40,
    });

    surfaceRect = createRect({
      top: 0,
      left: 0,
      width: 120,
      height: 100,
    });

    render(<Harness side="right" alignment="start" offset={6} />);

    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(content.style.transformOrigin).toBe('right top');
    });

    expect(content.classList.contains('overlay__content--left')).toBe(true);
  });

  it('preserves end alignment when the side flips', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 300,
    });

    anchorRect = createRect({
      top: 260,
      left: 100,
      width: 80,
      height: 20,
    });

    surfaceRect = createRect({
      top: 0,
      left: 0,
      width: 120,
      height: 100,
    });

    render(<Harness side="bottom" alignment="end" offset={6} />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;
    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('154px');
      expect(surface.style.left).toBe('60px');
    });

    expect(content.style.transformOrigin).toBe('bottom right');
    expect(content.classList.contains('overlay__content--top')).toBe(true);
  });

  it('repositions when a scroll event moves the anchor', async () => {
    render(<Harness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('146px');
    });

    anchorRect = createRect({
      top: 180,
      left: 220,
      width: 100,
      height: 40,
    });

    fireEvent.scroll(document);

    await waitFor(() => {
      expect(surface.style.top).toBe('226px');
      expect(surface.style.left).toBe('220px');
    });
  });

  it('repositions when the window is resized', async () => {
    render(<Harness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('146px');
    });

    anchorRect = createRect({
      top: 140,
      left: 260,
      width: 100,
      height: 40,
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(surface.style.top).toBe('186px');
      expect(surface.style.left).toBe('260px');
    });
  });
});
