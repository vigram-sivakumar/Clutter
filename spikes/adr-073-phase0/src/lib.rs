//! ADR-073 Phase 0 spike. Throwaway, experimental, not production code. See RESULTS.md.
//!
//! `atomic_replace` is the app's real atomic writer, included verbatim by path (never copied), so every
//! durability experiment exercises the same code the production store would call.
#![allow(dead_code)]

#[path = "../../../apps/app/src-tauri/src/atomic_replace.rs"]
pub mod atomic_replace;
pub mod model;
pub mod crash_checks;
#[path = "../../../apps/app/src-tauri/src/recovery_files.rs"]
pub mod recovery_files;
#[cfg(target_os = "macos")]
pub mod store;

#[cfg(all(test, target_os = "macos"))]
mod experiments;
