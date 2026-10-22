// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Pill } from './Pill';

afterEach(cleanup);

describe('Pill — inert', () => {
  it('is plain content: no button role, tab stop or label, and clicking does nothing', () => {
    render(<Pill label="ignored">Design</Pill>);
    const pill = screen.getByText('Design').closest('.pill')!;

    expect(pill).not.toHaveAttribute('role');
    expect(pill).not.toHaveAttribute('tabindex');
    expect(pill).not.toHaveAttribute('aria-label');
    expect(pill.querySelector('.pill__remove')).toBeNull();
  });

  it('has the compact size only with size="small"', () => {
    render(
      <>
        <Pill>A</Pill>
        <Pill size="small">B</Pill>
      </>
    );

    expect(screen.getByText('A').closest('.pill')).not.toHaveClass('pill--small');
    expect(screen.getByText('B').closest('.pill')).toHaveClass('pill--small');
  });
});

describe.each([
  ['onNavigate', 'Open tag design'],
  ['onEdit', 'Edit tag design'],
] as const)('Pill — interactive (%s)', (prop, label) => {
  const setup = () => {
    const action = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <Pill label={label} {...{ [prop]: action }}>
          Design
        </Pill>
      </div>
    );
    return { action, parentClick, pill: screen.getByRole('button', { name: label }) };
  };

  it('is a labelled, focusable button', () => {
    const { pill } = setup();

    expect(pill).toHaveAttribute('tabindex', '0');
  });

  it('a click runs the action once and does not reach its parent (the editor’s click-to-focus)', () => {
    const { action, parentClick, pill } = setup();

    fireEvent.click(pill);

    expect(action).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('%j on the pill runs the action once, without a native default or reaching its parent', (key) => {
    const { action, parentClick, pill } = setup();
    const event = createEvent.keyDown(pill, { key, bubbles: true, cancelable: true });

    fireEvent(pill, event);

    expect(action).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('other keys do nothing', () => {
    const { action, pill } = setup();

    fireEvent.keyDown(pill, { key: 'a' });

    expect(action).not.toHaveBeenCalled();
  });
});

describe('Pill — dismiss', () => {
  it('shows a labelled dismiss button only with onRemove', () => {
    const { rerender } = render(<Pill>Design</Pill>);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <Pill onRemove={vi.fn()} removeLabel="Remove tag design">
        Design
      </Pill>
    );
    expect(screen.getByRole('button', { name: 'Remove tag design' })).toBeInTheDocument();
  });

  it('clicking it removes, without activating the pill or reaching its parent', () => {
    const onRemove = vi.fn();
    const onEdit = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <Pill onEdit={onEdit} label="Edit tag design" onRemove={onRemove} removeLabel="Remove tag design">
          Design
        </Pill>
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag design' }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onEdit).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('pressing it does not take focus from the input (mousedown is default-prevented)', () => {
    render(
      <Pill onRemove={vi.fn()} removeLabel="Remove tag design">
        Design
      </Pill>
    );
    const button = screen.getByRole('button', { name: 'Remove tag design' });
    const event = createEvent.mouseDown(button, { bubbles: true, cancelable: true });

    fireEvent(button, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('Enter on the dismiss button does not activate the pill', () => {
    const onEdit = vi.fn();
    render(
      <Pill onEdit={onEdit} label="Edit tag design" onRemove={vi.fn()} removeLabel="Remove tag design">
        Design
      </Pill>
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove tag design' }), { key: 'Enter' });

    expect(onEdit).not.toHaveBeenCalled();
  });
});
