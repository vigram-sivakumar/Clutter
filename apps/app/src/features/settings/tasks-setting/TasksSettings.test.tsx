// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Settings } from '../Settings';

afterEach(() => cleanup());

describe('Tasks settings', () => {
  it('does not expose Show completed or Auto-sort completed settings', () => {
    render(<Settings />);
    fireEvent.click(screen.getByText('Tasks'));

    const group = screen.getByText('Sidebar appearance', { selector: '.settings-group__title' }).closest('.settings-group')!;
    const titles = [...group.querySelectorAll('.settings-entry__title')].map((entry) => entry.textContent);

    expect(titles).toEqual(['Group by due date', 'Show']);
    expect(screen.queryByRole('switch', { name: 'Show completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Auto-sort completed' })).not.toBeInTheDocument();
  });
});
