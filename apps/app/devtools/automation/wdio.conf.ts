/**
 * Proof-of-concept WebdriverIO config — drives the real compiled Tauri
 * binary (not a browser, not a fake filesystem) via the embedded WebDriver
 * provider (the only driverProvider that supports macOS without a paid
 * CrabNebula subscription).
 *
 * The automation-only WebDriver surface is enabled on the app side by two
 * independent gates that only this config trips together:
 *   1. Cargo.toml compiles tauri-plugin-wdio-webdriver only when
 *      debug_assertions is set (never linked into a release binary at all).
 *   2. lib.rs only calls tauri_plugin_wdio_webdriver::init() when the
 *      TAURI_AUTOMATION env var is present — set below, in `env`, so an
 *      ordinary `npm run desktop` session never starts a WebDriver server.
 *
 * This is a proof of concept only (see AUTOMATION.md) — the full Surface
 * Object / AutomationDriver architecture lands once this confirms the
 * underlying tooling works on this machine.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appBinaryPath = path.resolve(__dirname, '../../src-tauri/target/debug/app');

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
