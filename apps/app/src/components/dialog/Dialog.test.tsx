// @vitest-environment jsdom

import { useRef, useState } from 'react';
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

import { Dialog } from './Dialog';
import type { OverlayBackdrop } from '../overlay/Overlay.types';

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
  size?: 'small' | 'medium' | 'large';
  backdrop?: OverlayBackdrop;
  animate?: boolean;
  onClose?: () => void;
};

function Harness({
  initialOpen = true,
  size,
  backdrop,
  animate,
  onClose,
}: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const returnFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={returnFocusRef}
        type="button"
        data-testid="return-focus-target"
      >
        Open dialog
      </button>

      <Dialog
        open={open}
        size={size}
        backdrop={backdrop}
        animate={animate}
        returnFocusRef={returnFocusRef}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">Dialog action</button>
      </Dialog>
    </>
  );
}

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

describe('Dialog', () => {
  it('does not render when open={false}', () => {
    render(<Harness initialOpen={false} />);

    expect(screen.queryByText('Dialog action')).toBeNull();
    expect(document.body.querySelector('.overlay')).toBeNull();
  });

  it('renders children when open', () => {
    const { container } = render(<Harness />);

    expect(screen.getByText('Dialog action')).not.toBeNull();
    expect(container.querySelector('.overlay')).toBeNull();
    expect(document.body.querySelector('.overlay')).not.toBeNull();
  });

  it('uses centered positioning', async () => {
    render(<Harness />);

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

  it('uses tinted backdrop by default', () => {
    render(<Harness />);

    const backdrop = document.body.querySelector(
      '.overlay__backdrop'
    ) as HTMLDivElement;

    expect(backdrop).not.toBeNull();
    expect(backdrop.classList.contains('overlay__backdrop--tinted')).toBe(true);
  });

  it('allows explicit backdrop override', () => {
    render(<Harness backdrop={false} />);

    expect(document.body.querySelector('.overlay__backdrop')).toBeNull();
    expect(screen.getByText('Dialog action')).not.toBeNull();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const backdrop = document.body.querySelector(
      '.overlay__backdrop'
    ) as HTMLDivElement;

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Dialog action')).toBeNull();
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Dialog action')).toBeNull();
  });

  it('restores focus to returnFocusRef when the dialog closes', async () => {
    render(<Harness />);

    const trigger = screen.getByTestId('return-focus-target');
    const dialogAction = screen.getByText('Dialog action');

    dialogAction.focus();
    expect(document.activeElement).toBe(dialogAction);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('applies size classes', () => {
    render(<Harness size="large" />);

    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    expect(content.classList.contains('dialog')).toBe(true);
    expect(content.classList.contains('dialog--large')).toBe(true);
  });

  it('omits animation classes when animate={false}', () => {
    render(<Harness animate={false} />);

    const content = document.body.querySelector(
      '.overlay__content'
    ) as HTMLDivElement;

    expect(content.classList.contains('overlay__content--animated')).toBe(
      false
    );
    expect(content.classList.contains('overlay__content--center')).toBe(false);
  });
});
