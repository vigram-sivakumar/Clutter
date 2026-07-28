# Arc 5 — Rendering Consolidation

## 1. Purpose

Rendering consolidation is necessary to reduce duplication, clarify responsibilities, and enable scalable feature development in the Clutter application. The primary goals are:

- **Eliminate unnecessary duplication** in rendering code, especially for frequently used UI elements like TopBar and Description.
- **Clarify and enforce rendering layer responsibilities** to enable maintainable and extensible UI architecture.
- **Promote behaviour-driven rendering** rather than domain-type-driven rendering.
- **Enable easier onboarding and faster iteration** by simplifying and unifying component structure.

**This phase intentionally does NOT:**

- Change underlying data models or domain logic.
- Redesign visual appearance or introduce new UI features.
- Alter routing, navigation, or state management outside of rendering concerns.
- Refactor business logic or side effect management.

## 2. Current Architecture

### Rendering Flow

The current rendering pipeline is as follows:

1. **Workspace**: The root context, provides global state and dispatch.
2. **PageHost**: Registry/dispatcher for all pages, selects and renders the appropriate page component.
3. **ViewModel Mapper**: Maps domain data to view models, sometimes with ad-hoc transformation logic.
4. **Page**: The main component for each "page" in the app, typically responsible for layout and composition.
5. **Layer 2**: Reusable compositions, such as TopBar, Description, and various wrappers.
6. **Layer 1**: Rendering primitives (buttons, text, icons, etc.).

### Layer Responsibilities

- **Workspace**: Provides context, state, and global dispatch.
- **PageHost**: Handles routing and selects which page to render.
- **ViewModel Mapper**: Adapts domain data to UI-friendly shapes.
- **Page**: Composes the page structure, arranges subcomponents.
- **Layer 2**: Provides reusable, feature-oriented UI compositions.
- **Layer 1**: Contains atomic, styleable UI primitives.

### Duplication

Duplication currently exists in:

- **TopBar**: Multiple pages define their own near-identical TopBar components.
- **Description**: Repeated logic and layout for description blocks.
- **Wrappers**: Feature-specific wrappers (e.g., for padding, error boundaries) are copy-pasted or slightly customized across pages.

### Strengths of Current Architecture

- Clear separation between domain and view models.
- Pages are self-contained, aiding discoverability.
- Primitives are generally reusable and style-consistent.

## 3. Problems Identified

- **Duplication**: Repeated TopBar, Description, and wrapper logic increases maintenance cost and risk of inconsistency.
- **Feature-Oriented Wrappers**: Wrappers are often created for a single feature or page, leading to proliferation.
- **Unnecessary Specialization**: Many components are specialized by domain type, even when behaviour is identical.
- **Hardcoded Dispatch**: PageHost and some pages use hardcoded registry/dispatch logic, making extension risky.
- **Rendering Tied to Domain Types**: Rendering is often driven by domain types instead of shared behaviours, preventing reuse.

## 4. Design Principles

- **Behaviour Over Domain Names**: Components should be specialized for behaviour, not for domain types. If two pages share behaviour, they should share components.
- **Model-Driven Rendering**: Rendering should be driven by view models, not domain types or ad-hoc logic.
- **Specialize Only for Behavioural Differences**: Only create new components when a real behavioural or presentational difference exists.
- **Composition Before Duplication**: Prefer composing existing components over duplicating logic or structure.
- **Layer Responsibilities**: Each rendering layer must have a clear, enforced responsibility. Cross-layer leakage is not permitted.

## 5. Rendering Layers

### Layer 4: PageHost

**Responsibility:** Routing and registry. Selects and renders the correct page based on application state.
**Ownership:** Single source of truth for page registration.
**Examples:** `PageHost`, route-to-page mapping.
**Must Never:** Contain layout or presentational logic. Should not know about page internals.

### Layer 3: Page Composition

**Responsibility:** Defines the structure and composition of a page. Arranges major page elements (TopBar, Body, etc.).
**Ownership:** Each page owns its own composition, but must use shared components whenever possible.
**Examples:** `ProjectPage`, `TaskPage`, `SettingsPage`.
**Must Never:** Duplicate reusable compositions or primitives. Must not contain business logic.

