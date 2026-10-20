// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoundIconButton } from './RoundIconButton';

afterEach(cleanup);

describe('RoundIconButton', () => {
  it('is an icon-only Button with the round class and the icon drawn', () => {
    render(<RoundIconButton icon="dismiss" aria-label="Close" />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveClass('button', 'button--icon', 'round-icon-button');
    expect(button.querySelector('[data-icon="dismiss"] svg')).not.toBeNull();
  });

  it('defaults to the xs ghost button, and lets a caller add a class', () => {
    render(<RoundIconButton icon="dismiss" aria-label="Close" className="extra" />);
    expect(screen.getByRole('button')).toHaveClass(
      'button--ghost',
      'button--xs',
      'extra'
    );
  });

  it('draws a smaller icon in the xs button than in the others', () => {
    const iconWidth = () => screen.getByRole('button').querySelector('svg')?.getAttribute('width');
    const { rerender } = render(<RoundIconButton icon="dismiss" aria-label="Close" />);
    expect(iconWidth()).toBe('12');
    rerender(<RoundIconButton icon="dismiss" aria-label="Close" size="medium" />);
    expect(iconWidth()).toBe('16');
  });

  it('takes one of Button\'s own sizes instead, without the xs class', () => {
    render(<RoundIconButton icon="dismiss" aria-label="Close" size="medium" />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('button--medium');
    expect(button).not.toHaveClass('button--xs');
  });

  it('keeps Button behaviour: click, disabled and the forced-hover state', () => {
    const onClick = vi.fn();
    const { rerender } = render(<RoundIconButton icon="dismiss" aria-label="Close" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<RoundIconButton icon="dismiss" aria-label="Close" isActive disabled />);
    expect(screen.getByRole('button')).toHaveClass('button--active', 'button--disabled');
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
