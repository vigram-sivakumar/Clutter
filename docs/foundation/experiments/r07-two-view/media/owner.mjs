import { startHost } from '../durable/host.mjs';
import * as model from './model.mjs';
await startHost({ model });
