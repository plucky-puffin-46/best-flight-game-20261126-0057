// Boot and the one loop of Puffin Air Rally, Three.js edition. The flight
// model advances in fixed steps however the frame rate wobbles; the
// renderer paints what the state says. Screens: title (with the attract
// flight circling behind it), play, paused, crashed and the results.
// ?seed=N fixes the archipelago's scatter; ?shot=cover|cockpit|approach|
// title|end stages a screenshot scene and sets window.__shotReady when it
// is painted.

import { DEFAULT_SEED, RINGS, STEP } from '../src/config.js';
import { createAudio } from '../src/audio.js';
import { createFlight, PHASE_DONE, resetFlight, stepAttract, stepFlight } from '../src/flight.js';
import { ACTION_CAMERA, ACTION_PAUSE, ACTION_RESET, ACTION_START, createInput } from '../src/input.js';
import { createOverlay, SCREEN_CRASHED, SCREEN_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from '../src/cockpit.js';
import { createRenderer } from './render3.js';
import { vec3 } from '../src/math.js';
import { hashSeed } from '../src/random.js';
import { stageShot } from '../src/shots.js';

const MAX_FRAME = 0.25;
const BEST_KEY = 'puffin-air-rally-best';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = hashSeed(params.get('seed')) ?? DEFAULT_SEED;

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');

function fitHud() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  hudCanvas.width = Math.round(window.innerWidth * dpr);
  hudCanvas.height = Math.round(window.innerHeight * dpr);
}
fitHud();
window.addEventListener('resize', fitHud);

const flight = createFlight();
const renderer = createRenderer(glCanvas, seed);
const overlay = createOverlay(hudCanvas, { panel3d: true });
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private windows refuse storage; the best then lasts the visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, flight);
  let elapsed = 2.4;
  if (name === 'title') {
    // Let the attract pilot settle onto its circle before the portrait.
    for (let t = 0; t < 14; t += 1 / 30) stepAttract(flight, 1 / 30, t);
    elapsed = 14;
  }
  let painted = 0;
  function paint() {
    renderer.draw({ flight, view: scene.view, dt: painted === 0 ? 0 : 1 / 60, elapsed, cam: scene.cam });
    overlay.draw({ flight, view: scene.view, screen: scene.screen, best: 0, elapsed });
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(glCanvas);
  let screen = SCREEN_TITLE;
  let view = 'chase';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;
  let stallCueAt = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startRally() {
    audio.unlock();
    audio.click();
    resetFlight(flight);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('On the runway. Hold W for full throttle, pull up with the up arrow when she is fast.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_START) {
      if (screen === SCREEN_TITLE || screen === SCREEN_CRASHED || screen === SCREEN_DONE) startRally();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if ((actions & ACTION_PAUSE) && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if ((actions & ACTION_PAUSE) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
    }
    if ((actions & ACTION_CAMERA) && screen === SCREEN_PLAY) {
      view = view === 'chase' ? 'cockpit' : 'chase';
      announce(view === 'cockpit' ? 'Cockpit view.' : 'Chase view.');
    }
    if ((actions & ACTION_RESET) && screen === SCREEN_PLAY) startRally();
  }

  function stepPlay(dt) {
    const events = stepFlight(flight, input, dt);
    if (events.ring) {
      audio.chime();
      // A spray of orange sparks where the ring was flown.
      const ring = RINGS[flight.ringsPassed - 1];
      if (ring) renderer.burst(vec3(ring.x, ring.y, ring.z));
    }
    if (events.touchdown && !events.crash && flight.phase !== PHASE_DONE) audio.chirp();
    if (events.touchdown && !events.crash) renderer.shake(0.35);
    if (events.crash) {
      audio.thud();
      screen = SCREEN_CRASHED;
      announce(`Crashed. ${flight.crashReason}`);
    }
    if (flight.phase === PHASE_DONE && screen === SCREEN_PLAY) {
      audio.jingle();
      screen = SCREEN_DONE;
      if (flight.score > best) {
        best = flight.score;
        saveBest(best);
      }
      announce(`Rally complete. Score ${flight.score}.`);
    }
    if (flight.stalled && !flight.onGround && elapsed > stallCueAt) {
      audio.stallWarn();
      stallCueAt = elapsed + 0.9;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    elapsed += frameDt;
    handleActions();
    if (screen === SCREEN_TITLE) {
      stepAttract(flight, frameDt, elapsed);
    } else if (screen === SCREEN_PLAY) {
      accumulator += frameDt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepPlay(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw({ flight, view: screen === SCREEN_TITLE ? 'chase' : view, dt: frameDt, elapsed });
    overlay.draw({ flight, view, screen, best, elapsed });
    audio.update(flight.throttle, flight.speed, screen === SCREEN_PLAY || screen === SCREEN_TITLE);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  announce('Puffin Air Rally. Press Enter to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
