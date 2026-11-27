// The 2D layer over the 3D view: the HUD a pilot flies by (altitude, speed
// and heading always on show, ring count, timer, fuel, a steering arrow to
// the next target), and the title, pause, crash and results screens. The
// cockpit's panel itself is a real 3D cockpit in the scene (src3/plane3.js
// wears the live gauges from src3/gauges.js), so the overlay is created
// with { panel3d: true } and skips its flat panel drawing; that drawing is
// kept for reference and for any future flat fallback. Nothing here knows
// about WebGL; it reads the flight state and paints canvas 2D.

import { PLANE, RINGS, RUNWAY } from './config.js';
import { altitude, headingDegrees, heightAboveGround, nextRing } from './flight.js';
import { angleDelta, clamp, wrapAngle } from './math.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_DONE = 'done';

const INK = '#eaf4ff';
const DIM = '#9db8d2';
const AMBER = '#ffb340';
const GREEN = '#57e389';
const RED = '#ff5d5d';
const PANEL = 'rgba(8, 14, 24, 0.55)';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 200, 240, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(ctx, value, x, y, size, color = INK, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px system-ui, 'Segoe UI', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

/** The always-on flight data block, top-left, and its fellows. */
function drawHud(ctx, f, w, h, elapsed) {
  const u = Math.min(w, h) / 46; // a rough unit: ~28px at 720p
  panel(ctx, u * 0.7, u * 0.7, u * 8.6, u * 4.6);
  const altFt = Math.max(0, Math.round(altitude(f) * 3.281));
  const spdKt = Math.round(f.speed * 1.944);
  text(ctx, `ALT ${altFt} ft`, u * 1.2, u * 1.6, u * 1.05);
  text(ctx, `SPD ${spdKt} kt`, u * 1.2, u * 2.9, u * 1.05);
  text(ctx, `HDG ${String(headingDegrees(f)).padStart(3, '0')}°`, u * 1.2, u * 4.2, u * 1.05);

  // Rings, time and score, top-right.
  const timeText = `${Math.floor(f.time / 60)}:${String(Math.floor(f.time % 60)).padStart(2, '0')}`;
  panel(ctx, w - u * 9.3, u * 0.7, u * 8.6, u * 4.6);
  text(ctx, `RINGS ${f.ringsPassed}/${RINGS.length}`, w - u * 8.8, u * 1.6, u * 1.05, f.ringsPassed >= RINGS.length ? GREEN : INK);
  text(ctx, `TIME ${timeText}`, w - u * 8.8, u * 2.9, u * 1.05);
  text(ctx, `SCORE ${f.score || f.ringsPassed * 100}`, w - u * 8.8, u * 4.2, u * 1.05);

  // Fuel and throttle, bottom-left: two slim bars.
  const barW = u * 7.2;
  panel(ctx, u * 0.7, h - u * 3.6, barW + u, u * 2.9);
  text(ctx, 'FUEL', u * 1.2, h - u * 2.9, u * 0.8, DIM);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, u * 3.4, h - u * 3.25, barW - u * 2.2, u * 0.62, 4);
  ctx.fill();
  ctx.fillStyle = f.fuel < 22 ? RED : GREEN;
  roundRect(ctx, u * 3.4, h - u * 3.25, (barW - u * 2.2) * clamp(f.fuel / PLANE.fuelTank, 0, 1), u * 0.62, 4);
  ctx.fill();
  text(ctx, 'THR', u * 1.2, h - u * 1.65, u * 0.8, DIM);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, u * 3.4, h - u * 2.0, barW - u * 2.2, u * 0.62, 4);
  ctx.fill();
  ctx.fillStyle = AMBER;
  roundRect(ctx, u * 3.4, h - u * 2.0, (barW - u * 2.2) * f.throttle, u * 0.62, 4);
  ctx.fill();

  // The steering arrow to the next target, bottom-centre.
  const target = nextRing(f) ?? { x: RUNWAY.centreX - RUNWAY.length / 2, y: RUNWAY.height, z: RUNWAY.centreZ, heading: RUNWAY.heading };
  const dx = target.x - f.pos.x;
  const dz = target.z - f.pos.z;
  const dist = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, -dz);
  const rel = angleDelta(f.heading, wrapAngle(bearing));
  const cx = w / 2;
  const cy = h - u * 2.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rel);
  ctx.fillStyle = f.ringsPassed >= RINGS.length ? GREEN : AMBER;
  ctx.beginPath();
  ctx.moveTo(0, -u * 0.95);
  ctx.lineTo(u * 0.55, u * 0.6);
  ctx.lineTo(0, u * 0.28);
  ctx.lineTo(-u * 0.55, u * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, `${Math.round(dist)} m`, cx, cy + u * 1.35, u * 0.85, DIM, 'center');

  // The centre message: the rally talking to the pilot.
  if (f.message && f.messageT > 0) {
    text(ctx, f.message, w / 2, u * 2.2, u * 1.3, INK, 'center');
  }
  // Warnings, flashing where they should worry you.
  const blink = Math.sin(elapsed * 9) > -0.2;
  if (f.stalled && !f.onGround && blink) {
    text(ctx, 'STALL', w / 2, h * 0.3, u * 1.7, RED, 'center', 800);
  }
  if (f.engineOut) {
    text(ctx, 'ENGINE OUT — GLIDE TO THE RUNWAY', w / 2, h * 0.36, u * 1.0, RED, 'center', 800);
  } else if (f.fuel < 22 && f.started && !f.finished) {
    text(ctx, 'LOW FUEL', w / 2, h * 0.36, u * 0.95, AMBER, 'center', 800);
  }
  if (!f.onGround && heightAboveGround(f) < 12 && f.vy < -2) {
    text(ctx, `AGL ${Math.max(0, Math.round(heightAboveGround(f) * 3.281))} ft`, w / 2, h * 0.42, u * 0.9, DIM, 'center');
  }
}

