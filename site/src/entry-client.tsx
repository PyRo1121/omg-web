import { mount, StartClient } from '@solidjs/start/client';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app mount element');
}
mount(() => <StartClient />, root);
