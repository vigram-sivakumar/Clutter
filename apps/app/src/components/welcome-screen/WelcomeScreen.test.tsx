// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const openMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...a: unknown[]) => openMock(...a),
}));

import { WelcomeScreen } from './WelcomeScreen';

const SPACE = { path: '/Users/me/Notes', name: 'Notes' };

function setup() {
  const onSpaceReady = vi.fn();
  render(<WelcomeScreen onSpaceReady={onSpaceReady} />);
  return { onSpaceReady };
}

const selectButton = () =>
  screen.getByText('Select a folder').closest('button')!;
const createButton = () =>
  screen.getByText('Create a new space').closest('button')!;

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  openMock.mockReset();
});

describe('WelcomeScreen', () => {
  it('validates the picked folder and reports it', async () => {
    openMock.mockResolvedValue('/Users/me/Notes');
    invokeMock.mockResolvedValue(SPACE);
    const { onSpaceReady } = setup();

    await act(async () => fireEvent.click(selectButton()));

    expect(invokeMock).toHaveBeenCalledWith('validate_space_folder', {
      path: '/Users/me/Notes',
    });
    expect(onSpaceReady).toHaveBeenCalledWith(SPACE);
  });

  it('does nothing when the picker is cancelled', async () => {
    openMock.mockResolvedValue(null);
    const { onSpaceReady } = setup();

    await act(async () => fireEvent.click(selectButton()));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(onSpaceReady).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(selectButton()).toBeEnabled();
  });

  it('creates the default space and reports it', async () => {
    invokeMock.mockResolvedValue({
      path: '/Users/me/Documents/Clutter',
      name: 'Clutter',
    });
    const { onSpaceReady } = setup();

    await act(async () => fireEvent.click(createButton()));

    expect(invokeMock).toHaveBeenCalledWith('create_default_space');
    expect(onSpaceReady).toHaveBeenCalledWith({
      path: '/Users/me/Documents/Clutter',
      name: 'Clutter',
    });
  });

  it('shows the error, stays put and re-enables controls when it fails', async () => {
    invokeMock.mockRejectedValue(
      'A "Clutter" folder already exists in Documents.'
    );
    const { onSpaceReady } = setup();

    await act(async () => fireEvent.click(createButton()));

    expect(onSpaceReady).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(createButton()).toBeEnabled();
    expect(selectButton()).toBeEnabled();
  });

  it('ignores a second action while one is in progress', async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { onSpaceReady } = setup();

    await act(async () => fireEvent.click(createButton()));
    expect(createButton()).toBeDisabled();
    expect(selectButton()).toBeDisabled();
    await act(async () => fireEvent.click(createButton()));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => resolve(SPACE));
    expect(onSpaceReady).toHaveBeenCalledTimes(1);
  });
});
