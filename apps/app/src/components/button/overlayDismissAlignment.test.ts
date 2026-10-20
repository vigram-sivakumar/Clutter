import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A header-based overlay's dismiss button stays in its header's flex layout (never absolutely positioned), so it
 * sits at its overlay's own padding from the top-right corner: 12px in the picker card, 16px in the dialogs. An
 * overlay with no header (Confirmation, Settings) positions the button absolutely, 12px from the corner, and
 * keeps its title clear of it.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = (path: string) => readFileSync(join(SRC, path), 'utf8');
const rule = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf('}', start));
};

describe('overlay dismiss button alignment', () => {
  it.each([
    ['components/confirmation/Confirmation.css', '.confirmation__dismiss'],
    ['features/settings/Settings.css', '.settings__close'],
  ])('%s: %s is absolute, 12px from the top-right corner', (path, selector) => {
    const declarations = rule(css(path), selector);
    expect(declarations).toContain('position: absolute');
    expect(declarations).toContain('top: var(--space-12)');
    expect(declarations).toContain('right: var(--space-12)');
  });

  it.each([
    'components/confirmation/Confirmation.css',
    'features/settings/Settings.css',
  ])('%s keeps the title clear of the corner button', (path) => {
    expect(css(path)).toMatch(/padding-right: calc\(var\(--height-xs\) \+ var\(--space-8\)\)/);
  });

  it('the picker card header adds no corner inset of its own: its button sits at the card\'s 12px padding', () => {
    const picker = css('components/picker-card/PickerCard.css');
    expect(rule(picker, '.picker-card')).toContain('padding: var(--space-12) var(--space-12) 0');
    expect(rule(picker, '.picker-card__header')).toContain('padding-left: var(--space-6)');
    expect(rule(picker, '.picker-card__header')).not.toMatch(/padding:/);
  });

  it.each([
    'components/picker-card/PickerCard.css',
    'components/missing-space-dialog/MissingSpaceDialog.css',
    'components/space-details/SpaceDetails.css',
    'features/tasks/shortcuts/NewTaskContent.css',
    'features/tags/shortcuts/NewTagContent.css',
    'features/notes/shortcuts/NewFolderContent.css',
  ])('%s keeps its dismiss button in the header flow (no absolute positioning)', (path) => {
    expect(css(path)).not.toContain('position: absolute');
  });
});
