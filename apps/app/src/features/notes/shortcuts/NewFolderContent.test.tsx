// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NewFolderContent } from './NewFolderContent';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

function setup(canCreate = () => true) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<NewFolderContent onClose={onClose} canCreate={canCreate} onSubmit={onSubmit} />);

  return { onSubmit, onClose };
}

describe('NewFolderContent', () => {
  it('has a description field with only the placeholder, and an emoji button', () => {
    setup();

    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose emoji' })).toBeInTheDocument();
  });

  it('Create is disabled until a name is typed, and a duplicate name is refused', () => {
    setup((() => false) as () => boolean);
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('New Folder'), { target: { value: 'Work' } });

    expect(create).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
  });

  it('submits the name with no icon or description by default', async () => {
    const { onSubmit, onClose } = setup();

    fireEvent.change(screen.getByPlaceholderText('New Folder'), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Work', undefined, undefined));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submits a trimmed description', async () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByPlaceholderText('New Folder'), { target: { value: 'Work' } });
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: '  Client notes ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Work', undefined, 'Client notes'));
  });
});
