/**
 * The injected note-embed resolution contract — mirrors `ResolveWikiLink`'s
 * shape (same `resolved`/`ambiguous`/`unresolved` states, same alias
 * fallback semantics) rather than inventing a second target-resolution
 * vocabulary, since a note embed (`![[Some Note]]`) targets exactly the
 * same kind of reference a WikiLink does. `markdown` is the resolved
 * page's (or page section's) *effective* content (session-wins-over-
 * committed, via `EffectivePageState` — ADR-020's existing precedence,
 * reused unchanged, never a second draft-vs-committed resolution
 * mechanism) — composed in the app layer (`resolvePageEmbed.ts`), never
 * resolved by the renderer itself, which never imports
 * `Vault`/`EffectivePageState`.
 *
 * `'resolved'` covers both a whole-note embed (`![[Page]]`) and a
 * heading-target embed (`![[Page#Heading]]`) identically — `markdown` is
 * either the whole page's content or just the matched heading's section,
 * but the renderer never needs to know which: it renders `markdown`
 * either way, per this feature's own settled contract ("the renderer
 * should not care whether its markdown came from a whole page or a
 * heading section"). `'unresolved-heading'` is the one heading-specific
 * outcome — the page resolved, but no heading in it matched the target
 * text — distinguished from `'unresolved'` (the page itself didn't
 * resolve) so the broken-embed state can say which failed.
 *
 * `icon`/`emoji` mirror `AppIcon.tsx`'s own prop pair exactly
 * (`shared/icon/AppIcon.tsx`) — reused as plain data, not a new icon
 * vocabulary: `icon` is the resolved page's own canonical default
 * (`getPageIcon(page.type, isToday(...))`, `core/presentation/
 * getPageIcon.ts` — the single source of truth every other page
 * representation in the app already goes through, so a daily note's own
 * embed defaults to its calendar icon, not the plain note glyph, exactly
 * like the sidebar/breadcrumb/etc. already do); `emoji` is the page's own
 * assigned emoji (`Page.metadata.icon`, via `EffectivePage.icon` — the
 * same session-wins-over-committed source `markdown`/`title` already
 * read), `null` when none is assigned. `AppIcon.tsx`'s own rule — `emoji`
 * wins when present, `icon` is the fallback — is the renderer's to apply,
 * not this type's; see `NoteEmbedWidget.ts`'s own doc comment for how it
 * renders that rule in a raw-DOM (non-React) context.
 */
export type PageEmbedResolution =
  | {
      readonly status: 'resolved';
      readonly pageId: string;
      readonly title: string;
      readonly markdown: string;
      readonly icon: 'note' | 'calendarNote' | 'calendarDot' | 'template';
      readonly emoji: string | null;
    }
  | { readonly status: 'ambiguous'; readonly displayLabel: string }
  | { readonly status: 'unresolved'; readonly displayLabel: string }
  | { readonly status: 'unresolved-heading'; readonly pageId: string; readonly displayLabel: string };

export type ResolvePageEmbed = (path: string) => PageEmbedResolution;
