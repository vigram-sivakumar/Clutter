import { isTauri } from '@tauri-apps/api/core';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Why CodeMirror needs a nonce in a packaged Tauri build.
 *
 * CodeMirror injects its base theme and every `EditorView.theme()` module (editorTheme, the completion popup, ...)
 * as an inline `<style>` element when an EditorView is constructed. In a packaged build Tauri adds a nonce to the
 * `style-src` of the CSP it serves with `index.html` (it does so because `index.html` carries a `<style>` element —
 * the first-paint background — which Tauri stamps with that nonce). A browser ignores `'unsafe-inline'` once a nonce
 * is present, so an un-nonced `<style>` is refused and CodeMirror is left unstyled — among other things its
 * screen-reader live region (`.cm-announced`) is no longer moved off-screen and shows as visible text.
 *
 * The fix is CodeMirror's own: pass the same nonce (`EditorView.cspNonce`) so the injected `<style>` is allowed. The
 * nonce is read from that first-paint `<style>` element. In development the page is served by Vite, Tauri adds no
 * nonce, and there is nothing to pass.
 */

/**
 * The nonce Tauri stamped on a `<style>` element of the page, or `undefined` when there is none.
 *
 * Read from the element's `.nonce` property: browsers hide the `nonce` attribute after parsing (it reads as an empty
 * string), but the property keeps the value. Every `<style>` is checked rather than selecting on the attribute, so
 * this does not depend on the hidden attribute staying in the DOM.
 */
export function readStyleNonce(doc: Document = document): string | undefined {
  for (const style of doc.querySelectorAll('style')) {
    if (style.nonce) return style.nonce;
  }
  return undefined;
}

let reportedMissingNonce = false;

/**
 * `EditorView.cspNonce` set to the page's style nonce, or nothing when the page has none. Placed in every editor's
 * extensions, so each EditorView (a page, a reference preview, any later one) is constructed with it.
 *
 * Having no nonce is normal in development and in the web build. In a packaged desktop build it means the nonce could
 * not be found while a CSP is active, so CodeMirror's styles will be refused: that is reported, once, rather than
 * left silent. No other mechanism is substituted.
 */
export function cspNonceExtension(): Extension {
  const nonce = readStyleNonce();
  if (nonce) return EditorView.cspNonce.of(nonce);

  if (!import.meta.env.DEV && isTauri() && !reportedMissingNonce) {
    reportedMissingNonce = true;
    console.error(
      'CodeMirror: no CSP style nonce was found on the page (expected on the first-paint <style> in index.html). ' +
        "CodeMirror's injected styles will be blocked by the packaged build's Content-Security-Policy."
    );
  }
  return [];
}
