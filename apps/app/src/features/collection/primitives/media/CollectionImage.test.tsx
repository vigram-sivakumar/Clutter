// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollectionImage } from './CollectionImage';

afterEach(cleanup);

const image = (container: HTMLElement) => container.querySelector('img') as HTMLImageElement;

describe('CollectionImage', () => {
  it('draws the image, decorative, lazy and not draggable', () => {
    const { container } = render(<CollectionImage src="/a.png" />);

    expect(image(container)).toHaveAttribute('src', '/a.png');
    expect(image(container)).toHaveAttribute('alt', '');
    expect(image(container)).toHaveAttribute('loading', 'lazy');
    expect(image(container)).toHaveAttribute('draggable', 'false');
    expect(image(container)).toHaveClass('cx-collection-image');
  });

  it('takes an alt when the image is not decorative', () => {
    const { container } = render(<CollectionImage src="/a.png" alt="Summit" />);

    expect(image(container)).toHaveAttribute('alt', 'Summit');
  });

  it('is framed at the centre by default, or at the given vertical focal point', () => {
    const { container, rerender } = render(<CollectionImage src="/a.png" />);
    expect(image(container).style.objectPosition).toBe('50% 50%');

    rerender(<CollectionImage src="/a.png" positionY={0} />);
    expect(image(container).style.objectPosition).toBe('50% 0%');

    rerender(<CollectionImage src="/a.png" positionY={80} />);
    expect(image(container).style.objectPosition).toBe('50% 80%');
  });

  it('shows the fallback, and no image, when there is no src', () => {
    const { container, rerender } = render(<CollectionImage fallback={<i data-testid="fb" />} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('fb').parentElement).toHaveClass('cx-collection-image__fallback');

    rerender(<CollectionImage src={null} fallback={<i data-testid="fb" />} />);
    expect(screen.getByTestId('fb')).toBeInTheDocument();

    rerender(<CollectionImage src="" fallback={<i data-testid="fb" />} />);
    expect(screen.getByTestId('fb')).toBeInTheDocument();
  });

  it('swaps to the fallback when the image fails to load', () => {
    const { container } = render(<CollectionImage src="/missing.png" fallback={<i data-testid="fb" />} />);
    expect(screen.queryByTestId('fb')).toBeNull();

    fireEvent.error(image(container));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('fb')).toBeInTheDocument();
  });

  it('gives a new src a fresh try after a failure', () => {
    const { container, rerender } = render(<CollectionImage src="/missing.png" fallback={<i data-testid="fb" />} />);
    fireEvent.error(image(container));
    expect(screen.getByTestId('fb')).toBeInTheDocument();

    rerender(<CollectionImage src="/other.png" fallback={<i data-testid="fb" />} />);
    expect(image(container)).toHaveAttribute('src', '/other.png');
    expect(screen.queryByTestId('fb')).toBeNull();
  });

  it('draws nothing at all without a src or a fallback', () => {
    const { container } = render(<CollectionImage />);

    expect(container).toBeEmptyDOMElement();
  });

  it('adds a className to the image and to the fallback', () => {
    const { container, rerender } = render(<CollectionImage src="/a.png" className="mine" />);
    expect(image(container)).toHaveClass('cx-collection-image', 'mine');

    rerender(<CollectionImage className="mine" fallback="x" />);
    expect(container.firstElementChild).toHaveClass('cx-collection-image__fallback', 'mine');
  });
});
