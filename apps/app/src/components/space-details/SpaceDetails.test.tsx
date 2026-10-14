// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceDetails, isValidSpaceName } from './SpaceDetails';

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
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('shakes — with no message — when the name is cleared', () => {
    render(<SpaceDetails draft={draft} onNameChange={vi.fn()} />);
    const input = screen.getByLabelText('Space Name');

    fireEvent.change(input, { target: { value: '' } });

    expect(input.closest('.space-details__card')).toHaveClass(
      'editable-text--shake'
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shakes when an invalid character is typed, and passes the text through unchanged', () => {
    const onNameChange = vi.fn();
    render(<SpaceDetails draft={draft} onNameChange={onNameChange} />);
    const input = screen.getByLabelText('Space Name');

    fireEvent.change(input, { target: { value: 'a/b' } });

    expect(input.closest('.space-details__card')).toHaveClass(
      'editable-text--shake'
    );
    expect(onNameChange).toHaveBeenCalledWith('a/b');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shakes when Create is clicked with an empty name', () => {
    render(
      <SpaceDetails draft={{ ...draft, name: '' }} onNameChange={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      screen.getByLabelText('Space Name').closest('.space-details__card')
    ).toHaveClass('editable-text--shake');
  });

  it('does not act on Enter — only the Create button does', () => {
    render(
      <SpaceDetails draft={{ ...draft, name: '' }} onNameChange={vi.fn()} />
    );
    const input = screen.getByLabelText('Space Name');

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyPress(input, { key: 'Enter', charCode: 13 });
    fireEvent.keyUp(input, { key: 'Enter' });

    expect(input.closest('.space-details__card')).not.toHaveClass(
      'editable-text--shake'
    );
    expect(input.closest('form')).toBeNull();
  });

  it('does not shake when Create is clicked with a valid name', () => {
    render(<SpaceDetails draft={draft} onNameChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      screen.getByLabelText('Space Name').closest('.space-details__card')
    ).not.toHaveClass('editable-text--shake');
  });

  it('does not shake for a valid name', () => {
    render(<SpaceDetails draft={draft} onNameChange={vi.fn()} />);
    const input = screen.getByLabelText('Space Name');

    fireEvent.change(input, { target: { value: 'Personal' } });

    expect(input.closest('.space-details__card')).not.toHaveClass(
      'editable-text--shake'
    );
  });
});

describe('isValidSpaceName', () => {
  it.each(['Clutter', 'Personal', '  Work  ', 'My Space 2', 'Café ✨'])(
    'accepts %j',
    (name) => {
      expect(isValidSpaceName(name)).toBe(true);
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
    expect(isValidSpaceName(name)).toBe(false);
  });
});
