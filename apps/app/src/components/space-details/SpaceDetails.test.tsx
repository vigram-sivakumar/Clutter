// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceDetails, validateSpaceName } from './SpaceDetails';

afterEach(cleanup);

const draft = {
  parentPath: '/Users/me/Documents',
  parentName: 'Documents',
  name: 'Clutter',
};

describe('SpaceDetails', () => {
  it('shows the editable name and the read-only parent location', () => {
    const onNameChange = vi.fn();
    render(<SpaceDetails draft={draft} onNameChange={onNameChange} />);

    const input = screen.getByLabelText('Space Name');
    expect(input).toHaveValue('Clutter');
    fireEvent.change(input, { target: { value: 'Personal' } });
    expect(onNameChange).toHaveBeenCalledWith('Personal');

    const location = screen.getByText('Documents/');
    expect(location).toHaveAttribute('title', '/Users/me/Documents');
    expect(location.tagName).not.toBe('INPUT');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a validation message for an empty or invalid name', () => {
    render(
      <SpaceDetails draft={{ ...draft, name: '   ' }} onNameChange={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
    cleanup();

    render(
      <SpaceDetails draft={{ ...draft, name: 'a/b' }} onNameChange={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('can’t contain');
  });
});

describe('validateSpaceName', () => {
  it.each(['Clutter', 'Personal', '  Work  ', 'My Space 2', 'Café ✨'])(
    'accepts %j',
    (name) => {
      expect(validateSpaceName(name)).toBeNull();
    }
  );

  it.each([
    '',
    '   ',
    '.',
    '..',
    'a/b',
    'a\\b',
    'a:b',
    'a\u0000b',
    'x'.repeat(256),
  ])('rejects %j', (name) => {
    expect(validateSpaceName(name)).not.toBeNull();
  });
});
