/**
 * WebdriverIO config for the atomic-save real-app tests. It drives only the isolated binary (see README.md) and
 * refuses to start on anything else.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binary = process.env.CLUTTER_ATOMIC_TEST_BINARY ?? '';
const fakeHome = process.env.CLUTTER_FAKE_HOME ?? '';

if (path.basename(binary) !== 'clutter-atomictest') {
  throw new Error(`Refusing to run: CLUTTER_ATOMIC_TEST_BINARY must be the isolated build (clutter-atomictest), got ${JSON.stringify(binary)}`);
}
if (!/^\/(private\/)?tmp\/clutter-atomictest-/.test(fakeHome)) {
  throw new Error(`Refusing to run: CLUTTER_FAKE_HOME must be /tmp/clutter-atomictest-*, got ${JSON.stringify(fakeHome)}`);
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [path.join(__dirname, process.env.CLUTTER_ATOMIC_SPEC ?? 'specs/*.spec.ts')],
  maxInstances: 1,
  services: [
    ['@wdio/tauri-service', { driverProvider: 'embedded', env: { TAURI_AUTOMATION: '1', HOME: fakeHome } }],
  ],
  capabilities: [{ browserName: 'tauri', 'tauri:options': { application: binary } }],
  logLevel: 'warn',
  bail: 1,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 120000 },
  reporters: ['spec'],
};
