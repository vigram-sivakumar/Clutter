// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Resource } from './Resource';
import type { VaultResource } from '@core/vault/models/VaultResource';

afterEach(() => {
  cleanup();
});

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'photo.png',
    path: '/vault/Assets/photo.png',
    parentId: null,
    ...overrides,
  };
}

describe('Resource — icon selection', () => {
  it('renders the image icon for an image resource', () => {
    const { container } = render(<Resource resource={makeResource({ kind: 'image' })} />);

    expect(container.querySelector('.resource__icon svg')).toBeTruthy();
  });

  it('renders a different icon for a pdf resource than for an image resource', () => {
    const { container: imageContainer } = render(
      <Resource resource={makeResource({ kind: 'image' })} />
    );
    const { container: pdfContainer } = render(
      <Resource resource={makeResource({ kind: 'pdf' })} />
    );

    const imageSvg = imageContainer.querySelector('.resource__icon svg')?.outerHTML;
    const pdfSvg = pdfContainer.querySelector('.resource__icon svg')?.outerHTML;

    expect(imageSvg).toBeTruthy();
    expect(pdfSvg).toBeTruthy();
    expect(imageSvg).not.toBe(pdfSvg);
  });
});

describe('Resource — title rendering', () => {
  it('renders the resource name verbatim', () => {
    render(<Resource resource={makeResource({ name: 'floorplan.png' })} />);

    expect(screen.getByText('floorplan.png')).toBeDefined();
  });
});

describe('Resource — no overflow menu', () => {
  it('renders no overflow/three-dot button — Rename/Favorite/Archive have no write path for a resource yet', () => {
    const { container } = render(<Resource resource={makeResource()} />);

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Resource — click behavior', () => {
  it('a pdf resource does nothing on click, even when onClick is provided', () => {
    const onClick = vi.fn();
    render(<Resource resource={makeResource({ kind: 'pdf' })} onClick={onClick} />);

    fireEvent.click(screen.getByText('photo.png').closest('.entry')!);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('an image resource invokes onClick with the resource, reaching the existing image-overlay wiring', () => {
    const onClick = vi.fn();
    const resource = makeResource({ kind: 'image' });
    render(<Resource resource={resource} onClick={onClick} />);

    fireEvent.click(screen.getByText('photo.png').closest('.entry')!);

    expect(onClick).toHaveBeenCalledWith(resource);
  });

  it('an image resource with no onClick provided renders non-interactive', () => {
    const { container } = render(<Resource resource={makeResource({ kind: 'image' })} />);

    expect(container.querySelector('.entry-interactive')).toBeNull();
  });
});
