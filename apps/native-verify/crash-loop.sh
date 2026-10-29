#!/bin/bash
# Stage 2b-ii/iii: kill the application with SIGKILL at random moments in the middle of atomic replacements of a 1 MB
# file, many times, and check after every kill that the file is one whole generation (never torn or short). Leftover
# `.clutter-tmp.*` files are expected after a kill (a later stage sweeps them); the destination must still be whole.
set -euo pipefail
ITERATIONS="${1:-30}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/target/debug/native-verify"
DIR="$HOME/clutter-native-crash-loop"
rm -rf "$DIR"
mkdir -p "$DIR"
trap 'rm -rf "$DIR"' EXIT
python3 - "$BIN" "$DIR" "$ITERATIONS" <<'PY'
import os, random, signal, subprocess, sys, time
binary, directory, iterations = sys.argv[1], sys.argv[2], int(sys.argv[3])
note = os.path.join(directory, "note.md")
whole = torn = 0
kills_during_write = 0
for i in range(iterations):
    child = subprocess.Popen([binary], env={**os.environ, "VF_HAMMER": directory}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(random.uniform(1.2, 2.4))  # the window is up and replacing
    temps_before = [n for n in os.listdir(directory) if n.startswith(".clutter-tmp.")]
    time.sleep(random.uniform(0.0, 0.3))
    child.send_signal(signal.SIGKILL)
    child.wait()
    data = open(note, "rb").read() if os.path.exists(note) else b""
    ok = len(data) == 1_000_000 and len(set(data)) == 1
    temps = [n for n in os.listdir(directory) if n.startswith(".clutter-tmp.")]
    if temps:
        kills_during_write += 1
    whole += ok
    torn += not ok
    print(f"{i:02d} {'whole' if ok else 'TORN'} len={len(data)} generations={len(set(data))} leftover_temps={len(temps)}")
    for name in temps:  # a crash leftover is not a failure; keep the directory tidy between rounds
        os.remove(os.path.join(directory, name))
print(f"crash-loop: {whole} whole, {torn} torn, {kills_during_write} kills landed with a replacement in flight")
sys.exit(1 if torn else 0)
PY
