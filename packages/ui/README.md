# Shared React product UI

app.jsx owns product layout/components and injects a page-scoped EditorWorkspace.
WindowWorkspace retains page contexts through view navigation, aggregates close
protection, and presents Core catalogue results. There is no independent page/body
store, Markdown renderer, filesystem API or native feature controller in this package.
PM owns editable DOM; React owns surrounding surfaces. Browser and desktop compositions
use the same UI/client ports. See docs/architecture.md for scope and unfinished features.
