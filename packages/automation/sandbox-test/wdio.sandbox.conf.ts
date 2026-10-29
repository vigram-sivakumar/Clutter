/** EXPERIMENT (not for commit): drives the ad-hoc-signed, App-Sandbox-enabled test bundle. Refuses anything else. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AutomationSessionBootstrap from '../bootstrap/session';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binary = process.env.CLUTTER_SANDBOX_BINARY ?? '';
if (!/Clutter Sandbox Test\.app\/Contents\/MacOS\/app$/.test(binary)) {
  throw new Error(`Refusing to run: CLUTTER_SANDBOX_BINARY must be the sandbox test bundle, got ${JSON.stringify(binary)}`);
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [path.join(__dirname, process.env.CLUTTER_SANDBOX_SPEC ?? 'specs/*.spec.ts')],
  maxInstances: 1,
  services: [
    ['@wdio/tauri-service', { driverProvider: 'embedded', env: { TAURI_AUTOMATION: '1' } }],
    [AutomationSessionBootstrap, {}],
  ],
  capabilities: [{ browserName: 'tauri', 'tauri:options': { application: binary } }],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 120000 },
  reporters: ['spec'],
};
