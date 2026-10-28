// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Confirmation } from './Confirmation';

afterEach(cleanup);

describe('Confirmation', () => {
  it('is Cancel + confirm by default', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<Confirmation title="Delete?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('renders a slot below the description and above the actions, and nothing without one', () => {
    const { container, rerender } = render(
      <Confirmation title="Delete?" description="Sure?" confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.querySelector('[data-testid="slot"]')).toBeNull();

    rerender(
      <Confirmation title="Delete?" description="Sure?" confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <div data-testid="slot">Extra</div>
      </Confirmation>
    );

    const slot = screen.getByTestId('slot');
    const body = container.querySelector('.confirmation__body')!;
    const actions = container.querySelector('.confirmation__actions')!;
    expect(body.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('with an alternate action', () => {
    function setup() {
      const handlers = { onConfirm: vi.fn(), onAlternate: vi.fn(), onCancel: vi.fn() };
      render(
        <Confirmation
          title="Restore daily note"
          description={'A daily note for October 6 already exists.\nWhat would you like to do?'}
          confirmLabel="Move to Inbox"
          confirmVariant="primary"
          alternateLabel="Replace"
          alternateVariant="danger"
          {...handlers}
        />
      );
      return handlers;
    }

    it('shows both actions and a close button, and no Cancel', () => {
      setup();

      expect(screen.getByRole('button', { name: 'Move to Inbox' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('marks the card so its title keeps clear of the corner close button', () => {
      setup();

      expect(screen.getByRole('button', { name: 'Close' }).closest('.confirmation')).toHaveClass(
        'confirmation--has-dismiss'
      );
    });

    it('routes each button to its own handler; close is the dismiss', () => {
      const { onConfirm, onAlternate, onCancel } = setup();

      fireEvent.click(screen.getByRole('button', { name: 'Move to Inbox' }));
      fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onAlternate).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('styles Replace as the destructive action and Move to Inbox as the primary one; the primary takes focus', () => {
      setup();

      expect(screen.getByRole('button', { name: 'Replace' })).toHaveClass('button--danger');
      expect(screen.getByRole('button', { name: 'Move to Inbox' })).not.toHaveClass('button--danger');
      expect(screen.getByRole('button', { name: 'Move to Inbox' })).toHaveFocus();
    });
  });
});
