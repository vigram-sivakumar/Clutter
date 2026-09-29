// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSidebarWidth, DEFAULT_SIDEBAR_WIDTH } from './useSidebarWidth';

const STORAGE_KEY = 'clutter-sidebar-width';

function Harness() {
  const { width, setWidth, commitWidth } = useSidebarWidth();
  return (
    <div>
      <span data-testid="width">{width}</span>
      <button onClick={() => setWidth(340)}>set-live</button>
      <button onClick={() => commitWidth(340)}>commit</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeEach(() => {
  localStorage.clear();
});

describe('useSidebarWidth', () => {
  it('defaults to DEFAULT_SIDEBAR_WIDTH when nothing is stored', () => {
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('width').textContent).toBe(String(DEFAULT_SIDEBAR_WIDTH));
  });

  it('reads the previously persisted width on mount', () => {
    localStorage.setItem(STORAGE_KEY, '360');
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('width').textContent).toBe('360');
  });

  it('falls back to the default for corrupt/non-numeric stored values', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-number');
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('width').textContent).toBe(String(DEFAULT_SIDEBAR_WIDTH));
  });

  it('clamps an out-of-range stored value into [280, 420]', () => {
    localStorage.setItem(STORAGE_KEY, '9999');
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('width').textContent).toBe('420');
  });

  it('setWidth updates the live value without writing to localStorage', () => {
    const { getByTestId, getByText } = render(<Harness />);
    fireEvent.click(getByText('set-live'));
    expect(getByTestId('width').textContent).toBe('340');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('commitWidth updates the live value and persists it', () => {
    const { getByTestId, getByText } = render(<Harness />);
    fireEvent.click(getByText('commit'));
    expect(getByTestId('width').textContent).toBe('340');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('340');
  });
});
