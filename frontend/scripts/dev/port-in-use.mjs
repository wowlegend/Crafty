/**
 * port-in-use.mjs — is anything listening on a local port?
 *
 * Both loopback addresses are probed: on macOS vite binds `localhost` to [::1] only, so an IPv4-only probe reads a
 * busy e2e port as free (scripts/dev/mutate-e2e.sh would then test a sibling's server instead of its mutant).
 */
import { createConnection } from 'node:net';

export const portInUse = async (port, hosts = ['127.0.0.1', '::1']) => {
  const one = (host) =>
    new Promise((res) => {
      const sock = createConnection({ port, host });
      sock.once('connect', () => { sock.destroy(); res(true); });
      sock.once('error', () => res(false));
    });
  return (await Promise.all(hosts.map(one))).some(Boolean);
};
