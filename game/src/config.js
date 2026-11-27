// Every tunable number of Puffin Air Rally in one place: the world, the
// little orange plane, the ring course and the scoring. Flight, terrain,
// rendering and the HUD all read from here so the game stays in balance when
// one number moves.

/** Fixed step of the flight model, seconds. The loop never steps coarser. */
export const STEP = 1 / 120;

/** Sea level, metres. Terrain below this is beach and then water. */
export const SEA_LEVEL = 0;

/** The world is a square of this half-size; beyond it is open ocean. */
export const WORLD_HALF = 2600;

/** Where the rally happens: the seed the scatter of trees and houses uses. */
export const DEFAULT_SEED = 20261126;

/** The runway: a flat strip on the main island, along the X axis. */
export const RUNWAY = {
  // Centre of the strip, metres from the world origin.
  centreX: 0,
  centreZ: 330,
  // Full length and width of the paved strip.
  length: 380,
  width: 30,
  // The plateau the strip sits on: terrain is blended flat to this height.
  height: 26,
  // Take-off and landing run east: heading PI/2 (0 is north, clockwise).
  heading: Math.PI / 2,
};

/** The plane: a small high-wing prop trainer, "Puffin One". */
export const PLANE = {
  // Throttle response and top speed, m/s.
  maxThrust: 15.5,
  dragK: 0.055,
  topSpeed: 80,
  // Below this airspeed the wing stops holding the nose up.
  stallSpeed: 24,
  // Take-off rotation speed and the fastest a landing may touch at.
  rotateSpeed: 27,
  maxTouchSpeed: 42,
  // A touchdown softer than this vertical speed, m/s, is a greaser.
  softTouchSpeed: 1.6,
  hardTouchSpeed: 4.6,
  // Control authority.
  pitchRate: 0.95,
  maxPitchUp: 0.5,
  maxPitchDown: -0.62,
  rollRate: 1.9,
  maxRoll: 1.05,
  // Fuel: units burned a second at full throttle; the tank's size.
  fuelBurn: 0.34,
  fuelTank: 100,
  // The plane's collision point sits this far above its origin (the gear).
  gearHeight: 1.55,
};

/** The course: fly the rings in order, then land back on the runway. */
export const RINGS = [
  // x, y (altitude), z, and the heading you fly through the ring on.
  { x: 420, y: 74, z: 60, heading: Math.PI / 2 },
  { x: 760, y: 105, z: -420, heading: Math.PI * 0.78 },
  { x: 330, y: 130, z: -980, heading: Math.PI * 1.05 },
  { x: -420, y: 165, z: -1080, heading: Math.PI * 1.45 },
  { x: -1020, y: 210, z: -560, heading: Math.PI * 1.75 },
  { x: -880, y: 120, z: 240, heading: Math.PI * 0.15 },
  { x: -350, y: 84, z: 620, heading: Math.PI * 0.42 },
  { x: 210, y: 66, z: 480, heading: Math.PI / 2 },
];

/** A ring's hole, metres: cross inside this radius and it counts. */
export const RING_RADIUS = 17;

/** Scoring: what a clean rally is worth. */
export const SCORE = {
  perRing: 100,
  // Landing quality: a soft, centred, aligned touchdown earns up to this.
  landingMax: 300,
  // Time bonus: this many points a second under par, down to zero.
  parSeconds: 240,
  perSecondUnderPar: 4,
};

/** Colours of the world, shared by the 3D view and the cockpit glass. */
export const PALETTE = {
  skyTop: [0.16, 0.38, 0.72],
  skyHorizon: [0.78, 0.88, 0.98],
  fog: [0.74, 0.84, 0.95],
  sea: [0.07, 0.32, 0.52],
  seaDeep: [0.03, 0.2, 0.4],
  // The shallows over a sandy floor, seen through the translucent sea.
  seaShallow: [0.35, 0.68, 0.66],
  sand: [0.93, 0.85, 0.6],
  grass: [0.36, 0.62, 0.3],
  meadow: [0.55, 0.74, 0.35],
  forest: [0.16, 0.42, 0.22],
  rock: [0.48, 0.44, 0.42],
  snow: [0.96, 0.97, 0.99],
  cloud: [0.99, 0.99, 1.0],
  // The shaded underside of a cloud puff, a blue-grey against the white.
  cloudShade: [0.87, 0.91, 0.98],
};
