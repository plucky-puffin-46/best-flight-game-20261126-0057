// The cockpit panel's instruments, drawn on canvases and worn by the 3D
// panel as textures: attitude, airspeed, altimeter, vertical speed, power
// and a compass tape. Each gauge owns a small canvas; update(flight)
// repaints them from the live state and flags the textures for upload, so
// the needles in the pilot's view are the real needles, not a picture.

import { PLANE, RUNWAY } from '../src/config.js';
import { altitude, headingDegrees, nextRing } from '../src/flight.js';
import { angleDelta, clamp, wrapAngle } from '../src/math.js';

const THREE = window.THREE;
const INK = '#eaf4ff';
const DIM = '#9db8d2';
const AMBER = '#ffb340';

function makeGauge(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

function text(ctx, value, x, y, size, color = INK, align = 'center', weight = 700) {
  ctx.font = `${weight} ${size}px system-ui, 'Segoe UI', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

function face(ctx, r) {
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1520';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#41597a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#5a7ea6';
  ctx.fill();
}

function needle(ctx, r, angle, length = 0.8) {
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(angle);
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(-r * 0.16, 0);
  ctx.lineTo(0, -r * 0.055);
  ctx.lineTo(r * length, 0);
  ctx.lineTo(0, r * 0.055);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * A 225° dial: ticks every tenth, the needle driven by frac 0..1. The
 * layout keeps every glyph in its own territory — the sweep's wide bottom
 * gap pulls the end numerals up and in, the label sits small above the
 * hub, and the digital value lives in its own boxed window below centre,
 * so no text ever touches another text.
 */
function drawDial(g, frac, label, digital, majorLabels) {
  const { ctx } = g;
  const r = g.canvas.width / 2;
  ctx.clearRect(0, 0, g.canvas.width, g.canvas.height);
  face(ctx, r);
  const start = Math.PI * 0.875; // 157.5°: the scale opens at the bottom
  const sweep = Math.PI * 1.25; // 225°
  for (let i = 0; i <= 10; i += 1) {
    const a = start + (i / 10) * sweep;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.strokeStyle = INK;
    ctx.lineWidth = i % 5 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(r + c * r * 0.79, r + s * r * 0.79);
    ctx.lineTo(r + c * r * 0.9, r + s * r * 0.9);
    ctx.stroke();
    if (majorLabels && i % 5 === 0) {
      text(ctx, majorLabels[i / 5], r + c * r * 0.62, r + s * r * 0.62, r * 0.155, DIM);
    }
  }
  needle(ctx, r, start + clamp(frac, 0, 1) * sweep);
  text(ctx, label, r, r - r * 0.4, r * 0.15, DIM);
  // The digital window: a small dark box with its own border, below centre.
  const bw = r * 0.72;
  const bh = r * 0.3;
  const bx = r - bw / 2;
  const by = r + r * 0.33;
  ctx.beginPath();
  ctx.moveTo(bx + 6, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, 6);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, 6);
  ctx.arcTo(bx, by + bh, bx, by, 6);
  ctx.arcTo(bx, by, bx + bw, by, 6);
  ctx.closePath();
  ctx.fillStyle = '#05090f';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2c4258';
  ctx.stroke();
  text(ctx, digital, r, by + bh / 2 + 1, r * 0.18, INK);
  g.tex.needsUpdate = true;
}

function drawAttitude(g, f) {
  const { ctx } = g;
  const r = g.canvas.width / 2;
  ctx.clearRect(0, 0, g.canvas.width, g.canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#10161f';
  ctx.fillRect(0, 0, r * 2, r * 2);
  ctx.translate(r, r);
  ctx.rotate(-f.roll);
  const pitchPx = clamp(f.pitch, -0.6, 0.6) * r * 1.45;
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f7fd0';
  ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 1.5);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r * 1.5, 0, r * 3, r * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 1.5, 0);
  ctx.lineTo(r * 1.5, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (const deg of [-20, -10, 10, 20]) {
    const yy = -deg * (Math.PI / 180) * r * 1.45;
    const len = deg % 20 === 0 ? r * 0.3 : r * 0.18;
    ctx.beginPath();
    ctx.moveTo(-len, yy);
    ctx.lineTo(len, yy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(r - r * 0.55, r);
  ctx.lineTo(r - r * 0.15, r);
  ctx.lineTo(r - r * 0.15, r + r * 0.13);
  ctx.moveTo(r + r * 0.55, r);
  ctx.lineTo(r + r * 0.15, r);
  ctx.lineTo(r + r * 0.15, r + r * 0.13);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = AMBER;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#41597a';
  ctx.stroke();
  text(ctx, 'ATT', r, r + r * 0.68, r * 0.17, DIM);
  g.tex.needsUpdate = true;
}

function drawVsi(g, f) {
  const { ctx } = g;
  const r = g.canvas.width / 2;
  ctx.clearRect(0, 0, g.canvas.width, g.canvas.height);
  face(ctx, r);
  const marks = [[-1, '-2'], [-0.5, '-1'], [0, '0'], [0.5, '1'], [1, '2']];
  for (const [v, label] of marks) {
    const a = Math.PI - v * Math.PI * 0.75;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r + c * r * 0.76, r + s * r * 0.76);
    ctx.lineTo(r + c * r * 0.9, r + s * r * 0.9);
    ctx.stroke();
    text(ctx, label, r + c * r * 0.6, r + s * r * 0.6, r * 0.18, DIM);
  }
  needle(ctx, r, Math.PI - clamp(f.vy / 10.16, -1, 1) * Math.PI * 0.75);
  text(ctx, 'VSI', r, r - r * 0.4, r * 0.15, DIM);
  text(ctx, `${Math.round(f.vy * 197)} ft/m`, r, r + r * 0.58, r * 0.18, INK);
  g.tex.needsUpdate = true;
}

/** The compass tape: a sliding strip with a bug for the next target. */
function drawCompass(g, f) {
  const { ctx, canvas } = g;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#41597a';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  const deg = headingDegrees(f);
  const pxPerDeg = w / 120;
  for (let d = -60; d <= 60; d += 5) {
    const dd = ((deg + d) % 360 + 360) % 360;
    const px = w / 2 + d * pxPerDeg;
    if (dd % 45 === 0) text(ctx, names[dd], px, h / 2 + 4, 30, dd === 0 ? '#ff8f6b' : INK);
    else {
      ctx.fillStyle = DIM;
      ctx.fillRect(px - 1, h / 2 - 10, 2, 20);
    }
  }
  // With the course complete the bug points at the runway threshold.
  const target = nextRing(f);
  const tx = target ? target.x : RUNWAY.centreX - RUNWAY.length / 2;
  const tz = target ? target.z : RUNWAY.centreZ;
  const bearingDeg = wrapAngle(Math.atan2(tx - f.pos.x, -(tz - f.pos.z))) * 180 / Math.PI;
  const rel = angleDelta(deg * Math.PI / 180, bearingDeg * Math.PI / 180) * 180 / Math.PI;
  if (Math.abs(rel) <= 58) {
    const bx = w / 2 + rel * pxPerDeg;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(bx, 6);
    ctx.lineTo(bx + 8, 16);
    ctx.lineTo(bx, 26);
    ctx.lineTo(bx - 8, 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, h - 4);
  ctx.lineTo(w / 2 + 8, h - 4);
  ctx.lineTo(w / 2, h - 16);
  ctx.closePath();
  ctx.fill();
  g.tex.needsUpdate = true;
}

/**
 * Builds the panel's six instruments. Returns { update(flight), textures }
 * where textures names each THREE texture for the panel builder to wear.
 */
export function createGauges() {
  const attitude = makeGauge([256, 256]);
  const airspeed = makeGauge([256, 256]);
  const altimeter = makeGauge([256, 256]);
  const vsi = makeGauge([256, 256]);
  const power = makeGauge([256, 256]);
  const compass = makeGauge([1024, 96]);
  return {
    textures: {
      attitude: attitude.tex,
      airspeed: airspeed.tex,
      altimeter: altimeter.tex,
      vsi: vsi.tex,
      power: power.tex,
      compass: compass.tex,
    },
    update(f) {
      drawAttitude(attitude, f);
      drawDial(airspeed, f.speed / 85, 'AIRSPEED', `${Math.round(f.speed * 1.944)} kt`, ['0', '40', '90']);
      drawDial(altimeter, clamp(altitude(f) / 330, 0, 1), 'ALTIMETER', `${Math.max(0, Math.round(altitude(f) * 3.281))} ft`, ['0', '500', '1000']);
      drawVsi(vsi, f);
      drawDial(power, f.throttle, 'POWER', f.engineOut ? 'OUT' : `${Math.round(f.throttle * 100)}%`, ['0', '', 'MAX']);
      drawCompass(compass, f);
    },
  };
}
