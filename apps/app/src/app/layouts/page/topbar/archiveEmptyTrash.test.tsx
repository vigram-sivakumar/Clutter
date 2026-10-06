// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildArchiveTopBarMenu,
  DELETE_ALL_ARCHIVED_CONFIRMATION,
} from '@features/notes/topbar/archiveTopBarMenu.config';

import { renderTopBarActions } from './topBarRegistry';

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

function renderTrashActions(onDeleteAll: () => void, isEmpty = false) {
  render(
    <>
      {renderTopBarActions('reserved-folder', {
        menu: buildArchiveTopBarMenu(isEmpty),
        onDeleteAll,
        deleteAllConfirmation: DELETE_ALL_ARCHIVED_CONFIRMATION,
      })}
    </>
  );
}

function openMenu() {
  fireEvent.click(document.querySelector('button[aria-haspopup="menu"]')!);
}

describe('Trash page "More actions" — Empty trash', () => {
  it('shows a More actions menu containing Empty trash', () => {
    renderTrashActions(vi.fn());
    openMenu();

    expect(screen.getByText('Empty trash')).toBeInTheDocument();
  });

  it('renders no actions for a reserved folder that passes no menu', () => {
    render(<>{renderTopBarActions('reserved-folder', {})}</>);

    expect(document.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  });

  it('asks for confirmation with the exact copy before deleting anything', () => {
    const onDeleteAll = vi.fn();
    renderTrashActions(onDeleteAll);
    openMenu();
    fireEvent.click(screen.getByText('Empty trash'));

    expect(
      screen.getByText('Are you sure you want to permanently delete the items in the Trash?')
    ).toBeInTheDocument();
    expect(screen.getByText('You can’t undo this action.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(onDeleteAll).not.toHaveBeenCalled();
  });

  it('Cancel deletes nothing', () => {
    const onDeleteAll = vi.fn();
    renderTrashActions(onDeleteAll);
    openMenu();
    fireEvent.click(screen.getByText('Empty trash'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleteAll).not.toHaveBeenCalled();
    expect(screen.queryByText('You can’t undo this action.')).toBeNull();
  });

  it('confirming runs the delete once, with a primary (not danger) confirm button', () => {
    const onDeleteAll = vi.fn();
    renderTrashActions(onDeleteAll);
    openMenu();
    fireEvent.click(screen.getByText('Empty trash'));

    const buttons = screen.getAllByRole('button', { name: 'Empty trash' });
    const confirm = buttons[buttons.length - 1]!;
    expect(confirm.className).toContain('button--primary');
    expect(confirm.className).not.toContain('button-danger');

    fireEvent.click(confirm);

    expect(onDeleteAll).toHaveBeenCalledTimes(1);
  });

  it('disables Empty trash when the Trash is already empty', () => {
    const onDeleteAll = vi.fn();
    renderTrashActions(onDeleteAll, true);
    openMenu();
    fireEvent.click(screen.getByText('Empty trash'));

    expect(screen.queryByText('You can’t undo this action.')).toBeNull();
    expect(onDeleteAll).not.toHaveBeenCalled();
  });
});
