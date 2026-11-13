//! E2/E3 crash worker: commits intents in a loop and prints one line per ACKNOWLEDGED mutation. The parent kills it
//! with SIGKILL at a random instant and then validates the persisted state against the acknowledgements.
#[cfg(target_os = "macos")]
use adr073_phase0::store::*;
#[cfg(target_os = "macos")]
use std::io::Write;

#[cfg(target_os = "macos")]
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = std::path::PathBuf::from(&args[1]);
    let id = args[2].clone();
    let (store, report) = Store::open(&dir, Clock::real());
    println!("OPEN {} {}", report.adopted, store.read().rev);
    std::io::stdout().flush().unwrap();
    let mut n = 0u64;
    let mut mine: Vec<(String, String)> = vec![];
    loop {
        n += 1;
        let op = format!("{id}-{n}");
        let intent = if n % 5 == 0 && !mine.is_empty() {
            let (path, space_id) = mine.remove(0);
            Intent::Remove { path, space_id, fallback: None }
        } else {
            let path = format!("/k/{id}/{n}");
            mine.push((path.clone(), format!("id-{id}-{n}")));
            Intent::Add { path, space_id: format!("id-{id}-{n}"), claim: None }
        };
        match store.mutate(&op, intent, "worker") {
            MutResult::Committed { rev } => {
                println!("ACK {op} {rev}");
                std::io::stdout().flush().unwrap();
            }
            other => {
                println!("NOACK {op} {other:?}");
                std::io::stdout().flush().unwrap();
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("The ADR-073 crash worker requires macOS and the real atomic writer.");
    std::process::exit(2);
}
