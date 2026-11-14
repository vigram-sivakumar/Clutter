# ADR-F003: Qualify the whole foundation before choosing technology

Status: Proposed. Requirements: P-03, P-06, P-10 through P-12, P-19, P-22, P-23.
Decisions: D-01 through D-03, D-09, D-11.

## Context

Editor, schema, canonical representation, history, external tools and storage
constrain each other. Earlier recommendations and browser spikes do not establish
native input reliability, task identity integrity or safe provider reconciliation.

## Proposal

Evaluate complete combinations in the decision register. Tiptap/PM with a
Clutter-owned structured model and SQLite is a candidate, not an accepted baseline.
Keep CM6 and other viable combinations as controls. Test the exact schema and
extension composition on macOS/WKWebView. Include rich interchange, concurrency,
recovery and optional provider state/history reconciliation when evaluating the
canonical format. Live cloud merge is deferred; preserve a versioned extension seam
without making a CRDT an initial prerequisite.

## Alternatives and consequences

Choosing each library independently can produce incompatible undo/merge models.
A polished prototype can hide focus and failure bugs. Evidence gates can reject
an initially preferred engine. Migration and implementation effort are documented
for planning but have zero selection weight; reliability remains substantive.

## Qualification and existing rules

T-01, T-06, T-09, T-10, T-14, T-17 through T-21 and agreed T-15 budgets inform
initial approval. T-12/T-13 gate provider enablement; T-22 is deferred cloud scope.
An experimental dependency patch needs reproducible controls and maintainability
review. Existing storage/editor ADRs remain in force for production meanwhile.

## R02 clarification

The current Markdown experience is evidence, not universal interaction acceptance.
Qualify shared reliability and Clutter semantic contracts, then evaluate declared
source/structured profiles for UX. A paragraph split need not imitate a source
newline. R02 Q-01–Q-09 remain proposals/open boundaries; catalogue creation is not
execution or technology approval. See [R02](../editor-interaction-spec.md).
