// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { useRef, useState, type MutableRefObject } from 'react';
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
import type { OverlayAlignment, OverlayScrim, OverlaySide } from './Overlay.types';

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
  scrim?: OverlayScrim;
  animate?: boolean;
  onClose?: () => void;
};

function Harness({
  initialOpen = true,
  side,
  alignment,
  offset,
  backdrop,
  scrim,
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
        anchorRef={anchorRef}
        side={side}
        alignment={alignment}
        offset={offset}
        backdrop={backdrop}
        scrim={scrim}
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

type CenteredHarnessProps = {
  initialOpen?: boolean;
  onClose?: () => void;
};

function CenteredHarness({ initialOpen = true, onClose }: CenteredHarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const returnFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={returnFocusRef}
        type="button"
        data-testid="return-focus-target"
      >
        Open centered overlay
      </button>

      <Overlay
        position="centered"
        open={open}
        returnFocusRef={returnFocusRef}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">Centered action</button>
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

  it('centers a side overlay vertically on the anchor (left, center)', async () => {
    render(<Harness side="left" alignment="center" />);

    const surface = document.body.querySelector('.overlay__surface') as HTMLDivElement;
    const content = document.body.querySelector('.overlay__content') as HTMLDivElement;

    // anchor: top 100, height 40 → middle at 120; surface height 120 → top 60.
    // left of the anchor: 200 − 160 (surface width) − 6 (offset) = 34.
    await waitFor(() => {
      expect(surface.style.top).toBe('60px');
      expect(surface.style.left).toBe('34px');
    });

    expect(content.style.transformOrigin).toBe('right center');
    expect(content.classList.contains('overlay__content--left')).toBe(true);
  });

  it('centers a bottom overlay horizontally on the anchor', async () => {
    render(<Harness side="bottom" alignment="center" />);

    const surface = document.body.querySelector('.overlay__surface') as HTMLDivElement;
    const content = document.body.querySelector('.overlay__content') as HTMLDivElement;

    // anchor: left 200, width 100 → middle at 250; surface width 160 → left 170.
    await waitFor(() => {
      expect(surface.style.top).toBe('146px');
      expect(surface.style.left).toBe('170px');
    });

    expect(content.style.transformOrigin).toBe('top center');
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

  it('defaults to the default scrim strength without an explicit scrim class', () => {
    render(<Harness backdrop="tinted" />);

    const backdrop = document.body.querySelector(
      '.overlay__backdrop'
    ) as HTMLDivElement;

    expect(backdrop.classList.contains('overlay__backdrop--tinted')).toBe(
      true
    );
    expect(
      backdrop.classList.contains('overlay__backdrop--scrim-strong')
    ).toBe(false);
  });

  it('applies the strong scrim class when scrim="strong"', () => {
    render(<Harness backdrop="tinted" scrim="strong" />);

    const backdrop = document.body.querySelector(
      '.overlay__backdrop'
    ) as HTMLDivElement;

    expect(
      backdrop.classList.contains('overlay__backdrop--scrim-strong')
    ).toBe(true);
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

  it('suppressReturnFocusRef, set true before closing, skips exactly that one restoration and resets itself for the next close', async () => {
    function SuppressibleHarness({
      suppressReturnFocusRef,
    }: {
      suppressReturnFocusRef: MutableRefObject<boolean>;
    }) {
      const [open, setOpen] = useState(true);
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
            anchorRef={anchorRef}
            suppressReturnFocusRef={suppressReturnFocusRef}
            onClose={() => setOpen(false)}
          >
            <button type="button">Overlay action</button>
          </Overlay>
        </>
      );
    }

    function Wrapper() {
      const suppressReturnFocusRef = useRef(false);
      return (
        <>
          <button
            type="button"
            data-testid="suppress-trigger"
            onClick={() => {
              suppressReturnFocusRef.current = true;
            }}
          >
            Suppress next
          </button>
          <SuppressibleHarness suppressReturnFocusRef={suppressReturnFocusRef} />
        </>
      );
    }

    render(<Wrapper />);

    const anchor = screen.getByTestId('overlay-anchor');
    const overlayAction = screen.getByText('Overlay action');

    // Suppressed close: focus stays wherever it already is (does NOT jump
    // to the anchor).
    fireEvent.click(screen.getByTestId('suppress-trigger'));
    overlayAction.focus();
    expect(document.activeElement).toBe(overlayAction);

    fireEvent.keyDown(document, { key: 'Escape' });

    // Give any (incorrect) restoration a chance to happen before asserting
    // it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).not.toBe(anchor);

    // Reopen (without suppressing again) and close normally — the flag
    // must have been consumed/reset by the suppressed close above, so
    // this later, ordinary close still restores focus as usual.
    fireEvent.click(anchor);
    const overlayActionAgain = screen.getByText('Overlay action');
    overlayActionAgain.focus();
    expect(document.activeElement).toBe(overlayActionAgain);

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

  it('repositions when the anchor moves for a reason that fires neither a resize nor a scroll event (e.g. a sibling/ancestor layout change, such as a cover image animating into the page)', async () => {
    render(<Harness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('146px');
    });

    // Simulates the anchor's own box being unchanged in size (still
    // 100x40, same as the original anchorRect) but shifted on screen —
    // exactly what a layout reflow elsewhere in the document does, and
    // exactly the case ResizeObserver (which only reports size changes)
    // cannot detect. Deliberately fires no window resize/scroll event.
    anchorRect = createRect({
      top: 300,
      left: 400,
      width: 100,
      height: 40,
    });

    await waitFor(() => {
      expect(surface.style.top).toBe('346px');
      expect(surface.style.left).toBe('400px');
    });
  });
});

describe('Overlay centered positioning', () => {
  it('centers the surface in the viewport without an anchor', async () => {
    render(<CenteredHarness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;
    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('324px');
      expect(surface.style.left).toBe('432px');
    });

    expect(content.style.transformOrigin).toBe('center center');
    expect(content.classList.contains('overlay__content--center')).toBe(true);
  });

  it('uses a scale-only centered entrance animation', () => {
    render(<CenteredHarness />);

    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    expect(content.classList.contains('overlay__content--animated')).toBe(true);
    expect(content.classList.contains('overlay__content--center')).toBe(true);
  });

  it('restores focus to returnFocusRef when a centered overlay closes', async () => {
    render(<CenteredHarness />);

    const trigger = screen.getByTestId('return-focus-target');
    const centeredAction = screen.getByText('Centered action');

    centeredAction.focus();
    expect(document.activeElement).toBe(centeredAction);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('does not reposition centered overlays when the window scrolls', async () => {
    render(<CenteredHarness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.top).toBe('324px');
      expect(surface.style.left).toBe('432px');
    });

    fireEvent.scroll(document);

    expect(surface.style.top).toBe('324px');
    expect(surface.style.left).toBe('432px');
  });

  it('repositions centered overlays when the window is resized', async () => {
    render(<CenteredHarness />);

    const surface = document.body.querySelector(
      '.overlay__surface'
    ) as HTMLDivElement;

    await waitFor(() => {
      expect(surface.style.left).toBe('432px');
    });

    surfaceRect = createRect({
      top: 0,
      left: 0,
      width: 200,
      height: 100,
    });

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800,
    });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(surface.style.top).toBe('250px');
      expect(surface.style.left).toBe('300px');
    });
  });
});

