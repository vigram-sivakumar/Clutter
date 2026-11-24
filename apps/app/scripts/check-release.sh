#!/bin/bash
# Fast structural checks plus the real frontend/native permission and IPC regressions.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
for FILE in "$HERE"/*.sh; do bash -n "$FILE"; done
python3 -I - "$HERE" <<'PY'
import ast, pathlib, sys
for path in pathlib.Path(sys.argv[1]).glob('*.py'):
    ast.parse(path.read_text(), filename=str(path))
# Check embedded Python too; bash -n alone does not parse heredoc contents.
for path in pathlib.Path(sys.argv[1]).glob('*.sh'):
    lines = path.read_text().splitlines()
    start = None
    for i, line in enumerate(lines):
        if start is not None:
            if line == 'PY':
                ast.parse('\n'.join(lines[start:i]), filename=str(path))
                start = None
        elif "<<'PY'" in line:
            start = i + 1
    if start is not None: raise SystemExit(f'Unclosed Python heredoc: {path}')
print('Release shell and Python syntax passed')
PY
npm run check:version
VITE_CLUTTER_SPARKLE_UPDATES=1 npm run build
cargo test --manifest-path src-tauri/Cargo.toml --test command_permissions
cargo test --manifest-path src-tauri/Cargo.toml --lib sparkle_update::tests
(cd "$HERE/../../../workers/updates" && npm run typecheck)
echo 'Release structural and focused checks passed; native universal and delta installation require the separate runtime tests.'
