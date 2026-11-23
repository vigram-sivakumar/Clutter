// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@components/toast/ToastProvider';
import { Settings } from '../Settings';
import { writeDateFormatChoice, readDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { writeStartupBehavior } from '../startup-setting/startupPreference';
import type { ResetSettingsOutcome } from './resetSettingsToDefaults';

const TITLE = 'Reset settings to defaults';
const MESSAGE =
  'This will restore application preferences to their default values across all Spaces. Your notes, daily notes, templates, assets, and other content will not be affected';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const resetButton = () => screen.getByRole('button', { name: 'Reset…' });
const confirmation = () => screen.queryByText(`${TITLE}?`);
const inConfirmation = () => within(screen.getByText(`${TITLE}?`).closest('.confirmation') as HTMLElement);
const startupControl = () => screen.getByRole('button', { name: /^Open on launch:/ });
const NONE: ResetSettingsOutcome = { failedSpaces: [] };

describe('Settings → Preferences → Reset', () => {
  it('is a separate Reset section at the bottom of the page, after every group of settings', () => {
    render(<Settings />);

    const groups = Array.from(document.querySelectorAll('.settings-group'));
    expect(groups.at(-1)?.querySelector('.settings-group__title')).toHaveTextContent('Reset');
    expect(groups.slice(0, -1).map((group) => group.querySelector('.settings-group__title')?.textContent)).toEqual([
      'Appearance',
      'Startup',
      'Calendar',
      'Data & storage',
    ]);
  });

  it('offers the one action, with its description, as a danger-outline button', () => {
    render(<Settings />);

    const entry = screen.getByText(TITLE).closest('.settings-entry') as HTMLElement;
    expect(within(entry).getByText('Restore application preferences to their default values across all Spaces')).toBeInTheDocument();
    expect(resetButton()).toHaveClass('button--outline-danger');
    // One action only: nothing offers to reset the interface.
    expect(screen.queryByText(/UI customizations/i)).toBeNull();
    expect(document.querySelectorAll('.settings-group:last-child .settings-entry')).toHaveLength(1);
  });

  it('is only on the Preferences page', () => {
    render(<Settings />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Layout'));
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

describe('the confirmation', () => {
  it('asks first, in the existing confirmation, and resets nothing yet', () => {
    const onReset = vi.fn().mockResolvedValue(NONE);
    writeStartupBehavior('last-opened-note');
    render(<Settings onResetSettings={onReset} />);
    expect(confirmation()).toBeNull();

    fireEvent.click(resetButton());

    expect(confirmation()).toBeInTheDocument();
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();
    expect(startupControl()).toHaveTextContent('Last opened note');
  });

  it('offers Cancel and a filled danger Reset settings button — the writing conventions kept: no ending period', () => {
    render(<Settings />);
    fireEvent.click(resetButton());

    expect(inConfirmation().getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(inConfirmation().getByRole('button', { name: 'Reset settings' })).toHaveClass('button--danger');
    expect(MESSAGE.endsWith('.')).toBe(false);
    expect(`${TITLE}?`.endsWith('.')).toBe(false);
  });

  it('Cancel closes it and changes nothing', async () => {
    const onReset = vi.fn().mockResolvedValue(NONE);
    writeStartupBehavior('last-opened-note');
    writeDateFormatChoice('ymd');
    render(<Settings onResetSettings={onReset} />);
    fireEvent.click(resetButton());

    fireEvent.click(inConfirmation().getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(confirmation()).toBeNull());
    expect(onReset).not.toHaveBeenCalled();
    expect(startupControl()).toHaveTextContent('Last opened note');
    expect(readDateFormatChoice()).toBe('ymd');
  });

  it('confirming resets once and closes the confirmation', async () => {
    const onReset = vi.fn().mockResolvedValue(NONE);
    render(<Settings onResetSettings={onReset} />);
    fireEvent.click(resetButton());

    fireEvent.click(inConfirmation().getByRole('button', { name: 'Reset settings' }));

    await waitFor(() => expect(onReset).toHaveBeenCalledOnce());
    await waitFor(() => expect(confirmation()).toBeNull());
  });
});

describe('after the reset', () => {
  it('the controls on the page show the defaults at once, with no reload — including ones that keep their own copy of the value', async () => {
    writeStartupBehavior('last-opened-note');
    writeDateFormatChoice('ymd');
    // Reset what a real handler would.
    const { resetAppPreferences } = await import('./resetAppPreferences');
    const onReset = vi.fn(async () => {
      resetAppPreferences();
      return NONE;
    });
    render(<Settings onResetSettings={onReset} />);
    expect(startupControl()).toHaveTextContent('Last opened note');

    fireEvent.click(resetButton());
    fireEvent.click(inConfirmation().getByRole('button', { name: 'Reset settings' }));

    await waitFor(() => expect(startupControl()).toHaveTextContent("Today's note"));
    expect(readDateFormatChoice()).toBe('relative');
  });

  it('without a Space behind it, the section still resets the app-wide preferences, and leaves interface layout alone', async () => {
    writeStartupBehavior('last-opened-note');
    localStorage.setItem('clutter-sidebar-width', '320');
    render(<Settings />);

    fireEvent.click(resetButton());
    fireEvent.click(inConfirmation().getByRole('button', { name: 'Reset settings' }));

    await waitFor(() => expect(startupControl()).toHaveTextContent("Today's note"));
    expect(localStorage.getItem('clutter-sidebar-width')).toBe('320');
  });

  it('the dialog stays on the Preferences page, with the Reset section still there', async () => {
    render(<Settings onResetSettings={vi.fn().mockResolvedValue(NONE)} />);
    fireEvent.click(resetButton());
    fireEvent.click(inConfirmation().getByRole('button', { name: 'Reset settings' }));

    await waitFor(() => expect(confirmation()).toBeNull());

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(resetButton()).toBeEnabled();
  });
});

describe('when it cannot', () => {
  const confirmReset = () => {
    fireEvent.click(resetButton());
    fireEvent.click(inConfirmation().getByRole('button', { name: 'Reset settings' }));
  };

  it('says how many Spaces could not be reset, and nothing when all were', async () => {
    render(
      <ToastProvider>
        <Settings onResetSettings={vi.fn().mockResolvedValue({ failedSpaces: ['/a', '/b'] })} />
      </ToastProvider>
    );

    confirmReset();
    expect(await screen.findByText('Couldn’t reset settings for 2 Spaces')).toBeInTheDocument();

    cleanup();
    render(
      <ToastProvider>
        <Settings onResetSettings={vi.fn().mockResolvedValue({ failedSpaces: ['/a'] })} />
      </ToastProvider>
    );
    confirmReset();
    expect(await screen.findByText('Couldn’t reset settings for 1 Space')).toBeInTheDocument();
  });

  it('says so when the reset itself fails, and lets the user try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ToastProvider>
        <Settings onResetSettings={vi.fn().mockRejectedValue(new Error('boom'))} />
      </ToastProvider>
    );

    fireEvent.click(resetButton());
    fireEvent.click(inConfirmation().getByRole('button', { name: 'Reset settings' }));

    expect(await screen.findByText('Couldn’t reset settings')).toBeInTheDocument();
    await waitFor(() => expect(resetButton()).toBeEnabled());
  });

  it('waits while the Space is changing under the dialog', () => {
    render(<Settings space={{ busy: true }} />);

    expect(resetButton()).toBeDisabled();
  });
});
