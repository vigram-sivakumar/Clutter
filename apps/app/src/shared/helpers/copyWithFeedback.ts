import { copyTextToClipboard } from './copyTextToClipboard';

/** What a copy reports through — the toast API satisfies it, and `shared` stays free of UI imports. */
export interface CopyNotifier {
  show(input: { readonly text: string }): unknown;
  fail(text: string, error?: unknown): unknown;
}

/**
 * Copies `text` and says so: `message` ("Link copied", "Path copied") once the clipboard accepted it, an
 * error when it refused (a denied permission, a non-secure context) — never a success before the write
 * finished, and never an unhandled rejection. Without a notifier it still logs a refusal.
 */
export async function copyWithFeedback(text: string, message: string, notifier?: CopyNotifier): Promise<void> {
  try {
    await copyTextToClipboard(text);
  } catch (error) {
    if (notifier) {
      notifier.fail('Couldn’t copy to the clipboard', error);
    } else {
      console.error('Couldn’t copy to the clipboard', error);
    }
    return;
  }

  notifier?.show({ text: message });
}
