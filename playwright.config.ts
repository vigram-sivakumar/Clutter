import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Clutter editor ownership tests
 */
export default defineConfig({
  testDir: './packages/editor/engine/keyboard/__tests__',
  testMatch: '**/*.spec.ts',

  // Run tests in parallel
  fullyParallel: true,

  // Fail on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter
  reporter: 'html',

  // Shared settings
  use: {
    // Base URL for the app
    baseURL: 'http://localhost:1420',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run dev server before tests (or reuse existing)
  webServer: {
    command: 'npm run dev:desktop',
    url: 'http://localhost:1420',
    reuseExistingServer: true, // Always reuse in local dev
    timeout: 120_000, // Tauri can take a while to start
  },
});
