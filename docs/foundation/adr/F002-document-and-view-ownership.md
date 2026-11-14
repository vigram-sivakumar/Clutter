# ADR-F002: Documents and views have separate owners

Status: Proposed. Requirements: P-01, P-04 through P-08, P-14 through P-16.
Decisions: D-04, D-05, D-10.

## Context

Tabs, split panes and windows create views, not independent copies of a note.
One session per webview would require reconciliation among local competing models.
Selection and navigation, however, must remain independent.

## Proposal

Own shared accepted document state in the Space authority. Windows own layout,
panes own tabs, tabs own navigation and views own interaction state. An editing
context owns selective undo metadata. Keep pending work alive independently of
view count. Derived frontend replicas are revision-tagged projections.

## Alternatives and consequences

Independent window authorities require an explicit replica protocol even locally.
Shared global selection would make views interfere. Whole-editor recreation on
save destroys composition/history. The proposed split requires operation mapping,
context identity and lifecycle leases rather than independent full-document saves.

## Qualification and existing rules

T-02, T-03, T-05, T-07 and T-08 must demonstrate these boundaries. Remote provider
state replacement also needs the explicit history/IME boundary in T-12; it is not
identical to live multi-person operation merging. This differs
from the per-webview ownership described in existing ADR-073. It does not amend
that record until an approved replacement explicitly defines the implementation.
