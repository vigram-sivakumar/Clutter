// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MissingSpaceDialog } from './MissingSpaceDialog';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LONG_PATH =
  '/Volumes/External Drive/Projects/Clients/Acme/2026/Research/Notes/Coconut';

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof MissingSpaceDialog>> = {}
) {
  const handlers = {
    onChangeLocation: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <MissingSpaceDialog
      open
      path="/Users/me/Coconut"
      name="Coconut"
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe('MissingSpaceDialog', () => {
  it('says what happened, in the app’s copy style', () => {
    renderDialog();

    expect(screen.getByText('Space not found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Clutter can’t find this space at its saved location. It may have been moved, renamed, or deleted'
      )
    ).toBeInTheDocument();
  });

  it('shows the space’s name and saved location in a settings entry, with its initial as the avatar', () => {
    renderDialog();

    expect(document.querySelector('.settings-entry__title')).toHaveTextContent(
      'Coconut'
    );
    expect(
      document.querySelector('.settings-entry__description')
    ).toHaveTextContent('/Users/me/Coconut');
    expect(
      document.querySelector(
        '.settings-entry__trailing .space-details__avatar-picker'
      )
    ).toHaveTextContent('C');
  });

  it('keeps a long path to one line', () => {
    renderDialog({ path: LONG_PATH });

    const path = document.querySelector('.settings-entry__description')!;
    expect(path).toHaveTextContent(LONG_PATH);
    expect(path).toHaveClass('truncate');
  });

  it('has Change location (secondary) and Remove space (danger), in that order, and no editable path', () => {
    renderDialog();
    const change = screen.getByRole('button', { name: 'Change location' });
    const remove = screen.getByRole('button', { name: 'Remove space' });

    expect(
      change.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(remove).toHaveClass('button--danger');
    expect(change).not.toHaveClass('button--danger');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('routes each button to its own handler, and neither closes the dialog by itself', () => {
    const { onChangeLocation, onRemove, onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Change location' }));
    expect(onChangeLocation).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove space' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives the focus to the safe action, so Enter never removes the space', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: 'Change location' })
    ).toHaveFocus();
  });

  it('dismisses with Escape, through onClose only', () => {
    const { onChangeLocation, onRemove, onClose } = renderDialog();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
    expect(onChangeLocation).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('has a close button in the corner, like the app’s other confirmations, that only dismisses', () => {
    const { onChangeLocation, onRemove, onClose } = renderDialog();
    const close = screen.getByRole('button', { name: 'Close' });

    expect(close).toHaveClass('confirmation__dismiss');
    fireEvent.click(close);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChangeLocation).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Space not found')).toBeNull();
  });
});
