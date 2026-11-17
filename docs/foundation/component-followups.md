# Component follow-ups

This ledger tracks deferred visual/component issues, separately from the confirmed
editing model and its behavioral checks. Include it in the next source delivery.

## C01 — converted paragraph must visibly retain indentation

Status: SOURCE FIXED66; MAC VISUAL CONFIRMATION PENDING. Reported after65,
17 November2026. Brought forward from stage3E because visual paragraph indentation
is needed to test shared text indentation66. No native visual pass is inferred.

Repro: indent an ordered/unordered item, put caret at start and Backspace. It becomes
a paragraph. Logical indent remains (further Backspaces outdent the expected number
of levels), but the paragraph appears unindented. Do not mark this as a passing visual
check or change list conversion/parent policy just to compensate for appearance.

Source finding: `.editor-content .ProseMirror p { margin: 0 0 12px; }` is more specific
than `.ProseMirror [data-indent] { margin-left: ...; }`. The paragraph shorthand can
therefore override the derived left margin. 66 replaces only paragraph margin-top/margin-bottom, leaving shared margin-left
authoritative. No Backspace-only inline style or second indentation state. DOM
metadata checks pass; jsdom cannot establish resolved CSS variable/calc pixels.

Acceptance: ordered AND unordered items at multiple levels become paragraphs with
that same indent visible; each subsequent Backspace visibly outdents one level.
Verify following children and marker spacing separately; saved indent/hierarchy
remain canonical attrs, not inferred from pixels. Native visual check still required.

Other pending behavior, including Ctrl+A A01–A05, lives in stage3-ux.md under its
proper3C scope. C01 does not authorize implementing it inside a CSS correction.
