import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;

  hasBackground?: boolean;
  hasBorder?: boolean;

  /**
   * Renders a `<textarea>` instead of a single-line `<input>`, so a long
   * typed value wraps onto multiple lines instead of scrolling
   * horizontally. Off by default — every existing consumer (Search, the
   * image-picker URL fields) is a genuinely single-line field. `rows`
   * (native, passed straight through) sets how many lines are visible
   * before the field scrolls; defaults to 3 here when omitted.
   */
  multiline?: boolean;

  /** Only meaningful with `multiline` — native `rows`, forwarded to the `<textarea>`. Defaults to 3 when omitted. */
  rows?: number;
}
