// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CheckboxPropertyValue } from './CheckboxPropertyValue';
import { PropertyList } from './PropertyList';

afterEach(() => cleanup());

const box = () => screen.getByRole('checkbox') as HTMLButtonElement;

function Stateful({ initial }: { initial: boolean }) {
  const [value, setValue] = useState(initial);
  return <CheckboxPropertyValue name="Done" value={value} editable onCommit={setValue} />;
}

describe('CheckboxPropertyValue', () => {
  it('shows checked and unchecked state', () => {
    const { rerender } = render(<CheckboxPropertyValue name="Done" value editable={false} />);
    expect(box().getAttribute('aria-checked')).toBe('true');
    rerender(<CheckboxPropertyValue name="Done" value={false} editable={false} />);
    expect(box().getAttribute('aria-checked')).toBe('false');
  });

  it('editable: a click toggles and commits immediately', () => {
    const onCommit = vi.fn();
    render(<CheckboxPropertyValue name="Done" value={false} editable onCommit={onCommit} />);
    fireEvent.click(box());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('editable: toggles back and forth', () => {
    render(<Stateful initial={false} />);
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('false');
  });

  it('read-only: shows the state but is not interactive', () => {
    render(<CheckboxPropertyValue name="Done" value editable={false} />);
    expect(box().disabled).toBe(true);
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('true');
  });

  it('renders through PropertyList for the boolean type', () => {
    render(<PropertyList items={[{ name: 'Done', type: 'boolean', value: true, editable: false }]} />);
    expect(box().getAttribute('aria-checked')).toBe('true');
  });
});
