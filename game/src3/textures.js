// Procedural canvas textures for the Three.js rebuild of Puffin Air Rally.
// Everything the renderer paints with — grass grain, asphalt, sea sparkle,
// cloud puffs, house walls, the plane's livery — is drawn here at boot from
// seeded noise, so the game ships no image files and loads nothing.

const THREE = window.THREE;

/** A canvas of the given size with its 2D context, ready to draw on. */
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

/** Small deterministic PRNG so textures look the same on every visit. */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A THREE texture from a canvas, sRGB, optionally tiling. */
function toTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  return tex;
}

/** Near-white grain multiplied over the vertex-coloured terrain. */
export function terrainDetailTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rnd = prng(7101);
  ctx.fillStyle = '#e8e8e2';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i += 1) {
    const v = 196 + Math.floor(rnd() * 59);
    ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
    ctx.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), 2, 2);
  }
  for (let i = 0; i < 260; i += 1) {
    // Short grass strokes, a touch darker or lighter than the base.
    const x = rnd() * 256;
    const y = rnd() * 256;
    const v = 178 + Math.floor(rnd() * 70);
    ctx.strokeStyle = `rgba(${v},${v},${v - 10},0.5)`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 3);
    ctx.stroke();
  }
  return toTexture(canvas, 220);
}

/** Grey noise used as the sea's bump map: slow swells, fine sparkle. */
export function seaBumpTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rnd = prng(4242);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i += 1) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 4 + rnd() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const up = rnd() > 0.5;
    g.addColorStop(0, up ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = toTexture(canvas, 90);
  tex.encoding = THREE.LinearEncoding;
  return tex;
}

/** Soft round cloud puff: bright core, feathered edge, faint blue base. */
export function cloudSpriteTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  const puffs = [
    [128, 138, 86], [84, 148, 58], [172, 148, 62], [108, 118, 62], [150, 116, 58],
  ];
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(250,252,255,0.62)');
    g.addColorStop(1, 'rgba(244,248,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A whisper of shadow under the belly so puffs sit in the light.
  const g = ctx.createRadialGradient(128, 168, 8, 128, 168, 92);
  g.addColorStop(0, 'rgba(148,170,205,0.20)');
  g.addColorStop(1, 'rgba(148,170,205,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 168, 92, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas, 0);
}

/** The runway strip: asphalt, threshold bars, centreline, touchdown zone. */
export function runwayTexture() {
  const [canvas, ctx] = makeCanvas(2048, 160);
  const rnd = prng(90210);
  ctx.fillStyle = '#33373d';
  ctx.fillRect(0, 0, 2048, 160);
  for (let i = 0; i < 15000; i += 1) {
    const v = 42 + Math.floor(rnd() * 30);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(Math.floor(rnd() * 2048), Math.floor(rnd() * 160), 2, 2);
  }
  // Edge lines.
  ctx.fillStyle = 'rgba(235,238,240,0.85)';
  ctx.fillRect(0, 6, 2048, 4);
  ctx.fillRect(0, 150, 2048, 4);
  // Threshold piano keys at both ends.
  for (const x0 of [26, 2048 - 26 - 120]) {
    for (let i = 0; i < 6; i += 1) {
      ctx.fillRect(x0, 18 + i * 22, 120, 12);
    }
  }
  // Touchdown-zone bar pairs past each threshold.
  ctx.fillStyle = 'rgba(235,238,240,0.9)';
  for (const x0 of [300, 430, 2048 - 300 - 56, 2048 - 430 - 56]) {
    ctx.fillRect(x0, 34, 56, 14);
    ctx.fillRect(x0, 112, 56, 14);
  }
  // Dashed centreline.
  for (let x = 190; x < 2048 - 190; x += 92) {
    ctx.fillRect(x, 74, 52, 12);
  }
  // Tyre marks in the touchdown zones, soft dark streaks.
  for (let i = 0; i < 260; i += 1) {
    const west = rnd() > 0.5;
    const x = west ? 240 + rnd() * 260 : 2048 - 240 - rnd() * 260;
    const y = 52 + rnd() * 56;
    ctx.fillStyle = `rgba(12,12,14,${0.05 + rnd() * 0.1})`;
    ctx.fillRect(x, y, 14 + rnd() * 42, 3 + rnd() * 4);
  }
  return toTexture(canvas, 0);
}

/**
 * Dark grained vinyl for the cockpit coaming: near-black with a fine
 * speckle and faint horizontal brushing, so the slab above the panel
 * reads as a material instead of a flat fill.
 */
export function dashTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rnd = prng(31337);
  ctx.fillStyle = '#14181e';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i += 1) {
    const v = 14 + Math.floor(rnd() * 22);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), 2, 2);
  }
  for (let i = 0; i < 90; i += 1) {
    const y = Math.floor(rnd() * 256);
    ctx.fillStyle = `rgba(255,255,255,${0.015 + rnd() * 0.02})`;
    ctx.fillRect(0, y, 256, 1);
  }
  return toTexture(canvas, 3);
}

