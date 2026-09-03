// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BreadcrumbItem } from './BreadcrumbItem';

afterEach(() => {
  cleanup();
});

describe('BreadcrumbItem — an ancestor crumb (interactive)', () => {
  it('renders as a button and calls onClick when clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <BreadcrumbItem id="folder-1" title="Projects" onClick={onClick} />
    );

    const button = container.querySelector('button.breadcrumb-item');
    expect(button).not.toBeNull();

    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('BreadcrumbItem — the current-page crumb (isCurrentPage)', () => {
  it('renders as a non-button label, not a clickable button', () => {
    const { container } = render(
      <BreadcrumbItem id="page-1" title="My Note" isCurrentPage />
    );

    expect(container.querySelector('button.breadcrumb-item')).toBeNull();
    const label = container.querySelector('span.breadcrumb-item');
    expect(label).not.toBeNull();
  });

  it('marks itself aria-current="page" for assistive tech', () => {
    const { container } = render(
      <BreadcrumbItem id="page-1" title="My Note" isCurrentPage />
    );

    expect(
      container.querySelector('.breadcrumb-item')!.getAttribute('aria-current')
    ).toBe('page');
  });

  it('does not invoke onClick even if one is supplied, since there is nothing to click', () => {
    const onClick = vi.fn();
    const { container } = render(
      <BreadcrumbItem id="page-1" title="My Note" onClick={onClick} isCurrentPage />
    );

    fireEvent.click(container.querySelector('.breadcrumb-item')!);
    expect(onClick).not.toHaveBeenCalled();
  });
});
