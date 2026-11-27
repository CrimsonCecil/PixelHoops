// Short-lived TURN credentials for coturn (use-auth-secret / REST API scheme).
//   username   = "<unix-expiry>:<random>"
//   credential = base64( HMAC-SHA1(static-auth-secret, username) )
// The browser never sees the long-term secret; stolen credentials expire after TTL.
// `host` may list several coturn boxes ("1.2.3.4,turn.example.com") that share the secret: one iceServers entry each,
// preferred box first. Only the first one is also offered as STUN, to keep the browser's server list short.
import { createHmac, randomBytes } from 'node:crypto';

export function makeTurnHandler({ secret, host, port = 3478, tlsPort = 0, ttl = 6 * 3600, rate = 30 }) {
  const hosts = String(host || '').split(',').map((s) => s.trim()).filter(Boolean);
  const hits = new Map(); // ip -> [windowStart, count]
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v[0] > 60000) hits.delete(k); }, 60000).unref();

  return function turn(ip) {
    if (!secret || !hosts.length) return { status: 404, body: { error: 'turn disabled' } };
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h[0] > 60000) hits.set(ip, [now, 1]);
    else if (++h[1] > rate) return { status: 429, body: { error: 'too many requests' } };

    const username = Math.floor(now / 1000) + ttl + ':' + randomBytes(6).toString('hex');
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    const iceServers = hosts.map((h, i) => {
      const urls = [`turn:${h}:${port}?transport=udp`, `turn:${h}:${port}?transport=tcp`];
      if (i === 0) urls.unshift(`stun:${h}:${port}`);
      if (tlsPort) urls.push(`turns:${h}:${tlsPort}?transport=tcp`);
      return { urls, username, credential };
    });
    return { status: 200, body: { iceServers, ttl } };
  };
}
