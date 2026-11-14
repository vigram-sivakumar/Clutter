// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tab, Tabs } from './Tabs';

afterEach(cleanup);

describe('Tab indicator', () => {
  it('is absent by default and keeps the existing content', () => {
    const { container, getByRole } = render(<Tabs value="notes" onValueChange={vi.fn()}>
      <Tab value="notes">Notes</Tab>
    </Tabs>);
    expect(container.querySelector('.tab__indicator')).toBeNull();
    expect(getByRole('button', { name: 'Notes' })).toHaveClass('tab--active');
  });

  it('toggles one decorative dot without replacing the icon or changing tab activation', () => {
    const onValueChange = vi.fn();
    const view = (hasIndicator: boolean) => <Tabs value="notes" onValueChange={onValueChange}>
      <Tab value="tasks" aria-label="Tasks" hasIndicator={hasIndicator}>
        <span data-testid="icon" aria-hidden="true">Icon</span>
      </Tab>
    </Tabs>;
    const { container, getByRole, getByTestId, rerender } = render(view(true));
    const icon = getByTestId('icon');
    expect(container.querySelectorAll('.tab__indicator')).toHaveLength(1);
    expect(container.querySelector('.tab__indicator')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(getByRole('button', { name: 'Tasks' }));
    expect(onValueChange).toHaveBeenCalledWith('tasks');
    rerender(view(false));
    expect(container.querySelector('.tab__indicator')).toBeNull();
    expect(getByTestId('icon')).toBe(icon);
    expect(getByRole('button', { name: 'Tasks' })).toBeInTheDocument();
  });
});
