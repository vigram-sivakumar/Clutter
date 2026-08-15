/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  /** Set to 'true' to expose window.__clutter_devtools in dev (see devtools/index.ts). */
  readonly VITE_DEVTOOLS?: string;
  /** Unsplash API access key — set in apps/app/.env.local (never commit). */
  readonly VITE_UNSPLASH_ACCESS_KEY?: string;
}
