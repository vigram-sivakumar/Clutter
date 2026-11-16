# One Core, one running Space service

Revision0.48, 2026-11-15. Clarifies confirmed ownership constraints; it does not
select a native host or accept unqualified implementation gates.

## What “authority” means

The Space service is the **running Core application service composed with its
engine, Vault adapter and platform ports**. It is not a second core or a separate
business-policy layer. “Authority” and “owner” in historical proofs name that same
component. New diagrams should use Space service and avoid drawing both as peers.

| Name | Responsibility | Not another owner of |
| --- | --- | --- |
| Core | The single implementation of semantic rules/handlers and commit planning | An independent database or parallel per-interface document model |
| Space service | Runs that Core instance, serializes requests and owns its lifecycle/commits | Another copy of task/property/restore rules |
| Vault adapter | Executes the one guarded storage transaction and durable outcome; file ports perform mechanisms | A second application mutation policy or task engine |
| Desktop/editor | Intent input, provisional edits and local focus/cursor/scroll/navigation | Accepted persisted page state |
| CLI and MCP | Parse/frame requests; call shared API client; return structured results | Alternative file/SQL writers or duplicate handlers |

There is one authoritative writer per Space, not one writer per interface/window.
Different Spaces can have separate service instances. Several clients and provisional
editing replicas do not create more accepted writers. A committed root is truth;
live caches/projections must reconcile to it. Historical versions/protected drafts
are intentional retained states, not independently editable current bodies.

## UI, CLI and MCP are peers

All three call the same versioned Core/Space API and the same handler catalogue.
The UI does not invoke shell commands through the CLI. MCP does not need to invoke
the CLI. A common launcher/client library may discover/start the service; that is
a lifecycle mechanism, not CLI argument parsing or a second business implementation.

Native file pickers/grants/publication carry capabilities/bytes through ports;
they cannot save page bodies behind the Core. SQL uniqueness and file/hash checks
defend integrity at the commit boundary; they do not authorize another policy owner.
There must be no fallback “write the Markdown/DB directly if service unavailable.”

The service is local and can start on demand without a desktop window. This does
not require a cloud server or permanently running daemon. Installed discovery,
OS peer identity, grants, alias fencing and idle shutdown still need their gates.

## Task pages and views

A task owns one canonical page body/title/properties/cover/associations. A note's
owned task slot and All Tasks resolve it by ID. Opening more views never copies
the task. Tasks are intended to support full page content and supported embeds;
the experiment's minimal body schema is not the final feature boundary. No subtasks
or extra active task placements are introduced.

Window layout persistence stores destinations/layout only; unsaved content must
be committed or protected by the Space service. Undo context lifetime differs
from view lifetime and retained history. The per-page proof24 is headless storage
evidence; actual per-page editor/context binding must still be tested in I1.

## Integration authorization — P-36 confirmation

User confirms one connection per integration/local user-device, default access to
all current and future local Spaces; optional restrictions only in advanced settings.
No separate Space access codes/prompts. See product-contracts P-36 and
local-security-api-spec for the normative UX/security boundary. This does not merge
Space data/writers: each Space keeps its own single service, IDs and commit history.
Internal Space-bound transport handles are generated without repeated user setup.
