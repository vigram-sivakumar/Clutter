// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRetainedCoverImages, isCoverImageRetained } from '@shared/helpers/coverImagePreloader';
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

describe('PageCover — the cover on screen is held ready', () => {
  afterEach(() => clearRetainedCoverImages());

  it('keeps its image loaded and decoded, so coming back to the note shows it at once', () => {
    render(<PageCover src="https://images.unsplash.com/a?w=4800" onRemove={vi.fn()} onHide={vi.fn()} />);

    expect(isCoverImageRetained('https://images.unsplash.com/a?w=4800')).toBe(true);
  });
});

describe('PageCover — right-click on the cover image', () => {
  function renderPlain(overrides: Partial<Parameters<typeof PageCover>[0]> = {}) {
    const onCopyImage = vi.fn();
    const onCopyImageAddress = vi.fn();
    const utils = render(
      <PageCover
        src="cover.png"
        onRemove={vi.fn()}
        onHide={vi.fn()}
        onSetCoverImage={vi.fn()}
        onSetCoverImageFromUpload={vi.fn()}
        onCopyImage={onCopyImage}
        onCopyImageAddress={onCopyImageAddress}
        {...overrides}
      />
    );
    const image = utils.container.querySelector<HTMLImageElement>('.page-cover__image')!;
    return { ...utils, image, onCopyImage, onCopyImageAddress };
  }

  it.each(['side', 'above'] as const)('suppresses the native menu and shows Copy and Copy image address — %s layout', (layout) => {
    const { image } = renderPlain({ layout });

    // fireEvent returns false when the event's default (the WebView's own menu) was prevented.
    expect(fireEvent.contextMenu(image, { clientX: 40, clientY: 60 })).toBe(false);

    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(labels).toEqual(['Copy', 'Copy image address']);
  });

  it('Copy runs the copy-image operation and closes the menu', () => {
    const { image, onCopyImage, onCopyImageAddress } = renderPlain();
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy'));

    expect(onCopyImage).toHaveBeenCalledTimes(1);
    expect(onCopyImageAddress).not.toHaveBeenCalled();
    expect(screen.queryByText('Copy image address')).not.toBeInTheDocument();
  });

  it('Copy image address runs the copy-address operation and closes the menu', () => {
    const { image, onCopyImage, onCopyImageAddress } = renderPlain();
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy image address'));

    expect(onCopyImageAddress).toHaveBeenCalledTimes(1);
    expect(onCopyImage).not.toHaveBeenCalled();
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
  });

  it('lists only the operation the page supplied — a control is never live without a handler', () => {
    const { image } = renderPlain({ onCopyImage: undefined });
    fireEvent.contextMenu(image);

    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy image address']);
  });

  it('with neither operation there is nothing to list: the native menu is still suppressed and none opens', () => {
    const { image } = renderPlain({ onCopyImage: undefined, onCopyImageAddress: undefined });

    expect(fireEvent.contextMenu(image)).toBe(false);

    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('opens no menu while repositioning, when the image is a drag handle', () => {
    const { image } = renderPlain({ onSetLayout: vi.fn(), onSavePosition: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Reposition'));

    fireEvent.contextMenu(image);

    expect(screen.queryByText('Copy image address')).not.toBeInTheDocument();
  });

  it('is only the image: a right-click elsewhere on the cover is left to the existing handlers', () => {
    const { container } = renderPlain();
    const cover = container.querySelector('aside')!;

    // Not prevented by the cover (the document's own policy decides, as for the rest of the window), and no menu.
    expect(fireEvent.contextMenu(cover)).toBe(true);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('leaves the three-dot menu exactly as it was', () => {
    renderPlain();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getAllByText(/Change cover image|Copy image address|Hide|Remove/).map((el) => el.textContent)).toEqual([
      'Change cover image',
      'Copy image address',
      'Hide',
      'Remove',
    ]);
  });
});

describe('PageCover — Copy image and Copy image address', () => {
  it('lists neither without the callbacks, leaving the menu as it was', () => {
    renderCover();

    expect(screen.queryByText('Copy image')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy image address')).not.toBeInTheDocument();
  });

  it('places them after Reposition and before Download, Hide and Remove, in the same group as Download', () => {
    renderCover({
      onSaveToVault: vi.fn(),
      onDownload: vi.fn(),
      onCopyImage: vi.fn(),
      onCopyImageAddress: vi.fn(),
      onSetLayout: vi.fn(),
      onSavePosition: vi.fn(),
    });

    const items = Array.from(document.querySelectorAll('.menu > *')).map((el) =>
      el.getAttribute('role') === 'separator' ? '---' : (el.textContent ?? '')
    );
    expect(items).toEqual([
      'Change cover image',
      'Save to vault',
      '---',
      'Position',
      'Right',
      'Top',
      'Reposition',
      '---',
      'Copy image',
      'Copy image address',
      'Download',
      '---',
      'Hide',
      'Remove',
    ]);
  });

  it('Copy image runs its callback and closes the menu', () => {
    const onCopyImage = vi.fn();
    renderCover({ onCopyImage });

    fireEvent.click(screen.getByText('Copy image'));

    expect(onCopyImage).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Copy image')).not.toBeInTheDocument();
  });

  it('Copy image address runs its callback and closes the menu', () => {
    const onCopyImageAddress = vi.fn();
    renderCover({ onCopyImageAddress });

    fireEvent.click(screen.getByText('Copy image address'));

    expect(onCopyImageAddress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Copy image address')).not.toBeInTheDocument();
  });

  it('leaves Download, Hide and Remove working beside them', () => {
    const onDownload = vi.fn();
    renderCover({ onDownload, onCopyImage: vi.fn(), onCopyImageAddress: vi.fn() });

    fireEvent.click(screen.getByText('Download'));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});

describe('PageCover — file actions (Save to vault, Download)', () => {
  it('lists neither without the callbacks, leaving the menu as it was', () => {
    renderCover();

    expect(screen.queryByText('Save to vault')).not.toBeInTheDocument();
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });

  it('orders the shared actions as ADR-048 does: Save to vault with Change cover image, Download after Position, Hide and Remove last', () => {
    renderCover({
      onSaveToVault: vi.fn(),
      onDownload: vi.fn(),
      onSetLayout: vi.fn(),
      onSavePosition: vi.fn(),
    });

    const labels = screen
      .getAllByText(/Change cover image|Right|Top|Reposition|Save to vault|Download|Hide|Remove/)
      .map((el) => el.textContent);
    expect(labels).toEqual([
      'Change cover image',
      'Save to vault',
      'Right',
      'Top',
      'Reposition',
      'Download',
      'Hide',
      'Remove',
    ]);
  });

  it('separates the groups with dividers: organize | Position | Download | Hide and Remove', () => {
    renderCover({ onSaveToVault: vi.fn(), onDownload: vi.fn(), onSetLayout: vi.fn() });

    const items = Array.from(document.querySelectorAll('.menu > *')).map((el) =>
      el.getAttribute('role') === 'separator' ? '---' : (el.textContent ?? '')
    );
    expect(items).toEqual([
      'Change cover image',
      'Save to vault',
      '---',
      'Position',
      'Right',
      'Top',
      '---',
      'Download',
      '---',
      'Hide',
      'Remove',
    ]);
  });

  it('with no Position group, Save to vault stays with Change cover image and Download follows a divider', () => {
    renderCover({ onSaveToVault: vi.fn(), onDownload: vi.fn() });

    const items = Array.from(document.querySelectorAll('.menu > *')).map((el) =>
      el.getAttribute('role') === 'separator' ? '---' : (el.textContent ?? '')
    );
    expect(items).toEqual([
      'Change cover image',
      'Save to vault',
      '---',
      'Download',
      '---',
      'Hide',
      'Remove',
    ]);
  });

  it('a remote cover with only Save to vault keeps one divider before Hide, as before', () => {
    renderCover({ onSaveToVault: vi.fn() });

    const items = Array.from(document.querySelectorAll('.menu > *')).map((el) =>
      el.getAttribute('role') === 'separator' ? '---' : (el.textContent ?? '')
    );
    expect(items).toEqual(['Change cover image', 'Save to vault', '---', 'Hide', 'Remove']);
  });

  it('offers Download alone for a cover that is already in the vault (no onSaveToVault)', () => {
    renderCover({ onDownload: vi.fn() });

    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.queryByText('Save to vault')).not.toBeInTheDocument();
  });

  it('clicking Save to vault calls onSaveToVault once and closes the menu, touching nothing else', () => {
    const onSaveToVault = vi.fn();
    const onDownload = vi.fn();
    const { onHide, onRemove, onSetCoverImage } = renderCover({ onSaveToVault, onDownload });

    fireEvent.click(screen.getByText('Save to vault'));

    expect(onSaveToVault).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(onSetCoverImage).not.toHaveBeenCalled();
    expect(document.querySelector('.menu')).not.toBeInTheDocument();
  });

  it('clicking Download calls onDownload once and closes the menu', () => {
    const onDownload = vi.fn();
    renderCover({ onSaveToVault: vi.fn(), onDownload });

    fireEvent.click(screen.getByText('Download'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.menu')).not.toBeInTheDocument();
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

  it('releasing without clicking Save position leaves the preview only — onSavePosition is never called', () => {
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
    expect(screen.queryByText('Save position')).not.toBeInTheDocument();
  });

  it('Escape that ends repositioning is consumed (preventDefault), so anything else answering Escape — a collection’s selection — leaves it alone', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition: vi.fn() });
    enterRepositioning();

    // `fireEvent` returns false when a handler called preventDefault.
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(false);
    // Not repositioning any more: the next Escape is nobody's here, and is left unconsumed.
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(true);
  });

  it('replaces the "More actions" trigger with a Cancel repositioning button while repositioning is active', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50 });
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();

    enterRepositioning();

    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel repositioning' })).toBeInTheDocument();
  });

  it('clicking Cancel repositioning ends repositioning and reverts the preview, without saving — same as Escape', () => {
    const onSavePosition = vi.fn();
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 });
    expect(objectPosition(img)).toBe('50% 63.5%');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel repositioning' }));

    expect(objectPosition(img)).toBe('50% 50%');
    expect(onSavePosition).not.toHaveBeenCalled();
    expect(screen.queryByText('Save position')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel repositioning' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('clicking Save position persists the final dragged value for the active layout only', () => {
    const onSavePosition = vi.fn();
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 50, onSavePosition });
    const img = enterRepositioning();

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(img, { clientX: 100, clientY: 20 });
    fireEvent.click(screen.getByText('Save position'));

    expect(onSavePosition).toHaveBeenCalledWith('above', 63.5);
    expect(screen.queryByText('Save position')).not.toBeInTheDocument();
  });

  it('re-entering Reposition starts from the currently saved position, with no initial jump', () => {
    renderRepositionableCover({ onSetLayout: vi.fn(), layout: 'above', coverPositionAbove: 30 });
    const img = enterRepositioning();

    expect(objectPosition(img)).toBe('50% 30%');

    fireEvent.pointerDown(img, { clientX: 100, clientY: 50 });

    expect(objectPosition(img)).toBe('50% 30%');
  });
});

describe('PageCover — editable={false} (an archived page)', () => {
  it('still displays the cover image, with no menu button at all', () => {
    const { container } = render(
      <PageCover src="cover.png" editable={false} onRemove={vi.fn()} onHide={vi.fn()} onSetCoverImage={vi.fn()} onDownload={vi.fn()} />
    );

    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('.page__cover__menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    expect(container.querySelector('.page__cover__actions')).toBeNull();
  });

  it('is editable by default: the menu button is there', () => {
    const { container } = render(<PageCover src="cover.png" onRemove={vi.fn()} />);

    expect(container.querySelector('.page__cover__menu')).not.toBeNull();
  });
});

describe('PageCover — Unsplash attribution (ADR-054)', () => {
  const COVER = 'https://images.unsplash.com/photo-a?ixid=1&w=1080';
  const CREDIT = { name: 'Alex Doe', url: 'https://unsplash.com/@alex' };

  it('shows "Photo by [photographer] on Unsplash" on a saved Unsplash cover, with referral links', () => {
    const { container } = render(<PageCover src={COVER} coverCredit={CREDIT} />);

    expect(container.querySelector('.page-cover__attribution')).toHaveTextContent('Photo by Alex Doe on Unsplash');
    expect(screen.getByText('Alex Doe')).toHaveAttribute(
      'href',
      'https://unsplash.com/@alex?utm_source=clutter&utm_medium=referral'
    );
    expect(screen.getByText('Unsplash')).toHaveAttribute(
      'href',
      'https://unsplash.com?utm_source=clutter&utm_medium=referral'
    );
    // Hotlinked: the image is the stored API URL, untouched.
    expect(container.querySelector('img.page-cover__image')).toHaveAttribute('src', COVER);
  });

  it('shows the credit-less fallback for an Unsplash cover saved before credits existed', () => {
    const { container } = render(<PageCover src={COVER} />);

    expect(container.querySelector('.page-cover__attribution')).toHaveTextContent(/^by Unsplash$/);
  });

  it('shows no attribution on non-Unsplash covers', () => {
    for (const src of ['cover.png', 'https://example.com/c.png', 'app://vault/Assets/c.png']) {
      const { container } = render(<PageCover src={src} />);

      expect(container.querySelector('.page-cover__attribution')).toBeNull();
      cleanup();
    }
  });

  it('keeps crediting the photographer after the photo was saved to the vault (a local file)', () => {
    const { container } = render(<PageCover src="app://vault/Assets/photo.jpg" coverCredit={CREDIT} />);

    expect(container.querySelector('.page-cover__attribution')).toHaveTextContent('Photo by Alex Doe on Unsplash');
  });

  it('keeps a long photographer name from displacing the links (full name stays available)', () => {
    const name = 'A Photographer With An Extraordinarily Long Display Name That Cannot Fit';
    render(<PageCover src={COVER} coverCredit={{ name, url: CREDIT.url }} />);

    expect(screen.getByText(name)).toHaveAttribute('title', name);
    expect(screen.getByText('Unsplash')).toBeInTheDocument();
  });
});

describe('PageCover — window drag strip', () => {
  const strips = (container: HTMLElement) =>
    container.querySelectorAll('.page__cover > [data-tauri-drag-region]');

  it('overlays the side cover with one shared strip, a sibling of the image, before the actions', () => {
    const { container } = render(<PageCover src="cover.png" layout="side" onRemove={vi.fn()} />);
    const cover = container.querySelector('.page__cover')!;

    expect(strips(container)).toHaveLength(1);
    const strip = strips(container)[0]!;
    expect(strip.classList.contains('tauri-drag-strip')).toBe(true);
    expect(cover.firstElementChild).toBe(strip);
    expect(strip.nextElementSibling?.classList.contains('page__cover__actions')).toBe(true);
    // Not the cover and not the image, and it wraps nothing.
    expect(cover.hasAttribute('data-tauri-drag-region')).toBe(false);
    expect(container.querySelector('.page-cover__image')!.closest('[data-tauri-drag-region]')).toBeNull();
    expect(strip.childElementCount).toBe(0);
  });

  it('keeps the cover actions outside the drag region', () => {
    const { container } = render(<PageCover src="cover.png" layout="side" onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'More actions' }).closest('[data-tauri-drag-region]')).toBeNull();
    expect(container.querySelector('.page__cover__actions')!.closest('[data-tauri-drag-region]')).toBeNull();
  });

  it('adds no strip to the Above layout, which sits under the topbar', () => {
    const { container } = render(<PageCover src="cover.png" layout="above" onRemove={vi.fn()} />);

    expect(strips(container)).toHaveLength(0);
  });

  it('adds no element to the image or its size: same image attributes with or without the strip', () => {
    const side = render(<PageCover src="cover.png" layout="side" onRemove={vi.fn()} />);
    const sideImage = side.container.querySelector('.page-cover__image')!;
    expect(sideImage.parentElement).toBe(side.container.querySelector('.page__cover'));
    expect(sideImage.getAttribute('draggable')).toBe('false');
    expect(sideImage.hasAttribute('data-tauri-drag-region')).toBe(false);
  });
});
