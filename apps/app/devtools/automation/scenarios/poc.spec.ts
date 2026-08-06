/**
 * Proof of concept: confirms the embedded-WebDriver setup can actually
 * drive the real Tauri binary on this machine before any of the existing
 * Playwright-based e2e/ suite is ported. See AUTOMATION.md.
 */
describe('automation proof of concept', () => {
  it('launches the app, finds the sidebar, and takes a screenshot', async () => {
    const sidebar = await $('[data-testid="sidebar"]');
    await sidebar.waitForExist({ timeout: 15000 });

    expect(await sidebar.isExisting()).toBe(true);

    await browser.saveScreenshot(
      new URL('../screenshots/poc.png', import.meta.url).pathname
    );
  });
});
