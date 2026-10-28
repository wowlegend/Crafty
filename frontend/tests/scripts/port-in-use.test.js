import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { portInUse } from '../../scripts/dev/port-in-use.mjs';

// Real sockets, not a fake: the defect this guards was a vite on macOS listening on [::1] only, which an IPv4-only
// probe reported as a free port.
describe('portInUse — a server on EITHER loopback address is busy', () => {
  const listen = (host) =>
    new Promise((res, rej) => {
      const srv = createServer();
      srv.once('error', rej);
      srv.listen(0, host, () => res(srv));
    });
  const close = (srv) => new Promise((res) => srv.close(res));

  it('sees a server listening on 127.0.0.1 (presence control)', async () => {
    const srv = await listen('127.0.0.1');
    try { expect(await portInUse(srv.address().port)).toBe(true); } finally { await close(srv); }
  });
  it('sees a server listening on [::1] ONLY — the case the IPv4 probe missed', async () => {
    const srv = await listen('::1');
    try {
      expect(await portInUse(srv.address().port), 'a [::1]-only vite read as a free port').toBe(true);
    } finally { await close(srv); }
  });
  it('a closed port is free', async () => {
    const srv = await listen('127.0.0.1');
    const { port } = srv.address();
    await close(srv);
    expect(await portInUse(port)).toBe(false);
  });
});
