// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShowMoreEntry } from './ShowMoreEntry';

afterEach(cleanup);

describe('ShowMoreEntry', () => {
  it('reads "N more" collapsed and "Show less" expanded, both on the tertiary-foreground row', () => {
    const { rerender } = render(<ShowMoreEntry hiddenCount={4} isExpanded={false} onToggle={vi.fn()} />);
    expect(screen.getByText('4 more').closest('.entry')?.classList.contains('show-more-entry')).toBe(true);

    rerender(<ShowMoreEntry hiddenCount={4} isExpanded onToggle={vi.fn()} />);
    expect(screen.getByText('Show less').closest('.entry')?.classList.contains('show-more-entry')).toBe(true);
  });
});