/** A house wall: plaster, a door, and windows glowing warm. */
export function houseWallTexture(base, trim) {
  const [canvas, ctx] = makeCanvas(256, 160);
  const rnd = prng(base.length * 131 + 7);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`;
    ctx.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 160), 2, 2);
  }
  ctx.fillStyle = trim;
  ctx.fillRect(0, 148, 256, 12);
  // Door.
  ctx.fillStyle = '#4a3626';
  ctx.fillRect(112, 78, 32, 70);
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(138, 116, 3, 0, Math.PI * 2);
  ctx.fill();
  // Windows with warm lamplight and white frames.
  for (const x of [28, 66, 162, 200]) {
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(x - 3, 45, 30, 40);
    ctx.fillStyle = '#ffca7a';
    ctx.fillRect(x, 48, 24, 34);
    ctx.fillStyle = 'rgba(120,70,20,0.65)';
    ctx.fillRect(x + 10, 48, 3, 34);
    ctx.fillRect(x, 63, 24, 3);
  }
  return toTexture(canvas, 0);
}

/**
 * Puffin One's livery, painted for the fuselage lathe: u runs around the
 * body (0 = top, 0.25/0.75 = the flanks, 0.5 = the belly), v runs along it
 * (0 = tail tip, 1 = spinner). White body, orange nose and tail bands, an
 * orange cheatline with cabin windows along both flanks.
 */
export function fuselageTexture() {
  const [canvas, ctx] = makeCanvas(1024, 512);
  ctx.fillStyle = '#f4f6f7';
  ctx.fillRect(0, 0, 1024, 512);
  const vToY = (v) => (1 - v) * 512;
  // Orange nose band and tail band (v near 1 and 0).
  ctx.fillStyle = '#e8641c';
  ctx.fillRect(0, 0, 1024, vToY(0.9));
  ctx.fillRect(0, vToY(0.07), 1024, 512 - vToY(0.07));
  // A thin gold pinstripe ahead of the nose band.
  ctx.fillStyle = '#f2b23e';
  ctx.fillRect(0, vToY(0.9), 1024, 5);
  // Cheatlines and windows on both flanks (u = 0.25 and 0.75).
  for (const u of [0.25, 0.75]) {
    const x = u * 1024;
    ctx.fillStyle = '#e8641c';
    ctx.fillRect(x - 9, vToY(0.88), 18, vToY(0.3) - vToY(0.88));
    ctx.fillStyle = '#f2b23e';
    ctx.fillRect(x - 9, vToY(0.62), 18, 4);
    // Cabin windows: dark rounded panes marching along the cabin (v .48–.8).
    ctx.fillStyle = '#1d2c3a';
    for (let i = 0; i < 4; i += 1) {
      const y = vToY(0.52 + i * 0.085);
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Belly shading, a soft grey gradient around u = 0.5.
  const g = ctx.createLinearGradient(430, 0, 594, 0);
  g.addColorStop(0, 'rgba(120,130,140,0)');
  g.addColorStop(0.5, 'rgba(120,130,140,0.35)');
  g.addColorStop(1, 'rgba(120,130,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(430, 0, 164, 512);
  // The anti-glare panel on top of the nose (u wraps at the top, so the
  // band is painted at both canvas edges), ahead of the windscreen.
  ctx.fillStyle = 'rgba(38,44,52,0.88)';
  ctx.fillRect(0, vToY(0.97), 64, vToY(0.8) - vToY(0.97));
  ctx.fillRect(1024 - 64, vToY(0.97), 64, vToY(0.8) - vToY(0.97));
  return toTexture(canvas, 0);
}

/** Radial alpha disc: the propeller blurred by speed. */
export function propBlurTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, 'rgba(40,42,48,0)');
  g.addColorStop(0.25, 'rgba(40,42,48,0.20)');
  g.addColorStop(0.8, 'rgba(40,42,48,0.30)');
  g.addColorStop(0.97, 'rgba(60,62,70,0.42)');
  g.addColorStop(1, 'rgba(60,62,70,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  const tex = toTexture(canvas, 0);
  tex.encoding = THREE.LinearEncoding;
  return tex;
}

/** A soft round glow sprite (sun glare, lamp halos, ring centres). */
export function glowTexture(inner, outer) {
  const [canvas, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = toTexture(canvas, 0);
  tex.encoding = THREE.LinearEncoding;
  return tex;
}

/**
 * A tiny gradient cubemap so the canopy glass and the polished paint have
 * something real to reflect: sky above, sea below, haze at the horizon.
 */
export function gradientCubeTexture() {
  const faces = [];
  for (let i = 0; i < 6; i += 1) {
    const [canvas, ctx] = makeCanvas(64, 64);
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    if (i === 2) { // +Y: straight up
      g.addColorStop(0, '#3f74c9');
      g.addColorStop(1, '#7fb0e8');
    } else if (i === 3) { // -Y: the sea below
      g.addColorStop(0, '#7d94a8');
      g.addColorStop(1, '#1d4e6e');
    } else {
      g.addColorStop(0, '#5b93d8');
      g.addColorStop(0.52, '#cfe4f7');
      g.addColorStop(0.6, '#9db8c9');
      g.addColorStop(1, '#2c5f86');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    faces.push(canvas);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.needsUpdate = true;
  return tex;
}
