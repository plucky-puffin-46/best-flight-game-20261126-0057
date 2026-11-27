// The screenshot scenes behind ?shot=cover|cockpit|approach|title. Each one
// poses the real flight state — a banked dive at the third ring, the
// pilot's own view of Mount Puffin, a final approach with the course
// complete — and lets the ordinary renderers paint it, so a screenshot is
// the game exactly as a player sees it, never a mock-up.

import { RINGS, RUNWAY } from './config.js';
import { PHASE_FLYING } from './flight.js';

/** Puts the plane `dist` metres out from a ring, flying at it. */
function approachRing(f, index, dist, altitude, roll, speed) {
  const ring = RINGS[index];
  const fx = Math.sin(ring.heading);
  const fz = -Math.cos(ring.heading);
  f.pos.x = ring.x - fx * dist;
  f.pos.y = altitude;
  f.pos.z = ring.z - fz * dist;
  f.heading = ring.heading;
  f.roll = roll;
  f.speed = speed;
}

/** Common airborne state for the staged scenes. */
function airborne(f, ringsPassed, time, fuel) {
  f.phase = PHASE_FLYING;
  f.onGround = false;
  f.started = true;
  f.ringsPassed = ringsPassed;
  f.time = time;
  f.fuel = fuel;
  f.throttle = 0.78;
  f.propSpin = 2.2;
}

/**
 * Stages the named scene on flight `f` and returns the view and screen the
 * renderers should use. Unknown names stage the cover.
 */
export function stageShot(name, f) {
  if (name === 'cockpit') {
    airborne(f, 4, 96.4, 64);
    // Closer to the ring and well below it, nose a touch down, so the
    // ring hangs whole in the open windscreen above the compass tape
    // instead of hiding behind the panel, with snowy Mount Puffin
    // beyond and the sea at the frame's edge.
    approachRing(f, 4, 175, RINGS[4].y - 28, 0.12, 48);
    f.pitch = -0.04;
    return { view: 'cockpit', screen: 'play' };
  }
  if (name === 'approach') {
    airborne(f, RINGS.length, 171.8, 41);
    f.pos.x = RUNWAY.centreX - RUNWAY.length / 2 - 265;
    f.pos.y = RUNWAY.height + 54;
    f.pos.z = RUNWAY.centreZ + 4;
    f.heading = RUNWAY.heading;
    f.pitch = -0.085;
    f.roll = 0.02;
    f.speed = 30;
    f.throttle = 0.34;
    f.message = 'All rings! Final — land on the runway.';
    f.messageT = 999;
    // A rear-quarter camera: the flank and cheatline show on final
    // instead of a plain view of the tail.
    return { view: 'chase', screen: 'play', cam: { right: 6, back: 14.5, up: 3.4, ahead: 30, lat: 0 } };
  }
  if (name === 'title') {
    // The camera rides off the attract plane's flank and the look-at
    // point shifts left, so the plane sits clear of the title panel
    // instead of passing behind it.
    return { view: 'chase', screen: 'title', cam: { right: 12, back: 17, up: 10.5, ahead: 20, lat: -26 } };
  }
  if (name === 'end') {
    // The roll-out: parked on the strip, the rally complete, panel showing.
    airborne(f, RINGS.length, 203.5, 36);
    f.phase = 'done';
    f.finished = true;
    f.onGround = true;
    f.pos.x = RUNWAY.centreX + 40;
    f.pos.y = RUNWAY.height + 1.55;
    f.pos.z = RUNWAY.centreZ;
    f.heading = RUNWAY.heading;
    f.pitch = 0;
    f.roll = 0;
    f.speed = 0;
    f.throttle = 0;
    f.landingScore = 262;
    f.score = 800 + 262 + 146;
    return { view: 'cockpit', screen: 'done' };
  }
  // cover: banked toward the third ring over the northern shore, shot
  // from the sunlit flank — canopy, cheatline and orange nose in profile,
  // the ring and the island ahead of her.
  airborne(f, 2, 47.3, 78);
  approachRing(f, 2, 175, RINGS[2].y + 12, 0.38, 46);
  f.pitch = -0.07;
  return { view: 'chase', screen: 'play', cam: { right: 15, back: 8, up: 3.6, ahead: 11, lat: 0 } };
}
