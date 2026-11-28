// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptRename, resetNameTakenToast, showNameTaken } from './showNameTaken';
import type { ToastApi, ToastInput } from './ToastProvider';

function fakeToast() {
  const shown: ToastInput[] = [];
  const api: ToastApi = {
    show: (input) => {
      shown.push(input);
      return shown.length;
    },
    fail: () => null,
    dismiss: () => {},
  };
  return { api, shown };
}

const textOf = (input: ToastInput) => render(<div>{input.text}</div>).container.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  resetNameTakenToast();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('showNameTaken', () => {
  it('says the name is already taken, with the name in typographic quotes and no ending period', () => {
    const { api, shown } = fakeToast();

    showNameTaken(api, 'Paragraph');

    expect(shown).toHaveLength(1);
    expect(textOf(shown[0]!)).toBe('The name “Paragraph” is already taken');
  });

  it('is an error toast, and puts the name in the shared `toast__name` span so a long name is cut with an ellipsis', () => {
    const { api, shown } = fakeToast();

    showNameTaken(api, 'A very long name');

    expect(shown[0]!.tone).toBe('error');
    const { container } = render(<div>{shown[0]!.text}</div>);
    expect(container.querySelector('.toast__name')?.textContent).toBe('A very long name');
  });

  it('shows the name as typed, without the spaces around it', () => {
    const { api, shown } = fakeToast();

    showNameTaken(api, '   Paragraph  ');

    expect(textOf(shown[0]!)).toBe('The name “Paragraph” is already taken');
  });

  it('shows the same refused name only once inside the repeat window (Enter, then the blur after it)', () => {
    const { api, shown } = fakeToast();

    showNameTaken(api, 'Paragraph');
    vi.advanceTimersByTime(300);
    showNameTaken(api, 'Paragraph');
    showNameTaken(api, ' Paragraph ');

    expect(shown).toHaveLength(1);
  });

  it('shows it again once the window has passed, a later refusal being a new attempt', () => {
    const { api, shown } = fakeToast();

    showNameTaken(api, 'Paragraph');
    vi.advanceTimersByTime(3000);
    showNameTaken(api, 'Paragraph');

    expect(shown).toHaveLength(2);
  });

  it('shows a different name straight away', () => {
    const { api, shown } = fakeToast();

    showNameTaken(api, 'Paragraph');
    showNameTaken(api, 'Headings');

    expect(shown.map(textOf)).toEqual(['The name “Paragraph” is already taken', 'The name “Headings” is already taken']);
  });
});

describe('acceptRename', () => {
  it('accepts an available name without showing a toast', () => {
    const { api, shown } = fakeToast();
    expect(acceptRename(api, 'Fresh', true)).toBe(true);
    expect(shown).toEqual([]);
  });

  it('rejects an unavailable name with the existing deduplicated feedback', () => {
    const { api, shown } = fakeToast();
    expect(acceptRename(api, 'Taken', false)).toBe(false);
    expect(acceptRename(api, 'Taken', false)).toBe(false);
    expect(shown.map(textOf)).toEqual(['The name “Taken” is already taken']);
  });
});
