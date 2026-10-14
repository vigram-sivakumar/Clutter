// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const openMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...a: unknown[]) => openMock(...a),
}));

import { WelcomeScreen } from './WelcomeScreen';

function setup() {
  const onCreateSpace = vi.fn();
  render(<WelcomeScreen onCreateSpace={onCreateSpace} />);
  return { onCreateSpace };
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
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

  it('opens the picked folder as the space without rendering SpaceDetails', async () => {
    openMock.mockResolvedValue('/Users/me/Notes');
    invokeMock.mockResolvedValue(undefined);
    const { onCreateSpace } = setup();

    await act(async () => fireEvent.click(selectButton()));

    expect(invokeMock).toHaveBeenCalledWith('open_space', {
      path: '/Users/me/Notes',
    });
    expect(onCreateSpace).not.toHaveBeenCalled();
  });

  it('shakes the button and stays when opening the picked folder fails', async () => {
    openMock.mockResolvedValue('/Users/me/Locked');
    invokeMock.mockRejectedValue(
      "That folder is read-only, so it can't be used as a space."
    );
    const { onCreateSpace } = setup();

    await act(async () => fireEvent.click(selectButton()));

    expect(onCreateSpace).not.toHaveBeenCalled();
    expect(selectButton()).toHaveClass('editable-text--shake');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(selectButton()).toBeEnabled();
  });

  it('does nothing when the picker is cancelled', async () => {
    openMock.mockResolvedValue(null);
    const { onCreateSpace } = setup();

    await act(async () => fireEvent.click(selectButton()));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(onCreateSpace).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(selectButton()).toBeEnabled();
  });

  it('starts a draft in Documents with an empty name and creates nothing', async () => {
    invokeMock.mockResolvedValue({
      path: '/Users/me/Documents',
      name: 'Documents',
    });
    const { onCreateSpace } = setup();

    await act(async () => fireEvent.click(createButton()));

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('get_default_space_parent');
    expect(onCreateSpace).toHaveBeenCalledWith({
      parentPath: '/Users/me/Documents',
      parentName: 'Documents',
      name: '',
    });
  });

  it('shakes, stays put and re-enables controls when it fails', async () => {
    invokeMock.mockRejectedValue("Couldn't locate your Documents folder.");
    const { onCreateSpace } = setup();

    await act(async () => fireEvent.click(createButton()));

    expect(onCreateSpace).not.toHaveBeenCalled();
    expect(createButton()).toHaveClass('editable-text--shake');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(createButton()).toBeEnabled();
    expect(selectButton()).toBeEnabled();
  });

  it('ignores a second action while one is in progress', async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { onCreateSpace } = setup();

    await act(async () => fireEvent.click(createButton()));
    expect(createButton()).toBeDisabled();
    expect(selectButton()).toBeDisabled();
    await act(async () => fireEvent.click(createButton()));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ path: '/d', name: 'Documents' }));
    expect(onCreateSpace).toHaveBeenCalledTimes(1);
  });
});
