import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// This project's vitest config doesn't load stylesheets into jsdom (see
// Folder.css.test.ts's own doc comment for the direct probe that confirmed
// this) — a getComputedStyle-based assertion in a component test can never
// meaningfully fail here. This reads CompactMarkdown.css's own source rules
// directly instead, as a regression guard for the specific styling-parity
// fix this file exists to prove: every compact construct's color/surface
// comes from the exact same semantic design token the CodeMirror editor's
// own `.tok-*` rules already use (MarkdownEditor.css), never a new or
// coincidentally-similar token, and never a `.tok-*` class itself.
const cssPath = fileURLToPath(new URL('./CompactMarkdown.css', import.meta.url));
const css = readFileSync(cssPath, 'utf-8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*{([^}]*)}`));
  expect(match, `expected a rule for ${selector}`).not.toBeNull();
  return match![1]!;
}

describe('CompactMarkdown.css — styling-parity tokens', () => {
  it('.compact-markdown-link uses the editor\'s own link color token, never .tok-link', () => {
    const body = rule('.compact-markdown-link');
    expect(body).toMatch(/color:\s*var\(--md-link-foreground\)/);
  });

  it('.compact-markdown-link-title owns the underline separately from .compact-markdown-link, mirroring .tok-link/.tok-link-title', () => {
    // Split so a struck link's `line-through` (declared on the outer,
    // color-owning element in renderCompactMarkdown.tsx) never shares a
    // `text-decoration-color`/`-thickness` with this element's own subtle
    // underline — the two are separate decorating elements, not one shared
    // `text-decoration-line` value.
    const outerBody = rule('.compact-markdown-link');
    expect(outerBody).not.toMatch(/text-decoration/);
    const titleBody = rule('.compact-markdown-link-title');
    expect(titleBody).toMatch(/text-decoration-color:\s*var\(--md-link-underline\)/);
  });

  it('.compact-markdown-struck owns the line-through in CSS (not inline styles)', () => {
    expect(rule('.compact-markdown-struck')).toMatch(/text-decoration-line:\s*line-through/);
  });

  it('.compact-markdown-date uses the editor\'s own date foreground token, not `inherit`', () => {
    const body = rule('.compact-markdown-date');
    expect(body).toMatch(/color:\s*var\(--md-date-foreground\)/);
    expect(body).not.toMatch(/color:\s*inherit/);
  });

  it('.compact-markdown-tag carries the editor\'s own badge chrome tokens alongside its existing foreground color', () => {
    const body = rule('.compact-markdown-tag');
    expect(body).toMatch(/color:\s*var\(--md-tag-foreground\)/);
    expect(body).toMatch(/background-color:\s*var\(--md-tag-surface\)/);
    expect(body).toMatch(/border-radius:\s*var\(--md-badge-radius\)/);
    expect(body).toMatch(/padding:\s*var\(--md-badge-padding\)/);
  });

  it('.compact-markdown-code uses the editor\'s own inline-code surface token, not the unrelated --surface-subtle', () => {
    const body = rule('.compact-markdown-code');
    expect(body).toMatch(/background:\s*var\(--md-inline-code-surface\)/);
    expect(body).toMatch(/color:\s*var\(--md-inline-code-foreground\)/);
    // Checks the live declaration only, not this rule's own explanatory
    // comment (which names --surface-subtle in prose, on purpose, as the
    // token this fix replaced).
    expect(body).not.toMatch(/background:\s*var\(--surface-subtle\)/);
  });

  it('never uses a CodeMirror .tok-* class as an actual selector in this stylesheet', () => {
    // Matches only real selector usage (`.tok-foo {` or `.tok-foo,`), not
    // this file's own prose comments that *mention* `.tok-code`/`.tok-link`
    // by name while explaining which token each compact rule mirrors.
    expect(css).not.toMatch(/\.tok-[a-z-]+\s*[,{]/);
  });
});
