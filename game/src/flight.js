// The flight model and the rally itself: Puffin One's state, the arcade
// physics a keyboard pilot flies by (throttle, pitch, banked turns, a wing
// that stalls), the ring course scored in order, and the landing judgement
// at the end. Pure state and numbers — no drawing, no DOM — so the same
// step() drives the game, the title-screen attract flight and the staged
// screenshot scenes.

import { PLANE, RING_RADIUS, RINGS, RUNWAY, SCORE } from './config.js';
import { angleDelta, clamp, lerp, vec3, wrapAngle } from './math.js';
import { heightAt, overRunway } from './terrain.js';

export const PHASE_READY = 'ready';     // on the runway, engine idling
export const PHASE_FLYING = 'flying';   // airborne, or rolling with intent
export const PHASE_CRASHED = 'crashed'; // in the trees or the sea
export const PHASE_DONE = 'done';       // landed after the last ring

/** A fresh plane on the runway's west end, facing east, tanks full. */
export function createFlight() {
  return {
    phase: PHASE_READY,
    pos: vec3(RUNWAY.centreX - RUNWAY.length / 2 + 24, RUNWAY.height + PLANE.gearHeight, RUNWAY.centreZ),
    heading: RUNWAY.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    vy: 0,
    throttle: 0,
    onGround: true,
    stalled: false,
    fuel: PLANE.fuelTank,
    engineOut: false,
    ringsPassed: 0,
    ringTimes: [],
    time: 0,
    started: false,
    finished: false,
    score: 0,
    landingScore: 0,
    crashReason: '',
    message: '',
    messageT: 0,
    propSpin: 0,
    // Juice timers, 1 at the moment of the event and decaying to 0: the
    // renderer reads them for the ring burst and the touchdown shake.
    ringFx: 0,
    touchFx: 0,
    // Previous position relative to the current ring, for crossing tests.
    prevRingSide: 0,
  };
}

/** The plane's forward unit vector at its current attitude. */
export function forwardVector(f) {
  const cp = Math.cos(f.pitch);
  return vec3(Math.sin(f.heading) * cp, Math.sin(f.pitch), -Math.cos(f.heading) * cp);
}

/** Altitude above the sea, and height above the ground right below. */
export function altitude(f) {
  return f.pos.y - PLANE.gearHeight;
}

export function heightAboveGround(f) {
  return f.pos.y - PLANE.gearHeight - Math.max(heightAt(f.pos.x, f.pos.z), 0);
}

/** Compass heading in degrees, 0-359, for the HUD. */
export function headingDegrees(f) {
  return Math.round(wrapAngle(f.heading) * 180 / Math.PI) % 360;
}

/** The ring the pilot must fly next, or null when the course is complete. */
export function nextRing(f) {
  return f.ringsPassed < RINGS.length ? RINGS[f.ringsPassed] : null;
}

function setMessage(f, text, seconds = 3) {
  f.message = text;
  f.messageT = seconds;
}

function crash(f, reason) {
  f.phase = PHASE_CRASHED;
  f.crashReason = reason;
  f.throttle = 0;
}

/** Judges a touchdown: alignment, sink and speed decide crash or roll-out. */
function touchdown(f, groundY) {
  const align = Math.abs(angleDelta(f.heading, RUNWAY.heading));
  const alignOpposite = Math.abs(angleDelta(f.heading, RUNWAY.heading + Math.PI));
  const aligned = Math.min(align, alignOpposite) < 0.42;
  const sink = -f.vy;
  if (!overRunway(f.pos.x, f.pos.z) || !aligned || sink > PLANE.hardTouchSpeed || f.speed > PLANE.maxTouchSpeed) {
    if (!overRunway(f.pos.x, f.pos.z)) crash(f, 'Down in the field — the rally ends off the runway.');
    else if (!aligned) crash(f, 'Sideways on the runway — the gear folds.');
    else if (sink > PLANE.hardTouchSpeed) crash(f, 'That arrival bent the aeroplane.');
    else crash(f, 'Far too fast to stop — off the far end.');
    return;
  }
  f.pos.y = groundY + PLANE.gearHeight;
  f.onGround = true;
  f.pitch = 0;
  f.roll = 0;
  f.vy = 0;
  f.touchFx = 1;
  if (f.ringsPassed >= RINGS.length && !f.finished) {
    f.finished = true;
    f.phase = PHASE_DONE;
    const softness = clamp(1 - sink / PLANE.hardTouchSpeed, 0, 1);
    const centred = clamp(1 - Math.abs(f.pos.z - RUNWAY.centreZ) / (RUNWAY.width / 2), 0, 1);
    const alignment = clamp(1 - Math.min(align, alignOpposite) / 0.42, 0, 1);
    f.landingScore = Math.round(SCORE.landingMax * (0.5 * softness + 0.25 * centred + 0.25 * alignment));
    const timeBonus = Math.max(0, Math.round((SCORE.parSeconds - f.time) * SCORE.perSecondUnderPar));
    f.score = f.ringsPassed * SCORE.perRing + f.landingScore + timeBonus;
    setMessage(f, 'Rally complete!', 10);
  } else {
    setMessage(f, 'Down safely. Throttle up to go again.', 3);
  }
}

