// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildActivationProps, type ActivationOptions } from './buildActivationProps';

afterEach(cleanup);

function Target(options: ActivationOptions<HTMLDivElement>) {
  return (
    <div data-testid="target" {...buildActivationProps<HTMLDivElement>(options)}>
      <span data-testid="plain">text</span>
      <button type="button" data-testid="nested-button">
        inner
      </button>
      <span role="button" tabIndex={0} data-testid="nested-role">
        role
      </span>
    </div>
  );
}

describe('buildActivationProps', () => {
  it('returns nothing when there is no callback — the element is inert', () => {
    expect(buildActivationProps({})).toEqual({});
    expect(buildActivationProps({ disabled: true, role: 'link', tabIndex: 3 })).toEqual({});

    render(<Target />);
    const target = screen.getByTestId('target');
    expect(target).not.toHaveAttribute('role');
    expect(target).not.toHaveAttribute('tabindex');
  });

  it('is a focusable button by default', () => {
    render(<Target onActivate={() => {}} />);
    const target = screen.getByTestId('target');

    expect(target).toHaveAttribute('role', 'button');
    expect(target).toHaveAttribute('tabindex', '0');
    expect(target).not.toHaveAttribute('aria-disabled');
  });

  it('lets the caller override role and tabIndex', () => {
    render(<Target onActivate={() => {}} role="link" tabIndex={-1} />);
    const target = screen.getByTestId('target');

    expect(target).toHaveAttribute('role', 'link');
    expect(target).toHaveAttribute('tabindex', '-1');
  });

  it('activates on a click, passing the event', () => {
    let currentTarget: EventTarget | null = null;
    const onActivate = vi.fn((event: { currentTarget: EventTarget }) => {
      currentTarget = event.currentTarget;
    });
    render(<Target onActivate={onActivate} />);

    fireEvent.click(screen.getByTestId('target'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(currentTarget).toBe(screen.getByTestId('target'));
  });

  it('activates on a click that lands on plain (non-interactive) content inside it', () => {
    const onActivate = vi.fn();
    render(<Target onActivate={onActivate} />);

    fireEvent.click(screen.getByTestId('plain'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('activates on Enter and on Space — each as exactly one real click', () => {
    const onActivate = vi.fn();
    render(<Target onActivate={onActivate} />);
    const target = screen.getByTestId('target');

    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(target, { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('prevents the default of an activating key (Space must not scroll the page)', () => {
    render(<Target onActivate={() => {}} />);

    const notPrevented = fireEvent.keyDown(screen.getByTestId('target'), { key: ' ' });
    expect(notPrevented).toBe(false);
  });

  it('ignores every other key', () => {
    const onActivate = vi.fn();
    render(<Target onActivate={onActivate} />);

    fireEvent.keyDown(screen.getByTestId('target'), { key: 'Tab' });
    fireEvent.keyDown(screen.getByTestId('target'), { key: 'a' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores clicks that land on a nested interactive element', () => {
    const onActivate = vi.fn();
    render(<Target onActivate={onActivate} />);

    fireEvent.click(screen.getByTestId('nested-button'));
    fireEvent.click(screen.getByTestId('nested-role'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('leaves Enter / Space pressed on a nested control to that control', () => {
    const onActivate = vi.fn();
    render(<Target onActivate={onActivate} />);

    fireEvent.keyDown(screen.getByTestId('nested-button'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('nested-button'), { key: ' ' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does nothing when disabled, and marks it aria-disabled and unfocusable', () => {
    const onActivate = vi.fn();
    render(<Target onActivate={onActivate} disabled />);
    const target = screen.getByTestId('target');

    expect(target).toHaveAttribute('aria-disabled', 'true');
    expect(target).not.toHaveAttribute('tabindex');

    fireEvent.click(target);
    fireEvent.keyDown(target, { key: 'Enter' });
    fireEvent.keyDown(target, { key: ' ' });
    expect(onActivate).not.toHaveBeenCalled();
  });
});
