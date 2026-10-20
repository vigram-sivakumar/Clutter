// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from './Switch';

afterEach(cleanup);

describe('Switch', () => {
  it('is an off switch by default, named by its aria-label', () => {
    render(<Switch aria-label="Notifications" />);
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).not.toHaveClass('switch--checked');
  });

  it('reports the opposite state on click, once', () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="x" isChecked onCheckedChange={onCheckedChange} />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('shows the checked state and toggles when controlled', () => {
    function Controlled() {
      const [on, setOn] = useState(false);
      return <Switch aria-label="x" isChecked={on} onCheckedChange={setOn} />;
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch')).toHaveClass('switch--checked');
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('does nothing when disabled', () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="x" disabled onCheckedChange={onCheckedChange} />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