/** A round dial with ticks and a needle; the panel's basic instrument. */
function dial(ctx, x, y, r, frac, label, digital, color = INK) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1520';
  ctx.fill();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = '#3d5a78';
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i <= 10; i += 1) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = DIM;
    ctx.fillRect(r * 0.78, -r * 0.02, r * 0.16, r * 0.04);
    ctx.restore();
  }
  const a = Math.PI * 0.75 + clamp(frac, 0, 1) * Math.PI * 1.5;
  ctx.rotate(a);
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(-r * 0.14, 0);
  ctx.lineTo(0, -r * 0.05);
  ctx.lineTo(r * 0.82, 0);
  ctx.lineTo(0, r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#5a7ea6';
  ctx.fill();
  text(ctx, label, x, y + r * 0.52, r * 0.26, DIM, 'center');
  text(ctx, digital, x, y + r * 1.28, r * 0.3, color, 'center');
}

/** The artificial horizon: the world tilts, the little plane stays. */
function horizonGauge(ctx, x, y, r, f) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.translate(x, y);
  ctx.rotate(-f.roll);
  const pitchPx = clamp(f.pitch, -0.6, 0.6) * r * 1.5;
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f7fd0';
  ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 1.6, 0);
  ctx.lineTo(r * 1.6, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  for (const deg of [-20, -10, 10, 20]) {
    const yy = -deg * (Math.PI / 180) * r * 1.5;
    const len = deg % 20 === 0 ? r * 0.34 : r * 0.2;
    ctx.beginPath();
    ctx.moveTo(-len, yy);
    ctx.lineTo(len, yy);
    ctx.stroke();
  }
  ctx.restore();
  // The fixed symbol and the bezel.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y);
  ctx.lineTo(x - r * 0.14, y);
  ctx.lineTo(x - r * 0.14, y + r * 0.12);
  ctx.moveTo(x + r * 0.55, y);
  ctx.lineTo(x + r * 0.14, y);
  ctx.lineTo(x + r * 0.14, y + r * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = AMBER;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = '#3d5a78';
  ctx.stroke();
  text(ctx, 'ATT', x, y + r * 1.28, r * 0.3, DIM, 'center');
}

/** The compass tape across the top of the panel, with a bug for the target. */
function compassTape(ctx, x, y, w, f) {
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  ctx.save();
  panel(ctx, x - w / 2, y - 16, w, 32);
  ctx.beginPath();
  ctx.rect(x - w / 2, y - 16, w, 32);
  ctx.clip();
  const deg = headingDegrees(f);
  for (let d = -60; d <= 60; d += 5) {
    const dd = ((deg + d) % 360 + 360) % 360;
    const px = x + (d / 60) * (w / 2);
    if (dd % 45 === 0) text(ctx, names[dd], px, y, 15, INK, 'center');
    else {
      ctx.fillStyle = DIM;
      ctx.fillRect(px - 0.5, y - 6, 1, 12);
    }
  }
  // The target bug: a small diamond where the next ring (or the runway)
  // bears, when it falls on the tape at all.
  const target = nextRing(f) ?? RUNWAY;
  const tx = target === RUNWAY ? RUNWAY.centreX - RUNWAY.length / 2 : target.x;
  const tz = target === RUNWAY ? RUNWAY.centreZ : target.z;
  const bearingDeg = wrapAngle(Math.atan2(tx - f.pos.x, -(tz - f.pos.z))) * 180 / Math.PI;
  const rel = angleDelta(headingDegrees(f) * Math.PI / 180, bearingDeg * Math.PI / 180) * 180 / Math.PI;
  if (Math.abs(rel) <= 60) {
    const bx = x + (rel / 60) * (w / 2);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(bx, y - 13);
    ctx.lineTo(bx + 5, y - 7);
    ctx.lineTo(bx, y - 1);
    ctx.lineTo(bx - 5, y - 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 20);
  ctx.lineTo(x + 6, y - 20);
  ctx.lineTo(x, y - 12);
  ctx.closePath();
  ctx.fill();
}

/** The vertical-speed indicator: zero at nine o'clock, climb up, sink down. */
function vsiGauge(ctx, x, y, r, f) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0b1220';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3d5a78';
  ctx.stroke();
  const marks = [[-1, '-2'], [-0.5, '-1'], [0, '0'], [0.5, '1'], [1, '2']];
  ctx.fillStyle = DIM;
  for (const [v, label] of marks) {
    const a = Math.PI - v * Math.PI * 0.75;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x + c * r * 0.78, y + s * r * 0.78);
    ctx.lineTo(x + c * r * 0.92, y + s * r * 0.92);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    text(ctx, label, x + c * r * 0.55, y + s * r * 0.55, r * 0.24, DIM, 'center');
  }
  const v = clamp(f.vy / 10.16, -1, 1);
  const a = Math.PI - v * Math.PI * 0.75;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(-r * 0.14, 0);
  ctx.lineTo(0, -r * 0.05);
  ctx.lineTo(r * 0.82, 0);
  ctx.lineTo(0, r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#5a7ea6';
  ctx.fill();
  text(ctx, 'VSI', x, y + r * 0.55, r * 0.24, DIM, 'center');
  text(ctx, `${Math.round(f.vy * 197)} ft/m`, x, y + r * 1.28, r * 0.3, INK, 'center');
}

/**
 * The control yoke in front of the left seat: a column rising from the
 * floor and a wheel that rolls with the bank and slides with the pitch.
 */
function yoke(ctx, x, y, r, f) {
  const slide = clamp(f.pitch, -0.5, 0.5) * r * 0.9;
  ctx.strokeStyle = '#0a0f16';
  ctx.lineWidth = r * 0.24;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + r * 2.6);
  ctx.lineTo(x, y + slide * 0.4);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y + slide);
  ctx.rotate(clamp(-f.roll, -1.1, 1.1) * 0.75);
  ctx.strokeStyle = '#232e3d';
  ctx.lineWidth = r * 0.17;
  roundRect(ctx, -r, -r * 0.34, r * 2, r * 0.68, r * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.82, 0);
  ctx.lineTo(r * 0.82, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#39485e';
  ctx.fill();
  ctx.restore();
}

