// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@components/toast/ToastProvider';
import { hasLegalLinks, isPublicHttpsUrl, LEGAL_LINKS } from '@core/legalLinks';
import { LegalLinks } from './LegalLinks';
import { Settings } from '../Settings';

const openExternalUrl = vi.fn<(url: string) => Promise<void>>();

vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: (url: string) => openExternalUrl(url) }));

const PRIVACY = 'https://example.com/clutter/privacy';
const SUPPORT = 'https://example.com/clutter/support';

beforeEach(() => {
  openExternalUrl.mockReset();
  openExternalUrl.mockResolvedValue(undefined);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderLinks = (links: Parameters<typeof LegalLinks>[0]['links']) =>
  render(
    <ToastProvider>
      <LegalLinks links={links} />
    </ToastProvider>
  );

describe('Settings → Preferences → Privacy and support', () => {
  it('shows nothing while no page has a published address, so the app never points at a missing page', () => {
    renderLinks({ privacyPolicy: null, support: null });

    expect(screen.queryByText('Privacy and support')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
  });

  it('shows an entry for each published page, and only for it', () => {
    renderLinks({ privacyPolicy: PRIVACY, support: null });

    expect(screen.getByText('Privacy and support')).toBeInTheDocument();
    expect(screen.getByText('Privacy policy')).toBeInTheDocument();
    expect(screen.getByText('How Clutter handles your information')).toBeInTheDocument();
    expect(screen.queryByText('Support')).toBeNull();
  });

  it('opens exactly the published address when the entry’s button is pressed', async () => {
    renderLinks({ privacyPolicy: PRIVACY, support: SUPPORT });

    fireEvent.click(screen.getByRole('button', { name: 'Open privacy policy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open support' }));

    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledTimes(2));
    expect(openExternalUrl.mock.calls.map(([url]) => url)).toEqual([PRIVACY, SUPPORT]);
  });

  it('never offers an address that is not an https URL', () => {
    renderLinks({ privacyPolicy: 'http://example.com/privacy', support: 'javascript:alert(1)' });

    expect(screen.queryByText('Privacy and support')).toBeNull();
  });

  it('says so when the page cannot be opened, and keeps the entry', async () => {
    openExternalUrl.mockRejectedValue(new Error('no browser'));
    renderLinks({ privacyPolicy: PRIVACY, support: null });

    fireEvent.click(screen.getByRole('button', { name: 'Open privacy policy' }));

    expect(await screen.findByText('Couldn’t open the page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open privacy policy' })).toBeInTheDocument();
  });

  it('is part of the Preferences page, above Reset, once an address is published', () => {
    const original = { ...LEGAL_LINKS };

    try {
      // The app's own addresses are the module's constants; publish them for this render only.
      (LEGAL_LINKS as { privacyPolicy: string | null }).privacyPolicy = PRIVACY;
      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );
      const titles = Array.from(document.querySelectorAll('.settings-group__title')).map((title) => title.textContent);

      expect(titles.at(-1)).toBe('Reset');
      expect(titles.at(-2)).toBe('Privacy and support');
    } finally {
      (LEGAL_LINKS as { privacyPolicy: string | null }).privacyPolicy = original.privacyPolicy;
    }
  });
});

describe('legal links configuration', () => {
  it('accepts an https address with a host and nothing else', () => {
    expect(isPublicHttpsUrl('https://example.com/privacy')).toBe(true);
    for (const value of [null, undefined, '', 'http://example.com', 'https://localhost', 'https://user:pass@example.com', 'mailto:a@b.co', 'example.com', 'file:///etc/hosts']) {
      expect(isPublicHttpsUrl(value)).toBe(false);
    }
  });

  it('reports whether any page is published', () => {
    expect(hasLegalLinks({ privacyPolicy: null, support: null })).toBe(false);
    expect(hasLegalLinks({ privacyPolicy: PRIVACY, support: null })).toBe(true);
  });
});
