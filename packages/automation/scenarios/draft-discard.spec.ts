/**
 * Regression coverage, at the UI level, for the draft-discard bug:
 * opening another resource should discard an in-memory draft that was
 * never persisted, instead of leaving it in the sidebar until restart.
 *
 * The unit-level fix and its edge cases (promotion instead of discard,
 * not discarding a draft whose save failed) live in
 * apps/app/src/core/application/page/PageOperations.navigation.test.ts.
 * This scenario exists to confirm the fix actually holds through the real
 * UI/save pipeline, not just PageOperations in isolation.
 */
import { testIds } from '../../../apps/app/src/shared/testing/selectors';
import { suppressFocusRecoveryOverhead } from '../helpers/suppressFocusRecoveryOverhead';

describe('draft discard', () => {
  before(suppressFocusRecoveryOverhead);

  it('removes an empty draft from the sidebar once navigation away from it settles', async () => {
    const notesTab = await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`);
    await notesTab.waitForExist({ timeout: 15000 });
    await notesTab.click();

    const before = new Set<string>();
    for (const item of await $$('[data-testid^="sidebar.noteItem."]')) {
      before.add(await item.getAttribute('data-testid'));
    }

    const existingNote = [...before][0];
    if (!existingNote) {
      throw new Error(
        'This scenario needs at least one existing persisted note in the vault to navigate to.'
      );
    }

    const newButton = await $(`[data-testid="${testIds.sidebar.createNoteButton}"]`);
    await newButton.click();

    let draftTestId: string | undefined;
    await browser.waitUntil(
      async () => {
        for (const item of await $$('[data-testid^="sidebar.noteItem."]')) {
          const id = await item.getAttribute('data-testid');
          if (!before.has(id)) {
            draftTestId = id;
            return true;
          }
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: 'draft never appeared in the sidebar' }
    );

    // Navigate away without typing anything — the draft stays empty.
    const existingNoteRow = await $(`[data-testid="${existingNote}"]`);
    await existingNoteRow.click();

    await browser.waitUntil(
      async () => !(await $(`[data-testid="${draftTestId}"]`).isExisting()),
      {
        timeout: 5000,
        timeoutMsg: 'empty draft was not discarded after navigating away',
      }
    );

    await browser.saveScreenshot(
      new URL('../screenshots/draft-discard.png', import.meta.url).pathname
    );
  });
});