### Layer 2: Reusable Compositions

**Responsibility:** Feature-level, reusable UI compositions (e.g., TopBar, Description, ListSection).
**Ownership:** Shared across pages; owned by the UI library, not by any single page.
**Examples:** `TopBar`, `DescriptionBlock`, `SectionHeader`.
**Must Never:** Contain page-specific logic or state. Must not access global context directly.

### Layer 1: Rendering Primitives

**Responsibility:** Atomic, styleable UI components (e.g., Button, Text, Icon).
**Ownership:** Core UI library.
**Examples:** `Button`, `Text`, `Icon`, `Avatar`.
**Must Never:** Compose other primitives into feature-level compositions. Must not contain domain or view model logic.

## 6. Consolidation Plan

### TopBar

- **Current:** Multiple TopBar implementations with minor differences.
- **Desired:** Single, configurable TopBar composition in Layer 2, parameterized by props.
- **Migration:** Refactor all pages to use the shared TopBar. Extract common logic, add props for variations.
- **Risks:** Feature regressions if specific TopBar behaviours are missed.
- **Acceptance:** All pages use shared TopBar; no visual or functional regressions.

### Description

- **Current:** Description blocks are implemented per-page with duplicated structure.
- **Desired:** Single DescriptionBlock component in Layer 2, parameterized for content and style.
- **Migration:** Replace page-level Description implementations with shared DescriptionBlock.
- **Risks:** Loss of page-specific tweaks if not captured in props.
- **Acceptance:** All descriptions rendered via shared component; consistent appearance.

### Title

- **Current:** Title rendering logic scattered across pages.
- **Desired:** Title component in Layer 2, used by all pages.
- **Migration:** Extract and unify title logic; replace in all pages.
- **Risks:** Title-specific edge cases.
- **Acceptance:** Unified title rendering everywhere.

### Body

- **Current:** Body structure is duplicated and inconsistently composed.
- **Desired:** Shared Body composition where behaviour is common; page-specific only when necessary.
- **Migration:** Identify common Body patterns, extract; fallback to page-specific where justified.
- **Risks:** Over-generalization may hinder flexibility.
- **Acceptance:** Shared Body used wherever possible; justified exceptions.

### PageHost Registry

- **Current:** Hardcoded mapping and registration.
- **Desired:** Declarative, data-driven page registry.
- **Migration:** Move to config-driven registry; remove inline logic.
- **Risks:** Registry errors affecting routing.
- **Acceptance:** All pages registered via config; no routing regressions.

## 7. Rules For Creating Components

- **When should a new Page component exist?**
  - Only when a new route or major navigation context is introduced.
  - Example: `ProjectPage` for `/projects/:id`.

- **When should a new TopBar exist?**
  - Only if a page requires TopBar behaviour not supported by the shared component.
  - Example: A TopBar with unique interaction or layout.

- **When should a new Body exist?**
  - When the main content area is structurally or behaviourally different from all existing bodies.
  - Example: A dashboard with a grid instead of a list.

- **When should a new Title exist?**
  - Only if the title has behaviour or presentation not supported by the shared Title component.
  - Example: Title with inline editing vs. static text.

- **When should a wrapper never be created?**
  - Never create a wrapper solely to pass through props or add padding/margins that can be handled via composition or styling.
  - Example: Don’t create `ProjectPageWrapper` if it only adds padding — use layout composition instead.

## 8. Validation

### Manual Validation

- Verify all pages render correctly with shared components.
- Compare visual and interactive behaviour before and after consolidation.
- Test edge cases for all shared components.

### Architectural Validation

- Review codebase for duplicate TopBar, Description, Title, and Body implementations.
- Confirm all pages are registered via the declarative registry.
- Ensure all shared components are used in accordance with rules above.

## 9. Definition of Done

- All duplicated TopBar, Description, Title, and Body logic is removed.
- All pages use shared components where behaviour is common.
- PageHost uses declarative registry; no hardcoded mappings remain.
- Rendering code is organized by layer, with clear separation of responsibilities.
- All acceptance criteria in the consolidation plan are met.
- Manual and architectural validation passes without regressions.
- Documentation is updated to reflect new rendering architecture and rules.
