/**
 * Automation session bootstrap — a WDIO service, not a spec-level helper,
 * so every scenario gets it automatically. No spec file needs to know
 * this exists.
 *
 * Registered in wdio.conf.ts's `services` array *after* `@wdio/tauri-service`
 * (services run their `before()` hooks in registration order — verified
 * empirically, not assumed: `typeof browser.tauri` here logs `'object'`,
 * confirming @wdio/tauri-service's own before() — which is what attaches
 * `browser.tauri` in the first place — has already run by the time this
 * fires).
 *
 * What it does and why: calls `browser.tauri.switchWindow('main')` once
 * per session. This isn't a real window switch (the app has one window) —
 * its only purpose is that @wdio/tauri-service's `ensureActiveWindowFocus`
 * check (runs before every findElement/findElements/$/$$/elementClick/
 * getTitle) skips itself for the rest of the session once it sees an
 * explicit switchWindow call. Without this, each of those commands pays a
 * blocking ~10-20s tax — see AUTOMATION.md's Performance section for the
 * full root cause and measurements.
 */
import type { Capabilities, Services } from '@wdio/types';

export default class AutomationSessionBootstrap implements Services.ServiceInstance {
  async before(
    _capabilities: Capabilities.RequestedStandaloneCapabilities,
    _specs: string[],
    browser: WebdriverIO.Browser
  ): Promise<void> {
    await browser.tauri.switchWindow('main');
  }
}
