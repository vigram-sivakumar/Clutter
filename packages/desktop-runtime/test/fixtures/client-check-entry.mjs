// Run the acceptance helper in its own process, as it runs from a terminal while
// the native renderer remains responsive. JSON config stays on private test stdin.
import { runClientCheck } from '../../../../tools/check-clients.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  console.log(
    JSON.stringify({ ok: true, value: await runClientCheck(JSON.parse(input)) })
  );
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
