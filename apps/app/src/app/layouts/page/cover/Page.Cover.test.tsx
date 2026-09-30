// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageCover } from './Page.Cover';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

let createdImages: HTMLImageElement[] = [];
const OriginalImage = window.Image;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  createdImages = [];
  vi.stubGlobal(
    'Image',
    function (this: unknown, ...args: [number?, number?]) {
      const img = new OriginalImage(...args);
      createdImages.push(img);
      return img;
    } as unknown as typeof Image
  );
  // jsdom doesn't implement Pointer Capture; PageCover calls it defensively
  // for the drag gesture, so stub it as a no-op for the drag to run — same
  // convention as SidebarResizeHandle.test.tsx's identical stub.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

function renderCover(overrides: Partial<Parameters<typeof PageCover>[0]> = {}) {
  const onRemove = vi.fn();
  const onHide = vi.fn();
  const onSetCoverImage = vi.fn();
  const onSetCoverImageFromUpload = vi.fn();
  const utils = render(
    <PageCover
      src="cover.png"
      onRemove={onRemove}
      onHide={onHide}
      onSetCoverImage={onSetCoverImage}
      onSetCoverImageFromUpload={onSetCoverImageFromUpload}
      {...overrides}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return { ...utils, onRemove, onHide, onSetCoverImage, onSetCoverImageFromUpload };
}

describe('PageCover — More actions menu', () => {
  it('lists Change cover image, Hide, and Remove, in that order, when onSetCoverImage is supplied', () => {
    renderCover();

    const labels = screen.getAllByText(/Change cover image|Hide|Remove/).map((el) => el.textContent);
    expect(labels).toEqual(['Change cover image', 'Hide', 'Remove']);
  });

  it('omits Change cover image when onSetCoverImage is not supplied, leaving Hide/Remove unchanged', () => {
    renderCover({ onSetCoverImage: undefined });

    expect(screen.queryByText('Change cover image')).not.toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('clicking Hide calls onHide and closes the menu, unchanged from before', () => {
    const { onHide, onSetCoverImage, onRemove } = renderCover();

    fireEvent.click(screen.getByText('Hide'));

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onSetCoverImage).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(document.querySelector('.menu')).not.toBeInTheDocument();
  });

  it('clicking Remove calls onRemove immediately, with no removal animation or delay', () => {
    const { onRemove, onHide, onSetCoverImage } = renderCover();

    fireEvent.click(screen.getByText('Remove'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onHide).not.toHaveBeenCalled();
    expect(onSetCoverImage).not.toHaveBeenCalled();
    expect(document.querySelector('.menu')).not.toBeInTheDocument();
  });

  it('clicking Change cover image swaps in the existing ImagePicker, in the same Overlay (menu stays open)', () => {
    renderCover();

    fireEvent.click(screen.getByText('Change cover image'));

    expect(document.querySelector('.menu')).not.toBeInTheDocument();
    expect(document.querySelector('.image-picker')).toBeInTheDocument();
  });

  it('submitting a link in the picker replaces the cover via onSetCoverImage — no onRemove, no onHide first', () => {
    const { onSetCoverImage, onRemove, onHide } = renderCover();

    fireEvent.click(screen.getByText('Change cover image'));
    fireEvent.click(screen.getByText('Link'));
    fireEvent.change(screen.getByPlaceholderText('Paste image URL'), {
      target: { value: 'https://example.com/new.png' },
    });
    fireEvent.click(screen.getByText(/^Add$|^Adding…$/));
    fireEvent.load(createdImages[0]!);

    expect(onSetCoverImage).toHaveBeenCalledWith('https://example.com/new.png');
    expect(onRemove).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
  });

  it("ImagePicker's own dismiss button returns to the root menu rather than closing the whole overlay", () => {
    renderCover();

    fireEvent.click(screen.getByText('Change cover image'));
    fireEvent.click(document.querySelector('.image-picker__header button')!);

    expect(screen.getByText('Change cover image')).toBeInTheDocument();
    expect(document.querySelector('.image-picker')).not.toBeInTheDocument();
  });

  it('reopening after leaving on the picker view resets to the root menu', () => {
    renderCover();

    fireEvent.click(screen.getByText('Change cover image'));
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger); // closes
    fireEvent.click(trigger); // reopens

    expect(screen.getByText('Change cover image')).toBeInTheDocument();
    expect(document.querySelector('.image-picker')).not.toBeInTheDocument();
  });
});

describe('PageCover — Position menu', () => {
  it('omits the Position section when onSetLayout is not supplied', () => {
    renderCover({ onSetLayout: undefined });

    expect(screen.queryByText('Position')).not.toBeInTheDocument();
    expect(screen.queryByText('Right')).not.toBeInTheDocument();
    expect(screen.queryByText('Top')).not.toBeInTheDocument();
  });

  it('lists Right and Top when onSetLayout is supplied, with the current layout selected', () => {
    renderCover({ onSetLayout: vi.fn(), layout: 'above' });

    expect(screen.getByText('Position')).toBeInTheDocument();
    const side = screen.getByText('Right').closest('[role="menuitem"]')!;
    const above = screen.getByText('Top').closest('[role="menuitem"]')!;
    expect(side.className).not.toContain('entry-selected');
    expect(above.className).toContain('entry-selected');
  });

  it('clicking Top calls onSetLayout("above") and closes the menu — never onHide/onRemove/onSetCoverImage', () => {
    const onSetLayout = vi.fn();
    const { onHide, onRemove, onSetCoverImage } = renderCover({ onSetLayout });

    fireEvent.click(screen.getByText('Top'));

    expect(onSetLayout).toHaveBeenCalledWith('above');
    expect(onHide).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(onSetCoverImage).not.toHaveBeenCalled();
    expect(document.querySelector('.menu')).not.toBeInTheDocument();
  });

  it('clicking Right calls onSetLayout("side")', () => {
    const onSetLayout = vi.fn();
    renderCover({ onSetLayout, layout: 'above' });

    fireEvent.click(screen.getByText('Right'));

    expect(onSetLayout).toHaveBeenCalledWith('side');
  });

  it('defaults the selected row to Right when layout is not supplied', () => {
    renderCover({ onSetLayout: vi.fn() });

    const side = screen.getByText('Right').closest('[role="menuitem"]')!;
    expect(side.className).toContain('entry-selected');
  });
});

describe('PageCover — add/change/remove has no lifecycle animation machinery', () => {
  it('renders the image immediately on mount, with no loading/removing markers', () => {
    render(<PageCover src="cover.png" />);

    const cover = document.querySelector('.page__cover')!;
    expect(cover).not.toHaveAttribute('data-loading');
    expect(cover).not.toHaveAttribute('data-removing');
    expect(cover).not.toHaveAttribute('data-load-failed');
    expect(document.querySelector('.page-cover__image')).toBeInTheDocument();
  });

  it('replacing src just swaps the rendered image, with no transient state in between', () => {
    const { rerender } = render(<PageCover src="cover.png" />);

    rerender(<PageCover src="cover2.png" />);

    const img = document.querySelector<HTMLImageElement>('.page-cover__image')!;
    expect(img.src).toContain('cover2.png');
    const cover = document.querySelector('.page__cover')!;
    expect(cover).not.toHaveAttribute('data-loading');
    expect(cover).not.toHaveAttribute('data-removing');
  });

  it('unmounts immediately once src becomes falsy — no animated exit to wait for', () => {
    const { rerender } = render(<PageCover src="cover.png" />);
    expect(document.querySelector('.page__cover')).toBeInTheDocument();

    rerender(<PageCover src={undefined} />);

    expect(document.querySelector('.page__cover')).not.toBeInTheDocument();
  });
});

describe('PageCover — hidden/show only', () => {
  it('reflects the hidden prop as data-hidden, with the collapse driven purely by CSS', () => {
    const { rerender } = render(<PageCover src="cover.png" hidden={false} />);
    expect(document.querySelector('.page__cover')).not.toHaveAttribute('data-hidden');

    rerender(<PageCover src="cover.png" hidden />);
    expect(document.querySelector('.page__cover')).toHaveAttribute('data-hidden');
  });

  it('a fresh mount with hidden already true renders collapsed immediately — no flash of the visible cover first', () => {
    render(<PageCover src="cover.png" hidden />);

    expect(document.querySelector('.page__cover')).toHaveAttribute('data-hidden');
  });
});

describe('PageCover — Reposition drag', () => {
  /**
   * The "Reposition" menu item only renders once onSavePosition is
   * supplied (rule 12 — never a dead control), so every test in this block
   * needs one even when it doesn't care about the call itself.
   */
  function renderRepositionableCover(
    overrides: Partial<Parameters<typeof PageCover>[0]> = {}
  ) {
    return renderCover({ onSavePosition: vi.fn(), ...overrides });
  }

  /** Image rect matching the coordinates used throughout this block: 200 wide, 100 tall, at the viewport origin. */
  function mockImageRect(img: Element): void {
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 200,
      height: 100,
      bottom: 100,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  function enterRepositioning(): HTMLImageElement {
    fireEvent.click(screen.getByText('Reposition'));
    const img = document.querySelector<HTMLImageElement>('.page-cover__image')!;
    mockImageRect(img);
    return img;
  }

  function objectPosition(img: HTMLImageElement): string {
    return img.style.objectPosition;
  }

  /** jsdom never decodes a real image, so naturalWidth/Height default to 0 — override them to exercise the object-fit: cover geometry path. */
  function mockNaturalSize(img: HTMLImageElement, width: number, height: number): void {
    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  }

  it('pointer-down alone does not change the position — no click-to-jump, regardless of where inside the image it lands', () => {
    const onSavePosition = vi.fn();
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition });
    const img = enterRepositioning();

    // Clicked near the bottom-right corner — under the old absolute-position
    // bug this alone would have jumped the preview to roughly that location.
    fireEvent.pointerDown(img, { clientX: 190, clientY: 95 });

    expect(objectPosition(img)).toBe('50% 50%');
    expect(onSavePosition).not.toHaveBeenCalled();
  });

  it('clicking near an edge without dragging does not jump the image there', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'side', coverPositionSide: 50 });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 5, clientY: 5 }); // near the top-left corner

    expect(objectPosition(img)).toBe('50% 50%');
  });

  it('Above: dragging the pointer up moves the image up (position increases)', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50 });
    const img = enterRepositioning();

    // 30px up on a 100px-tall fallback travel range = 30% raw, scaled by
    // DRAG_SENSITIVITY (0.45) to 13.5%.
    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 });

    expect(objectPosition(img)).toBe('50% 63.5%');
  });

  it('Above: dragging the pointer down moves the image down (position decreases)', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50 });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 80 }); // 30px down

    expect(objectPosition(img)).toBe('50% 36.5%');
  });

  it('Above: horizontal pointer movement has no effect on the position', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50 });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 50, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 190, clientY: 50 }); // large horizontal move, no vertical move

    expect(objectPosition(img)).toBe('50% 50%');
  });

  it('Side: dragging the pointer right moves the image right (position decreases)', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'side', coverPositionSide: 50 });
    const img = enterRepositioning();

    // 30px right on a 200px-wide fallback travel range = 15% raw, scaled by
    // DRAG_SENSITIVITY (0.45) to 6.75%.
    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 130, clientY: 50 });

    expect(objectPosition(img)).toBe('43.25% 50%');
  });

  it('Side: dragging the pointer left moves the image left (position increases)', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'side', coverPositionSide: 50 });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 70, clientY: 50 }); // 30px left

    expect(objectPosition(img)).toBe('56.75% 50%');
  });

  it('Side: vertical pointer movement has no effect on the position', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'side', coverPositionSide: 50 });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 10 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 90 }); // large vertical move, no horizontal move

    expect(objectPosition(img)).toBe('50% 50%');
  });

  it('converts pixel movement using the image’s actual rendered overflow (object-fit: cover geometry), not the box’s own dimension', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50 });
    const img = enterRepositioning();
    // Box is 200x100 (mockImageRect). A 100x200 (portrait) source image
    // scaled to cover that box lands at scale=2 (renderedWidth 200 exactly
    // fills the box width, renderedHeight 400 overflows by 300px) — a
    // travel range far larger than the box's own 100px height, which is
    // exactly the gap that made the old box-dimension-based conversion
    // wildly oversensitive for this kind of image.
    mockNaturalSize(img, 100, 200);

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 }); // 30px up on a 300px travel range = 10% raw, *0.45 = 4.5%

    expect(objectPosition(img)).toBe('50% 54.5%');
  });

  it('clamps to 0/100 rather than overshooting past either extreme', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50 });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: -500 }); // far more than 100% of travel, upward

    expect(objectPosition(img)).toBe('50% 100%');

    fireEvent.pointerMove(img, { clientX: 100, clientY: 5000 }); // far more than 100% of travel, downward

    expect(objectPosition(img)).toBe('50% 0%');
  });

  it('releasing without clicking Save Position leaves the preview only — onSavePosition is never called', () => {
    const onSavePosition = vi.fn();
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 });
    fireEvent.pointerUp(img, { clientX: 100, clientY: 20 });

    expect(objectPosition(img)).toBe('50% 63.5%');
    expect(onSavePosition).not.toHaveBeenCalled();
  });

  it('Escape ends repositioning and reverts the preview to the saved position, without saving', () => {
    const onSavePosition = vi.fn();
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 });
    expect(objectPosition(img)).toBe('50% 63.5%');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(objectPosition(img)).toBe('50% 50%');
    expect(onSavePosition).not.toHaveBeenCalled();
    expect(screen.queryByText('Save Position')).not.toBeInTheDocument();
  });

  it('clicking Save Position persists the final dragged value for the active layout only', () => {
    const onSavePosition = vi.fn();
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 });
    fireEvent.click(screen.getByText('Save Position'));

    expect(onSavePosition).toHaveBeenCalledWith('above', 63.5);
    expect(screen.queryByText('Save Position')).not.toBeInTheDocument();
  });

  it('re-entering Reposition starts from the currently saved position, with no initial jump', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 30 });
    const img = enterRepositioning();

    expect(objectPosition(img)).toBe('50% 30%');

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });

    expect(objectPosition(img)).toBe('50% 30%');
  });
});
