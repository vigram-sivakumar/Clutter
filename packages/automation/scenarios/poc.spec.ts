/**
 * Proof of concept: confirms the embedded-WebDriver setup can actually
 * drive the real Tauri binary on this machine. The old Playwright-based
 * e2e/ suite has been removed — this is now the one automation system.
 * See AUTOMATION.md.
 */
import { testIds } from '../../../apps/app/src/shared/testing/selectors';
import { suppressFocusRecoveryOverhead } from '../helpers/suppressFocusRecoveryOverhead';

describe('automation proof of concept', () => {
  before(suppressFocusRecoveryOverhead);

  it('launches the app, finds the sidebar, and takes a screenshot', async () => {
    const sidebar = await $(`[data-testid="${testIds.sidebar.root}"]`);
    await sidebar.waitForExist({ timeout: 15000 });

    expect(await sidebar.isExisting()).toBe(true);

    await browser.saveScreenshot(
      new URL('../screenshots/poc.png', import.meta.url).pathname
    );
  });
});
