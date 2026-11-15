import { startHost } from '../durable/host.mjs';
import * as model from './model.mjs';
// Shared owner/transactions/transport. No entity reducers in interface adapters.
await startHost({ model });
