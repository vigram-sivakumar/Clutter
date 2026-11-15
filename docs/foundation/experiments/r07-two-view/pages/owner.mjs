import { startHost } from '../durable/host.mjs';
import * as model from './model.mjs';
// Space service composition only. This is the sole writer, not a second core.
await startHost({ model });