/** The throttle quadrant on the right: a slot, and a knob that travels it. */
function throttleQuadrant(ctx, x, yTop, yBot, u, f) {
  ctx.fillStyle = '#11161f';
  roundRect(ctx, x - u * 1.7, yTop, u * 3.4, yBot - yTop, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,180,220,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, 'THR', x, yTop + u * 0.85, u * 0.72, DIM, 'center', 800);
  const slotTop = yTop + u * 1.7;
  const slotBot = yBot - u * 0.9;
  ctx.strokeStyle = '#05080d';
  ctx.lineWidth = u * 0.34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, slotTop);
  ctx.lineTo(x, slotBot);
  ctx.stroke();
  const ky = slotBot - clamp(f.throttle, 0, 1) * (slotBot - slotTop);
  ctx.beginPath();
  ctx.arc(x, ky, u * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = '#e8641c';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - u * 0.18, ky - u * 0.18, u * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

/** The cockpit: windscreen frame, coaming and the lit panel. */
function drawCockpit(ctx, f, w, h) {
  const u = Math.min(w, h) / 46;
  const dashTop = h * 0.66;
  // The panel block.
  const grad = ctx.createLinearGradient(0, dashTop, 0, h);
  grad.addColorStop(0, '#232c38');
  grad.addColorStop(0.12, '#161d27');
  grad.addColorStop(1, '#0a0e14');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, dashTop + u * 1.2);
  ctx.quadraticCurveTo(w * 0.5, dashTop - u * 1.6, w, dashTop + u * 1.2);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,180,220,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Rivets along the coaming edge — the panel's only texture, and enough.
  ctx.fillStyle = 'rgba(170,205,240,0.16)';
  for (let rx = w * 0.04; rx < w; rx += w * 0.04) {
    ctx.beginPath();
    ctx.arc(rx, dashTop + u * 1.05 - (Math.sin((rx / w) * Math.PI) * u * 0.55), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Windscreen pillars, slimmed right down, and the top frame.
  ctx.fillStyle = '#10151d';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.026, 0);
  ctx.lineTo(w * 0.082, dashTop);
  ctx.lineTo(0, dashTop + u * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w * 0.974, 0);
  ctx.lineTo(w * 0.918, dashTop);
  ctx.lineTo(w, dashTop + u * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,200,240,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.026, 0);
  ctx.lineTo(w * 0.082, dashTop);
  ctx.moveTo(w * 0.974, 0);
  ctx.lineTo(w * 0.918, dashTop);
  ctx.stroke();
  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, w, h * 0.03);
  // The compass on the coaming.
  compassTape(ctx, w / 2, dashTop - u * 0.4, w * 0.34, f);
  // The instruments, five across: horizon, airspeed, altimeter, vertical
  // speed, power — every needle live.
  const gy = dashTop + (h - dashTop) * 0.52;
  const gr = Math.min(w, h) * 0.082;
  horizonGauge(ctx, w * 0.20, gy, gr, f);
  dial(ctx, w * 0.36, gy, gr, f.speed / 85, 'AIRSPEED', `${Math.round(f.speed * 1.944)} kt`);
  dial(ctx, w * 0.52, gy, gr, clamp(altitude(f) / 320, 0, 1), 'ALTIMETER', `${Math.max(0, Math.round(altitude(f) * 3.281))} ft`);
  vsiGauge(ctx, w * 0.68, gy, gr, f);
  dial(ctx, w * 0.84, gy, gr, f.throttle, 'POWER', `${Math.round(f.throttle * 100)}%`);
  // The yoke in front of the pilot, and the throttle on the right wall.
  yoke(ctx, w * 0.20, gy + gr * 1.72, gr * 0.85, f);
  throttleQuadrant(ctx, w * 0.945, dashTop + u * 2.1, h - u * 1.1, u, f);
  // The maker's plate, centred under the annunciators.
  text(ctx, 'PUFFIN ONE · P-1 TRAINER', w / 2, dashTop + u * 1.95, u * 0.62, 'rgba(190,215,245,0.4)', 'center', 700);
  // A row of annunciators under the coaming.
  const lights = [
    ['GEAR', true, GREEN],
    ['FUEL', f.fuel >= 22, f.fuel >= 22 ? GREEN : RED],
    ['STALL', !f.stalled, f.stalled ? RED : DIM],
    ['RINGS', f.ringsPassed >= RINGS.length, f.ringsPassed >= RINGS.length ? GREEN : DIM],
  ];
  lights.forEach(([label, ok, color], i) => {
    const lx = w * 0.36 + i * w * 0.075;
    const ly = dashTop + u * 0.75;
    ctx.fillStyle = ok ? 'rgba(30,60,40,0.8)' : 'rgba(70,25,25,0.85)';
    roundRect(ctx, lx - u * 1.5, ly - u * 0.5, u * 3, u * 1.0, 4);
    ctx.fill();
    text(ctx, label, lx, ly, u * 0.62, color, 'center', 800);
  });
}