describe('Overlay — a right-click while open dismisses it', () => {
  const rightClick = (target: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(target, event);
    return event;
  };

  function Harness({ initiallyOpen = true, dismissible = true, dismissOnContextMenu }: { initiallyOpen?: boolean; dismissible?: boolean; dismissOnContextMenu?: boolean }) {
    const [open, setOpen] = useState(initiallyOpen);
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={anchorRef} onClick={() => setOpen(true)}>
          anchor
        </button>
        <div data-testid="row" onContextMenu={() => setOpen(true)}>
          row
        </div>
        <Overlay open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} dismissible={dismissible} dismissOnContextMenu={dismissOnContextMenu}>
          <div>content</div>
          <input aria-label="field" />
        </Overlay>
      </>
    );
  }

  it('dismisses on a right-click anywhere and prevents the native menu', () => {
    render(<Harness />);

    const event = rightClick(document.body);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('stops the event, so another context-menu handler cannot open a replacement in the same interaction', () => {
    render(<Harness />);

    rightClick(screen.getByTestId('row'));

    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('works the same for an overlay opened by a button click, including a right-click on that button', () => {
    render(<Harness initiallyOpen={false} />);
    fireEvent.click(screen.getByText('anchor'));
    expect(screen.getByText('content')).toBeInTheDocument();

    const event = rightClick(screen.getByText('anchor'));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('a later right-click, with nothing open, reaches handlers and the platform normally', () => {
    render(<Harness />);
    rightClick(document.body);

    const event = rightClick(screen.getByTestId('row'));

    expect(event.defaultPrevented).toBe(false);
    // The row's own handler ran (it opens the overlay): the correct menu opens normally.
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('leaves a text field inside the overlay its native menu, and respects dismissible and the opt-out', () => {
    const { unmount } = render(<Harness />);
    expect(rightClick(screen.getByLabelText('field')).defaultPrevented).toBe(false);
    expect(screen.getByText('content')).toBeInTheDocument();
    unmount();

    const notDismissible = render(<Harness dismissible={false} />);
    expect(rightClick(document.body).defaultPrevented).toBe(false);
    expect(screen.getByText('content')).toBeInTheDocument();
    notDismissible.unmount();

    render(<Harness dismissOnContextMenu={false} />);
    expect(rightClick(document.body).defaultPrevented).toBe(false);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('adds no listener while nothing is open', () => {
    render(<Harness initiallyOpen={false} />);
    expect(rightClick(document.body).defaultPrevented).toBe(false);
  });
});

describe('Overlay — focus is handed back by how it was dismissed', () => {
  function Harness({ returnToInput = false }: { returnToInput?: boolean }) {
    const [open, setOpen] = useState(true);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    return (
      <>
        <button ref={buttonRef}>trigger</button>
        <input ref={inputRef} aria-label="field" />
        <Overlay
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={buttonRef}
          returnFocusRef={returnToInput ? inputRef : undefined}
        >
          <div>content</div>
        </Overlay>
      </>
    );
  }

  it('opened and closed from the keyboard, focus goes back to the trigger (keyboard focus stays correct)', () => {
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('trigger')).toHaveFocus();
  });

  it('opened with the mouse, Escape does not push focus onto the trigger (no ring around a button that was only clicked)', () => {
    fireEvent.pointerDown(document.body);
    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('a click outside does not push focus onto the trigger (no ring from a pointer dismissal)', () => {
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    render(<Harness />);
    const backdrop = document.querySelector('.overlay__backdrop')!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('a right-click dismissal does not push focus onto the trigger either', () => {
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    render(<Harness />);
    fireEvent.contextMenu(document.body);
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('a pointer dismissal still returns focus to a text field that asked for it', () => {
    fireEvent.pointerDown(document.body);
    render(<Harness returnToInput />);
    const backdrop = document.querySelector('.overlay__backdrop')!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.getByLabelText('field')).toHaveFocus();
  });

  it('opened from the keyboard, a pointer press and then Escape still restores focus (the last input is the keyboard)', () => {
    fireEvent.keyDown(document, { key: 'Enter' });
    render(<Harness />);
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('trigger')).toHaveFocus();
  });
});

describe('Overlay dragRegion', () => {
  afterEach(cleanup);

  function mountOverlay(props: { dragRegion?: boolean; backdrop?: false | 'transparent' | 'tinted' }) {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    render(
      <Overlay open onClose={() => {}} anchorRef={{ current: anchor }} {...props}>
        <button type="button">Overlay action</button>
      </Overlay>
    );
  }

  it('is on by default: the shared drag strip sits inside the backdrop, not in the surface', () => {
    mountOverlay({ backdrop: 'tinted' });
    const strips = document.querySelectorAll('[data-tauri-drag-region]');
    expect(strips).toHaveLength(1);
    expect(strips[0]!.classList.contains('tauri-drag-strip')).toBe(true);
    expect(strips[0]!.parentElement).toBe(document.querySelector('.overlay__backdrop'));
    expect(document.querySelector('.overlay__surface [data-tauri-drag-region]')).toBeNull();
  });

  it('covers a transparent backdrop too (menus and popovers cover the app as well)', () => {
    mountOverlay({ backdrop: 'transparent' });
    expect(document.querySelectorAll('.overlay__backdrop > [data-tauri-drag-region]')).toHaveLength(1);
  });

  it('can be switched off', () => {
    mountOverlay({ backdrop: 'tinted', dragRegion: false });
    expect(document.querySelector('[data-tauri-drag-region]')).toBeNull();
  });

  it('renders no strip without a backdrop to hold it', () => {
    mountOverlay({ backdrop: false });
    expect(document.querySelector('[data-tauri-drag-region]')).toBeNull();
  });

  it('keeps the overlay content outside the drag region', () => {
    mountOverlay({ backdrop: 'tinted' });
    expect(screen.getByText('Overlay action').closest('[data-tauri-drag-region]')).toBeNull();
  });
});