/**
 * Advances the rally by dt. input: { pitch: -1..1 (positive = climb),
 * roll: -1..1 (positive = bank right), throttleDelta: -1..1 a second }.
 * Returns event flags for the sound and the HUD: { ring, crash, touchdown }.
 */
export function stepFlight(f, input, dt) {
  const events = { ring: false, crash: false, touchdown: false };
  if (f.phase === PHASE_CRASHED || f.phase === PHASE_DONE) {
    f.propSpin += f.throttle * dt * 40;
    return events;
  }
  if (f.messageT > 0) f.messageT -= dt;
  if (f.ringFx > 0) f.ringFx = Math.max(0, f.ringFx - dt * 1.1);
  if (f.touchFx > 0) f.touchFx = Math.max(0, f.touchFx - dt * 1.6);

  // Throttle and fuel.
  f.throttle = clamp(f.throttle + input.throttleDelta * dt * 0.9, 0, 1);
  if (f.fuel <= 0) {
    f.engineOut = true;
    f.throttle = 0;
  } else if (f.started) {
    f.fuel = Math.max(0, f.fuel - PLANE.fuelBurn * (0.25 + f.throttle) * dt);
  }
  const power = f.engineOut ? 0 : f.throttle;

  if (f.started && !f.finished) f.time += dt;

  const groundHere = heightAt(f.pos.x, f.pos.z);
  const groundY = Math.max(groundHere, 0);

  if (f.onGround) {
    // Rolling: thrust against drag and a whisper of brakes below idle.
    const accel = power * PLANE.maxThrust - f.speed * PLANE.dragK * 2.2 - (power < 0.05 ? 2.4 : 0);
    f.speed = Math.max(0, f.speed + accel * dt);
    const fwd = forwardVector({ heading: f.heading, pitch: 0 });
    f.pos.x += fwd.x * f.speed * dt;
    f.pos.z += fwd.z * f.speed * dt;
    f.pos.y = Math.max(heightAt(f.pos.x, f.pos.z), 0) + PLANE.gearHeight;
    // Taxi steering: roll right, turn right, at walking pace only.
    if (f.speed < 12) f.heading = wrapAngle(f.heading + input.roll * dt * 0.35);
    // Rotation: enough speed and a pull, and she lifts.
    if (f.speed >= PLANE.rotateSpeed && input.pitch > 0.25 && overRunway(f.pos.x, f.pos.z)) {
      f.onGround = false;
      f.phase = PHASE_FLYING;
      if (!f.started) {
        f.started = true;
        setMessage(f, 'Away! Follow the arrow to ring 1.', 3.5);
      }
    } else if (!overRunway(f.pos.x, f.pos.z) && f.speed > 8) {
      crash(f, 'Into the rough at speed — the rally ends in the grass.');
      events.crash = true;
    }
    f.propSpin += (2 + power * 46) * dt;
    return events;
  }

  // Airborne. Pitch and roll answer the stick; roll turns the nose.
  const pitchTarget = input.pitch * (input.pitch > 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
  f.pitch += clamp(pitchTarget - f.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  const rollTarget = input.roll * PLANE.maxRoll;
  f.roll += clamp(rollTarget - f.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  const turnRate = clamp(9.81 * Math.tan(f.roll) / Math.max(f.speed, 16), -0.85, 0.85);
  f.heading = wrapAngle(f.heading + turnRate * dt);

  // Speed: thrust, drag, and the hill of gravity along the flight path.
  const accel = power * PLANE.maxThrust - PLANE.dragK * f.speed - 9.4 * Math.sin(f.pitch);
  f.speed = clamp(f.speed + accel * dt, 0, PLANE.topSpeed + 12);

  // The wing: below the stall the nose drops and the sink builds.
  f.stalled = f.speed < PLANE.stallSpeed;
  let vy = f.speed * Math.sin(f.pitch);
  if (f.stalled) {
    vy -= (PLANE.stallSpeed - f.speed) * 0.5;
    f.pitch = Math.max(f.pitch - 0.22 * dt, -0.5);
  }
  f.vy = vy;

  const fwd = forwardVector(f);
  const vh = f.speed * Math.cos(f.pitch);
  f.pos.x += Math.sin(f.heading) * vh * dt;
  f.pos.z += -Math.cos(f.heading) * vh * dt;
  f.pos.y += vy * dt;
  f.propSpin += (2 + power * 46) * dt;

  // Rings: crossing the ring's plane inside its hole, or spearing its centre.
  const ring = nextRing(f);
  if (ring) {
    const n = vec3(Math.sin(ring.heading), 0, -Math.cos(ring.heading));
    const rel = vec3(f.pos.x - ring.x, f.pos.y - ring.y, f.pos.z - ring.z);
    const side = rel.x * n.x + rel.y * n.y + rel.z * n.z;
    const dist = Math.hypot(rel.x, rel.y, rel.z);
    const crossed = f.prevRingSide !== 0 && Math.sign(side) !== Math.sign(f.prevRingSide);
    const lateral = Math.hypot(rel.x - n.x * side, rel.y - n.y * side, rel.z - n.z * side);
    if ((crossed && lateral < RING_RADIUS) || dist < RING_RADIUS * 0.8) {
      f.ringsPassed += 1;
      f.ringTimes.push(f.time);
      events.ring = true;
      f.ringFx = 1;
      if (f.ringsPassed >= RINGS.length) setMessage(f, 'All rings! Final — land on the runway.', 4);
      else setMessage(f, `Ring ${f.ringsPassed} of ${RINGS.length}. Next one lit.`, 2.2);
      f.prevRingSide = 0;
    } else {
      f.prevRingSide = side;
    }
  }

  // The ground, the sea, and the end of both.
  const floor = groundY + PLANE.gearHeight;
  if (f.pos.y <= floor) {
    if (groundHere < 0.4) {
      crash(f, 'Ditched in the sea. The puffins saw everything.');
      events.crash = true;
    } else if (overRunway(f.pos.x, f.pos.z)) {
      touchdown(f, groundY);
      // A judged arrival counts as a touchdown; a bent one is also a crash.
      events.touchdown = true;
      if (f.phase === PHASE_CRASHED) events.crash = true;
    } else if (f.vy < -7 || f.speed > 30) {
      crash(f, 'Into the hillside. The rally ends there.');
      events.crash = true;
    } else {
      // A gentle arrival in a meadow: she settles, rally over all the same.
      crash(f, 'Down in a meadow, safe but out of the rally.');
      events.crash = true;
    }
  }
  return events;
}

/** Puts the plane back on the runway for another go, score and all reset. */
export function resetFlight(f) {
  const fresh = createFlight();
  Object.assign(f, fresh);
}

/**
 * The title-screen attract flight: an autopilot that circles the main
 * island, banking gently, so the menu flies over live terrain.
 */
export function stepAttract(f, dt, elapsed) {
  const cx = 0;
  const cz = 150;
  const radius = 620;
  const angular = 0.055;
  const a = elapsed * angular;
  const x = cx + Math.cos(a) * radius;
  const z = cz + Math.sin(a) * radius;
  const y = 128 + Math.sin(elapsed * 0.23) * 14;
  // Heading tangent to the circle: velocity runs (-sin a, cos a) across
  // (x, z), and (sin h, -cos h) matches it when h = a + PI. The circle is
  // flown east-point to south-point, a right-hand turn, so it banks right.
  f.heading = wrapAngle(a + Math.PI);
  f.pos.x = x;
  f.pos.y = y;
  f.pos.z = z;
  f.pitch = Math.sin(elapsed * 0.23 + 0.6) * 0.04;
  f.roll = 0.42;
  f.speed = 44;
  f.throttle = 0.62;
  f.onGround = false;
  f.propSpin += dt * 30;
}
