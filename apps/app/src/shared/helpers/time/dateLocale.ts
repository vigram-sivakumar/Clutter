/**
 * The locale every date label is formatted in. It is the system's own — what `Intl.DateTimeFormat` resolves
 * when given none — read at the moment of formatting, never cached and never a hard-coded region, so a change
 * of the system's language or region shows up without any stored override.
 *
 * A test can pin it with `setSystemLocaleOverride`, or pass `locale` straight to a formatter.
 */
let override: string | null = null;

/** Test seam: pins what "the system locale" is. `null` returns to the real one. */
export function setSystemLocaleOverride(locale: string | null): void {
  override = locale;
}

export function getSystemLocale(): string {
  return override ?? new Intl.DateTimeFormat().resolvedOptions().locale;
}

/** Calls `listener` when the browser reports a language change (`languagechange`). Returns an unsubscribe. */
export function subscribeSystemLocale(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('languagechange', listener);
  return () => window.removeEventListener('languagechange', listener);
}
