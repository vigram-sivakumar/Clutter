/**
 * Call once, in a spec file's own `before()`, before any findElement/
 * findElements/$/$$/elementClick/getTitle command. See wdio.conf.ts's
 * PERFORMANCE note for the full explanation and measured impact
 * (~10-20s/command without this, ~3-9ms/command with it).
 *
 * `mochaOpts.require` was tried first to do this once globally — it uses
 * mocha's own file loader, not WDIO's TypeScript-aware spec loader, so a
 * `.ts` root-hooks file silently never ran. Calling this from each spec's
 * own `before()` is the version actually verified to work (proven in the
 * benchmark that measured this fix's impact in the first place).
 */
export async function suppressFocusRecoveryOverhead(): Promise<void> {
  await browser.tauri.switchWindow('main');
}
