# ADR-F003: Qualify the whole foundation before choosing technology

Status: Proposed. Requirements: P-03, P-06, P-10 through P-12, P-19, P-22, P-23.
Decisions: D-01 through D-03, D-09, D-11.

## Context

Editor, schema, canonical representation, history, external tools and storage
constrain each other. Earlier recommendations and browser spikes do not establish
native input reliability or collaborative correctness.

## Proposal

Evaluate complete combinations in the decision register. Tiptap/PM with a
Clutter-owned structured model and SQLite is a candidate, not an accepted baseline.
Keep CM6 and other viable combinations as controls. Test the exact schema and
extension composition on macOS/WKWebView. Include rich interchange, concurrency,
recovery and collaboration when evaluating the canonical format.

## Alternatives and consequences

Choosing each library independently can produce incompatible undo/merge models.
A polished prototype can hide focus and failure bugs. Evidence gates can reject
an initially preferred engine. Migration and implementation effort are documented
for planning but have zero selection weight; reliability remains substantive.

## Qualification and existing rules

T-01, T-06, T-09, T-10, T-12, T-14 and agreed T-15 budgets inform approval.
An experimental dependency patch needs reproducible controls and maintainability
review. Existing storage/editor ADRs remain in force for production meanwhile.
