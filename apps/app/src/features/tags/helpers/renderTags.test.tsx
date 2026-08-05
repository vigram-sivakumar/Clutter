// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderTags } from './renderTags';

describe('renderTags', () => {
  it('renders the assigned icon for a tag that has one', () => {
    const { container } = render(<>{renderTags([{ name: 'project', icon: '📦' }])}</>);

    expect(screen.getAllByText('📦').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.emoji-icon').length).toBeGreaterThan(0);
  });

  it('falls back to the default tag icon when icon is absent', () => {
    const { container } = render(<>{renderTags([{ name: 'design' }])}</>);

    // No emoji span rendered anywhere for this tag — AppIcon falls back to
    // the default "tag" system icon, unchanged from today's behavior.
    expect(container.querySelectorAll('.emoji-icon').length).toBe(0);
    expect(screen.getAllByText('design').length).toBeGreaterThan(0);
  });
});
