//! ADR-073 Phase 0 spike. Throwaway, experimental, not production code. See RESULTS.md.
//!
//! `atomic_replace` is the app's real atomic writer, included verbatim by path (never copied), so every
//! durability experiment exercises the same code the production store would call.
#![allow(dead_code)]

#[path = "../../../apps/app/src-tauri/src/atomic_replace.rs"]
pub mod atomic_replace;
pub mod store;

#[cfg(test)]
mod experiments;
