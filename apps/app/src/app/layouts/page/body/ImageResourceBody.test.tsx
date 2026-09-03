// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ImageResourceBody } from './ImageResourceBody';

afterEach(() => {
  cleanup();
});

describe('ImageResourceBody — display mode', () => {
  it('defaults to Fit, with the corresponding class and object-fit:contain sizing applied', () => {
    render(<ImageResourceBody imageUrl="/vault/photo.png" alt="photo" />);

    const img = screen.getByRole('img');
    expect(img).toHaveClass('image-resource-body__img--fit');
    expect(screen.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Original' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('switches to Original when the Original toggle is clicked', () => {
    render(<ImageResourceBody imageUrl="/vault/photo.png" alt="photo" />);

    fireEvent.click(screen.getByRole('button', { name: 'Original' }));

    const img = screen.getByRole('img');
    expect(img).toHaveClass('image-resource-body__img--original');
    expect(screen.getByRole('button', { name: 'Original' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches back to Fit when the Fit toggle is clicked after Original', () => {
    render(<ImageResourceBody imageUrl="/vault/photo.png" alt="photo" />);

    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }));

    expect(screen.getByRole('img')).toHaveClass('image-resource-body__img--fit');
  });
});

describe('ImageResourceBody — broken image', () => {
  it('shows a fallback message and removes the <img> once it errors', () => {
    render(<ImageResourceBody imageUrl="/vault/missing.png" alt="missing" />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText("This image can't be displayed.")).toBeInTheDocument();
  });
});

describe('ImageResourceBody — passes through the resolved resource url/alt unchanged', () => {
  it('renders the given imageUrl as the <img> src and alt as its alt text', () => {
    render(<ImageResourceBody imageUrl="/vault/photo.png" alt="photo.png" />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/vault/photo.png');
    expect(img).toHaveAttribute('alt', 'photo.png');
  });
});
