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
