# ADR-079 — Assets library and catalog contract reconciliation

**Status** Proposed, escalated for owner decision on 26 November 2026.

## Context

ADR-039 and architecture-specification.md §3c describe the Assets collection as the broad catalog exposed by MembershipSelector.getAllAssets(). Commit `71ba3c241` introduced getAssetLibrary(), a derived filter for local files in the Assets move zone. PageHost.assetsOfPage consumes that filter. Default note-media imports now go to Attachments/ and remain indexed for reference resolution. The stability checkpoint updates fixtures to exercise these existing paths and adds coverage proving an attachment stays indexed while excluded from the library view.

This is a pre-existing product-contract discrepancy. Passing regression tests establish implementation behaviour. They do not accept a specification amendment. The owner explicitly authorised escalation of this concern alongside publication of the verified development checkpoint.

## Decision proposed

Retain the broad catalog contract and canonical asset identities in ADR-039. Specify the existing Assets page as a derived library view over that catalog, filtered by the existing Assets move-zone rule in MembershipSelector.getAssetLibrary(). Keep the catalog available for references and existing consumers, with its current visibility and feature-flag rules. Document default note-media storage in Attachments/ separately from explicit library import destinations.

Acceptance requires the owner's explicit decision on the collection membership policy. Only after acceptance should §3c and ADR-039 be amended to distinguish the catalog API from the library UI and name the existing method signatures. This proposal grants no implementation exception and changes no frozen contract.

## Alternatives considered

- Restore PageHost to broad catalog membership and revise the existing library behaviour. This requires an explicit product decision and regression coverage for that change.
- Treat the current implementation and green tests as approval of the amended specification. Rejected because implementation-rules.md §4 requires an accepted ADR before changing the frozen specification.

## Consequences

The discrepancy remains open until this proposal is accepted or implementation is brought into compliance with the existing collection contract. Main integration and release require this decision. The development stability checkpoint records the escalation and its verification evidence without resolving policy by implication.

Vault remains authoritative for resources. AssetCatalogBuilder and MembershipSelector own derived catalog and membership queries. No stored catalog, new write path, second resource identity, new facade, or persistence bypass is proposed.

## Why the proposed approach is preferred

It makes the existing library policy reviewable while retaining the broader catalog and all ownership invariants. It confines the decision to collection membership and import destinations instead of reopening the resource or persistence architecture.
