// The manifest again, from the ESM side of the fence: main writes settings before the server
// starts, and the guest requires the same files as CommonJS. Two lines of bridge, so there is
// still only ONE list of seams to keep.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default require('./manifest.cjs');
