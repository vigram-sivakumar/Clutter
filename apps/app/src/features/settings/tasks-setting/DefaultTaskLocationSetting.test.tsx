// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultTaskLocationSetting } from './DefaultTaskLocationSetting';
import { readDefaultTaskLocation } from '@shared/helpers/defaultTaskLocationPreference';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Default location for new tasks', () => {
  it('starts on Inbox and offers all three destinations through the existing menu', () => {
    render(<DefaultTaskLocationSetting />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Default location for new tasks: Inbox',
      })
    );
    expect(
      screen.getByRole('menuitem', { name: 'Due-date Daily Note' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Today’s Daily Note' }));
    expect(readDefaultTaskLocation()).toBe('today');
    expect(
      screen.getByRole('button', {
        name: 'Default location for new tasks: Today’s Daily Note',
      })
    ).toBeInTheDocument();
  });
});
