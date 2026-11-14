# ADR-F005: Task identities and predefined collection views

Status: Proposed schema design; product behaviour confirmed 2026-11-14.
Requirements: P-25 through P-33. Decisions: D-02, D-12, D-13.

## Context

The user rejected a database-style collection schema, globally shared custom
properties, subtasks and tasks referenced from multiple notes. They require task
pages, an independent inbox, visual indentation and predefined collection fields.
Treating every page/link/block as the same freely shareable object breaks these rules.

## Proposal

Represent task identity/content and sole owning location explicitly. Derive note
placements, task-page editing and global Tasks views from the same entity. Model
standard task fields separately from entity-owned arbitrary typed properties.
Collections expose declared fields rather than infer arbitrary custom columns.

Tasks move by cut/paste with ID/history preserved and copy with new IDs. Owner
archive/delete cascades according to product-behaviour.md. No parent-task semantics
follow from indentation. Template application copies without ongoing tracking.

## Alternatives and consequences

Separate task/page bodies duplicate truth; general shared-reference blocks violate
single-note ownership; dynamic collection inference reintroduces rejected schema
questions. A task is navigable as a page without being freely referenceable from
other notes. Identity-safe moves/restores, repeat-series occurrence generation and
provider sync need explicit consistency contracts, not ad hoc UI listeners.

## Qualification and old rules

T-17 through T-20 plus T-12/T-14 cover properties, ownership, copy/move/restore,
recurrence and schema integrity. Persistence shape is not selected here. Existing
production task implementation remains untouched until the target is qualified.

## R03 draft references

[Document model](../document-model-spec.md) defines TaskState versus its sole
Placement and derives page/note/Tasks views without duplicated mutable bodies.
Its M-01–M-07 ledger keeps task-body nesting, copy/conversion, properties, historical
restore and provider coherence open. [API](../command-api-spec.md) protects logical
moves/cascades/generation as coherent effects; no physical schema is accepted here.
