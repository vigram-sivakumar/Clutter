// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression coverage for docs/editor-architecture-decisions.md's "Inline
 * formatting composition at the token level" entry, extended to
 * editor/task state: both decorating contexts that used to need their own
 * `.tok-strike .tok-wikilink` / `.cm-line:has(...) .tok-wikilink`
 * descendant-selector CSS are now handled by WikiLink/Tag/Date's own
 * widgets composing the applicable class (`tok-strike`, `cm-task-completed`)
 * directly onto themselves — see `collectActiveInlineClasses` and
 * `isNodeOnCompletedTask` in `inlineLivePreviewParticipants.ts`/
 * `taskEngagement.ts`. Both CSS rules are gone; the generic,
 * unqualified `.tok-strike`/`.cm-task-completed` rules already apply with
 * no ancestor selector.
 *
 * jsdom cannot compute real paint/layout, so this file is CSS-source-only.
 * DOM-level proof that a real widget's `classList` ends up composed
 * correctly (both inline-formatting ancestry and task-completion,
 * independently and together) lives in `inlineLivePreviewRegion.test.ts`
 * (Tag/Date), `wikilink/wikiLinkLivePreview.test.ts` (WikiLink), and
 * `task/taskCompletedContentDecoration.test.ts` (plain text + the shared
 * `isNodeOnCompletedTask` state source) — not duplicated here.
 */
describe('MarkdownEditor.css — WikiLink text-decoration composition', () => {
  const css = readFileSync(join(__dirname, 'MarkdownEditor.css'), 'utf8');
  // Strip comments before checking for selectors — the old :has()-based
  // rules are still mentioned in surrounding doc comments explaining what
  // was removed and why; those mentions are prose, not a live selector.
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('declares a plain, unqualified .cm-task-completed rule — no :has() or construct-specific ancestor selector', () => {
    const match = cssWithoutComments.match(/(?<![\w.-])\.cm-task-completed\s*(?:,[^{]*)?\{([^}]*)\}/);
    expect(match, '.cm-task-completed rule not found').not.toBeNull();
    expect(match![1]).toMatch(/color\s*:\s*var\(--foreground-tertiary\)\s*;/);
  });

  it('dims completed task content by color only — no strikethrough (deliberately removed 2026-09-13)', () => {
    const match = cssWithoutComments.match(/(?<![\w.-])\.cm-task-completed\s*(?:,[^{]*)?\{([^}]*)\}/);
    expect(match, '.cm-task-completed rule not found').not.toBeNull();
    expect(match![1]).not.toMatch(/text-decoration-line/);
  });

  it('no longer declares any :has()-based completed-task descendant selector', () => {
    expect(cssWithoutComments).not.toMatch(/:has\(\.cm-task-checkbox/);
  });

  it('no longer declares a .tok-strike .tok-wikilink descendant-selector rule — superseded by tree-based class composition', () => {
    const match = css.match(/\.cm-editor\s+\.tok-strike\s+\.tok-wikilink\s*\{/);
    expect(
      match,
      '.tok-strike .tok-wikilink should no longer exist: .tok-wikilink now carries tok-strike directly, so the plain .tok-strike rule already applies with no ancestor selector'
    ).toBeNull();
  });

  it('does not reintroduce the rejected inherit-chain fix on unrelated formatting-mark classes', () => {
    for (const selector of ['\\.tok-strong', '\\.tok-emphasis', '\\.tok-highlight']) {
      const ruleRegex = new RegExp(`\\.cm-editor\\s+${selector}\\s*\\{([^}]*)\\}`, 'g');
      let ruleMatch: RegExpExecArray | null;
      while ((ruleMatch = ruleRegex.exec(css))) {
        expect(
          ruleMatch[1],
          `${selector.replace(/\\/g, '')}'s rule must not declare text-decoration-line — composition happens at the widget's own element, never by touching unrelated marker classes`
        ).not.toMatch(/text-decoration-line/);
      }
    }
  });
});

/**
 * Regression coverage for the WikiLink icon/DOM-structure consistency fix
 * (WikiLinkWidget.ts, 2026-09-27): a resolved and an unresolved WikiLink
 * now share the identical icon+title DOM structure (see
 * `wikiLinkLivePreview.test.ts`'s own "resolved and unresolved WikiLinks
 * share the identical icon+title DOM structure" suite for the DOM-level
 * proof), so the only difference left between them must be status-scoped
 * styling — opacity — never a text-decoration declaration duplicating what
 * `.tok-wikilink__title` (present unconditionally now) already provides.
 */
describe('MarkdownEditor.css — unresolved WikiLink opacity, no duplicated underline', () => {
  const css = readFileSync(join(__dirname, 'MarkdownEditor.css'), 'utf8');
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it("declares the unresolved status's reduced opacity", () => {
    const match = cssWithoutComments.match(/\.tok-wikilink\[data-wikilink-status='unresolved'\]\s*\{([^}]*)\}/);
    expect(match, ".tok-wikilink[data-wikilink-status='unresolved'] rule not found").not.toBeNull();
    expect(match![1]).toMatch(/opacity\s*:\s*var\(--opacity-medium\)\s*;/);
  });

  it('no longer duplicates the underline on the unresolved rule — .tok-wikilink__title already declares it unconditionally for every status', () => {
    const match = cssWithoutComments.match(/\.tok-wikilink\[data-wikilink-status='unresolved'\]\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(
      match![1],
      'a duplicated text-decoration here would stack a second decorating box on top of .tok-wikilink__title\'s own, the same WKWebView compositing risk this file\'s struck-link investigation already found elsewhere'
    ).not.toMatch(/text-decoration/);
  });

  it('.tok-wikilink__title declares the underline unconditionally (not status-scoped) so every status gets it from one place', () => {
    const match = cssWithoutComments.match(/\.tok-wikilink__title\s*\{([^}]*)\}/);
    expect(match, '.tok-wikilink__title rule not found').not.toBeNull();
    expect(match![1]).toMatch(/text-decoration\s*:\s*underline\s*;/);
  });
});
