// Seeded randomness for Puffin Air Rally. The whole archipelago — tree and
// house scatter, cloud drift — is laid out from one seed so every pilot (and
// every screenshot) sees the same islands, and a ?seed=N link can share a
// layout. mulberry32 is the generator: tiny, fast, and good enough for
// scattering pines.

/** A mulberry32 generator: call it for floats in [0, 1). */
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max) from a generator made by createRandom. */
export function range(next, min, max) {
  return min + next() * (max - min);
}

/** An integer in [min, max] inclusive. */
export function intRange(next, min, max) {
  return min + Math.floor(next() * (max - min + 1));
}

/**
 * Turns a seed word into a number: numbers pass through, anything else is
 * hashed (FNV-1a), so ?seed=north and ?seed=42 both name a layout.
 */
export function hashSeed(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isInteger(asNumber)) return asNumber;
  let hash = 0x811c9dc5;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
