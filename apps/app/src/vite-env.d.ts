/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

/** Resolved versions of the parse-relevant dependencies, injected at build time (vite.config.ts). */
declare const __PARSE_DEPENDENCY_VERSIONS__: Record<string, string>;

interface ImportMetaEnv {
  /** Set to 'true' to expose window.__clutter_devtools in dev (see devtools/index.ts). */
  readonly VITE_DEVTOOLS?: string;
  /**
   * The address of Clutter's Unsplash proxy (workers/unsplash-proxy). Public, not a secret: the Unsplash Access Key
   * lives only in the Worker. Defaults to the deployed proxy; an empty value turns Unsplash off.
   */
  readonly VITE_UNSPLASH_PROXY_URL?: string;
}
