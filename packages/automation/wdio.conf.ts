/**
 * Proof-of-concept WebdriverIO config — drives the real compiled Tauri
 * binary at apps/app/src-tauri (not a browser, not a fake filesystem) via
 * the embedded WebDriver provider (the only driverProvider that supports
 * macOS without a paid CrabNebula subscription).
 *
 * This package is an external consumer of apps/app — it drives the app
 * over the WebDriver protocol against a compiled binary, and is never a
 * dependency of apps/app itself. See AUTOMATION.md.
 *
 * The automation-only WebDriver surface is enabled on the app side by two
 * gates that only this config trips together:
 *   1. apps/app/src-tauri/Cargo.toml's `automation` feature — an optional
 *      dependency, absent from the build graph of any ordinary build
 *      (debug or release). Only `npm run build:app` in this package passes
 *      `--features automation`.
 *   2. lib.rs only calls tauri_plugin_wdio_webdriver::init() when the
 *      TAURI_AUTOMATION env var is present — set below, in `env`, so an
 *      ordinary `npm run desktop` session never starts a WebDriver server
 *      even if built with the feature enabled by hand.
 * (A third gate, a capability file, was tried and removed — see
 * AUTOMATION.md for why.)
 *
 * This is a proof of concept only (see AUTOMATION.md) — the full Surface
 * Object / AutomationDriver architecture lands once this confirms the
 * underlying tooling works reliably.
 *
 * PERFORMANCE: every spec file's own `before()` must call
 * helpers/suppressFocusRecoveryOverhead.ts's exported function before any
 * findElement/findElements/$/$$/elementClick/getTitle command. Without it,
 * every one of those commands pays a blocking ~10-20s tax — see that
 * file's doc comment and AUTOMATION.md's Performance section for the full
 * explanation and benchmark. (A config-level `before` hook here was tried
 * first; wdio.conf.ts's own `before` fires before `browser.tauri` is
 * attached, so it can't call this — must be spec-level.)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appBinaryPath = path.resolve(
  __dirname,
  '../../apps/app/src-tauri/target/debug/app'
);

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [path.join(__dirname, 'scenarios/**/*.spec.ts')],
  maxInstances: 1,

  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'embedded',
        env: {
          TAURI_AUTOMATION: '1',
        },
      },
    ],
  ],

  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        application: appBinaryPath,
      },
    },
  ],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  reporters: ['spec'],
};
