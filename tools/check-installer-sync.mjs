import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Updated only when copying the reviewed canonical OMG installer. An optional
// source argument checks exact cross-repository parity during synchronization.
const expected = 'a22e3f8a6d4401678ac908514d72280efe22906c42f935e81384d48de45831d8';
const installed = await readFile(new URL('../site/static/install.sh', import.meta.url));
if (createHash('sha256').update(installed).digest('hex') !== expected) {
  throw new Error(
    'Website installer differs from the reviewed canonical snapshot; synchronize it and update this digest together.'
  );
}
if (process.argv[2]) {
  const canonical = await readFile(process.argv[2]);
  if (!installed.equals(canonical))
    throw new Error('Website installer differs from the OMG canonical source');
}
console.log('Reviewed installer snapshot verified');
