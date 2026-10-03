import type { SaveToVaultResult } from '../application/asset/saveRemoteImage';

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * The sentence(s) the user sees after "Save to vault", built from the
 * structured result so the message says exactly what happened — how many
 * references now point at the saved copy, how many could not be updated, and
 * what was left alone on purpose.
 */
export function describeSaveToVaultResult(result: SaveToVaultResult): string {
  const parts: string[] = [
    result.reusedExisting
      ? 'This image was already saved in the vault.'
      : 'Saved the image to the vault.',
  ];

  parts.push(
    result.rewritten > 0
      ? `Updated ${plural(result.rewritten, 'reference')}.`
      : 'No notes or covers needed updating.'
  );

  if (result.failed.length > 0) {
    parts.push(`${plural(result.failed.length, 'reference')} could not be updated.`);
  }

  if (result.skippedArchived > 0) {
    parts.push(`${plural(result.skippedArchived, 'use')} in archived notes or folders left unchanged.`);
  }

  if (result.skippedHidden > 0) {
    parts.push(`${plural(result.skippedHidden, 'hidden cover')} left unchanged.`);
  }

  return parts.join(' ');
}
