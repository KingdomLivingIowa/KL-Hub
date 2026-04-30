// Lightweight in-memory cache shared across pages.
// TTL = 60 seconds by default. Cache busts automatically on writes.

const cache = {};
const TTL = 60 * 1000; // 60 seconds

export function getCached(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) { delete cache[key]; return null; }
  return entry.data;
}

export function setCached(key, data) {
  cache[key] = { data, ts: Date.now() };
}

export function bustCache(...keys) {
  if (keys.length === 0) { Object.keys(cache).forEach(k => delete cache[k]); return; }
  keys.forEach(k => delete cache[k]);
}