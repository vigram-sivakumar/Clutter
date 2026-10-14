// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceDetails } from './SpaceDetails';

afterEach(cleanup);

const space = { path: '/Users/me/Documents/Clutter', name: 'Clutter' };

describe('SpaceDetails', () => {
  it('shows the editable name and the read-only path', () => {
    const onNameChange = vi.fn();
    render(<SpaceDetails space={space} onNameChange={onNameChange} />);

    const input = screen.getByLabelText('Space Name');
    expect(input).toHaveValue('Clutter');
    fireEvent.change(input, { target: { value: 'Personal' } });
    expect(onNameChange).toHaveBeenCalledWith('Personal');

    const path = screen.getByText('/Users/me/Documents/Clutter');
    expect(path).toHaveAttribute('title', '/Users/me/Documents/Clutter');
    expect(path.tagName).not.toBe('INPUT');
  });
});
