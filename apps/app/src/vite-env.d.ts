/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

/** Resolved versions of the parse-relevant dependencies, injected at build time (vite.config.ts). */
declare const __PARSE_DEPENDENCY_VERSIONS__: Record<string, string>;

interface ImportMetaEnv {
  /** Set to 'true' to expose window.__clutter_devtools in dev (see devtools/index.ts). */
  readonly VITE_DEVTOOLS?: string;
  /** Unsplash API access key — set in apps/app/.env.local (never commit). */
  readonly VITE_UNSPLASH_ACCESS_KEY?: string;
}
