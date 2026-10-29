// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});
import { SaveFailureNotice } from './SaveFailureNotice';

const buttons = () => screen.queryAllByRole('button').map((button) => button.textContent);

describe('SaveFailureNotice: what it says and offers depends on why the save failed', () => {
  it('a failed save says so and offers Retry (the default, as before)', () => {
    const onRetry = vi.fn();
    render(<SaveFailureNotice status="needs-action" onRetry={onRetry} />);

    expect(screen.getByRole('status').textContent).toContain('Couldn’t save changes');
    expect(buttons()).toEqual(['Retry']);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a note that changed on disk offers no Retry, because repeating the save would overwrite what is there; it offers a safe copy', () => {
    const onRetry = vi.fn();
    const onSaveAsNewNote = vi.fn();
    render(<SaveFailureNotice status="needs-action" kind="changed-on-disk" onRetry={onRetry} onSaveAsNewNote={onSaveAsNewNote} />);

    expect(screen.getByRole('status').textContent).toContain('This note changed on disk');
    expect(buttons()).toEqual(['Save as new note']);
    fireEvent.click(screen.getByText('Save as new note'));
    expect(onSaveAsNewNote).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('a save that could not be verified says so and keeps Retry, which checks before it writes', () => {
    render(<SaveFailureNotice status="needs-action" kind="unverified" onRetry={() => {}} />);

    expect(screen.getByRole('status').textContent).toContain('Couldn’t verify the save');
    expect(buttons()).toEqual(['Retry']);
  });

  it('an unsupported location says so and offers nothing that cannot work', () => {
    render(<SaveFailureNotice status="needs-action" kind="unsupported-location" onRetry={() => {}} onSaveAsNewNote={() => {}} />);

    expect(screen.getByRole('status').textContent).toContain('Can’t save safely to this location');
    expect(buttons()).toEqual([]);
  });

  it('a retry in progress still disables Retry', () => {
    render(<SaveFailureNotice status="retrying" onRetry={() => {}} />);

    expect((screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['failed', 'changed-on-disk', 'unverified', 'unsupported-location'] as const)('%s: copy follows the writing conventions (no final period, typographic apostrophe)', (kind) => {
    render(<SaveFailureNotice status="needs-action" kind={kind} onRetry={() => {}} onSaveAsNewNote={() => {}} />);
    const text = screen.getByRole('status').textContent ?? '';

    expect(text).not.toMatch(/\.$/);
    expect(text).not.toContain("'");
  });
});