/** A centred information panel for the title, crash and results screens. */
function centrePanel(ctx, w, h, title, lines, accent = INK) {
  const pw = Math.min(w * 0.72, 640);
  const ph = 118 + lines.length * 30;
  const x = (w - pw) / 2;
  const y = (h - ph) / 2;
  ctx.fillStyle = 'rgba(5, 10, 18, 0.72)';
  roundRect(ctx, x, y, pw, ph, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 195, 240, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, title, w / 2, y + 44, 34, accent, 'center', 800);
  lines.forEach((line, i) => {
    text(ctx, line, w / 2, y + 92 + i * 30, 17, i === lines.length - 1 ? AMBER : INK, 'center', 600);
  });
}

/**
 * Creates the overlay painter over the HUD canvas. With { panel3d: true }
 * the cockpit's panel is a real 3D cockpit in the scene, so the flat panel
 * drawing is skipped and only the HUD and screens are painted here.
 */
export function createOverlay(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const panel3d = options.panel3d === true;
  return {
    draw(state) {
      const { flight: f, view, screen, best, elapsed } = state;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (view === 'cockpit' && screen !== SCREEN_TITLE && !panel3d) drawCockpit(ctx, f, w, h);
      if (screen !== SCREEN_TITLE) drawHud(ctx, f, w, h, elapsed);
      // A subtle centre dot to fly by in chase view.
      if (screen === SCREEN_PLAY && view === 'chase') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (screen === SCREEN_TITLE) {
        centrePanel(ctx, w, h, 'PUFFIN AIR RALLY', [
          'Fly the little orange plane through all 8 glowing rings, in order.',
          'Then come back and land on the runway. Softly.',
          '',
          'ARROWS steer · W/S throttle · C camera · M mouse-steer · P pause',
          'Watch the arrow: it always points at the next ring.',
          best > 0 ? `Best rally score so far: ${best}` : '',
          'Press ENTER or click to fly',
        ], AMBER);
      } else if (screen === SCREEN_PAUSED) {
        centrePanel(ctx, w, h, 'PAUSED', ['Press P or ENTER to keep flying'], DIM);
      } else if (screen === SCREEN_CRASHED) {
        centrePanel(ctx, w, h, 'CRASHED', [
          f.crashReason || 'The rally ends there.',
          `Rings flown: ${f.ringsPassed} of ${RINGS.length} · Time ${Math.floor(f.time)}s`,
          'Press ENTER to try again',
        ], RED);
      } else if (screen === SCREEN_DONE) {
        const mins = Math.floor(f.time / 60);
        const secs = String(Math.floor(f.time % 60)).padStart(2, '0');
        centrePanel(ctx, w, h, 'RALLY COMPLETE', [
          `Time ${mins}:${secs} · Rings ${f.ringsPassed * 100} pts`,
          `Landing ${f.landingScore} pts · Score ${f.score}`,
          best > 0 && f.score >= best ? 'A new best rally!' : `Best so far: ${Math.max(best, f.score)}`,
          'Press ENTER to fly the rally again',
        ], GREEN);
      }
    },
  };
}
