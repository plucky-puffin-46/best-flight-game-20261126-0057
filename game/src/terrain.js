// The Puffin archipelago: an analytic height field, so the ground the
// renderer draws and the ground the flight model collides with are the same
// ground by construction. Each island is a smooth dome; the runway sits on a
// plateau blended flat into the main island. heightAt is the one source of
// truth — the terrain mesh samples it, the physics asks it, the scatter of
// trees and houses is planted by it.

import { RUNWAY, SEA_LEVEL } from './config.js';
import { clamp, lerp } from './math.js';
import { createRandom, range } from './random.js';

/** The islands: centre, radius and peak height, metres. */
export const ISLANDS = [
  { x: 0, z: 150, radius: 860, peak: 96 },       // the main island, with the runway
  { x: -1080, z: -880, radius: 540, peak: 335 }, // Mount Puffin, the snowy one
  { x: 1180, z: -680, radius: 450, peak: 92 },
  { x: 980, z: 980, radius: 400, peak: 68 },
  { x: -980, z: 830, radius: 350, peak: 54 },
  { x: 180, z: -1500, radius: 270, peak: 38 },
  { x: 1560, z: 260, radius: 240, peak: 30 },
];

/** One island's contribution at a point: a dome that meets the sea at its rim. */
function islandHeight(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.hypot(dx, dz);
  // Outside the rim the island contributes the sea floor itself, so the
  // max() in heightAt leaves open water at -14, never at sea level.
  if (d >= island.radius) return -14;
  const s = 1 - d / island.radius;
  // A profile with a broad top and a beach at the rim: s^1.35, eased.
  const shaped = Math.pow(s, 1.35);
  return island.peak * shaped * (0.82 + 0.18 * Math.cos(d * 0.011 + island.x));
}

/** Distance from a point to the runway rectangle (0 when over the strip). */
export function runwayDistance(x, z) {
  const halfL = RUNWAY.length / 2;
  const halfW = RUNWAY.width / 2;
  const dx = Math.max(Math.abs(x - RUNWAY.centreX) - halfL, 0);
  const dz = Math.max(Math.abs(z - RUNWAY.centreZ) - halfW, 0);
  return Math.hypot(dx, dz);
}

/** True when the point is over the paved strip itself. */
export function overRunway(x, z) {
  return Math.abs(x - RUNWAY.centreX) <= RUNWAY.length / 2
    && Math.abs(z - RUNWAY.centreZ) <= RUNWAY.width / 2;
}

/**
 * Ground height at a world point, metres above the sea. Under water it keeps
 * falling to a sea floor, so a ditched plane settles below the surface.
 */
export function heightAt(x, z) {
  let h = -14;
  for (let i = 0; i < ISLANDS.length; i += 1) {
    const v = islandHeight(ISLANDS[i], x, z);
    if (v > h) h = v;
  }
  // Gentle rolling detail away from the shore, so meadows are not billiards.
  // Kept low and long-waved: taller, shorter detail made every terrain
  // quad's two triangles tilt apart and the fields read as a chequerboard.
  if (h > 2) {
    h += Math.sin(x * 0.009) * Math.cos(z * 0.011) * 0.9;
  }
  // The runway plateau: blend to the strip's height near the strip.
  const d = runwayDistance(x, z);
  if (d < 300) {
    const t = clamp((d - 55) / 245, 0, 1);
    const blend = t * t * (3 - 2 * t);
    h = lerp(RUNWAY.height, h, blend);
  }
  return h;
}

/** The sea floor counts as water for flying purposes: height below sea level. */
export function isWater(x, z) {
  return heightAt(x, z) < SEA_LEVEL + 0.4;
}

/** Slope of the ground at a point, as a 0..1 steepness, for colouring. */
export function slopeAt(x, z) {
  const e = 6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return clamp(Math.hypot(dx, dz) / (2 * e) * 2.4, 0, 1);
}

/**
 * Plants the archipelago: pine trees on the slopes, a few houses on the flat
 * near the shore, and the lighthouse on the north islet. Positions come from
 * the seeded generator, so the layout is the same on every visit.
 */
export function scatterWorld(seed) {
  const next = createRandom(seed);
  const trees = [];
  const houses = [];
  let guard = 0;
  while (trees.length < 340 && guard < 6000) {
    guard += 1;
    const x = range(next, -2100, 2100);
    const z = range(next, -2100, 2100);
    const h = heightAt(x, z);
    if (h < 4 || h > 250) continue;
    if (slopeAt(x, z) > 0.62) continue;
    if (runwayDistance(x, z) < 60) continue;
    // Mostly pines; every third tree or so is a round-topped oak.
    trees.push({ x, z, y: h, s: range(next, 0.75, 1.5), lean: range(next, -0.05, 0.05), kind: next() < 0.32 ? 1 : 0 });
  }
  guard = 0;
  while (houses.length < 26 && guard < 4000) {
    guard += 1;
    const island = ISLANDS[Math.floor(next() * 3)];
    const x = island.x + range(next, -0.55, 0.55) * island.radius;
    const z = island.z + range(next, -0.55, 0.55) * island.radius;
    const h = heightAt(x, z);
    if (h < 3 || h > 34) continue;
    if (slopeAt(x, z) > 0.3) continue;
    if (runwayDistance(x, z) < 90) continue;
    houses.push({
      x, z, y: h,
      rot: range(next, 0, Math.PI * 2),
      w: range(next, 9, 15),
      d: range(next, 8, 12),
      h: range(next, 4.5, 7),
      hue: Math.floor(next() * 5),
    });
  }
  return { trees, houses };
}
