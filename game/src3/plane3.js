// Puffin One in Three.js, and the cockpit the pilot sits in. The airframe
// is built properly this time: a lathe-turned fuselage wearing a painted
// livery texture (orange nose, cheatline, cabin windows), a glass canopy
// with a gradient sky to reflect, extruded wings with orange tips, gear
// with real wheels, and a propeller that blurs into a disc as it spins up.
// The cockpit is a child of the same group — panel with live canvas-texture
// gauges, a yoke that answers the stick, a throttle lever that travels —
// so sitting in it, the nose and cowling ahead are the aeroplane's own.

import { dashTexture, fuselageTexture, gradientCubeTexture, propBlurTexture } from './textures.js';
import { createGauges } from './gauges.js';

const THREE = window.THREE;

const ORANGE = 0xe8641c;
const DARK = 0x232a33;

function std(params) {
  return new THREE.MeshStandardMaterial(params);
}

/** One wing half: an extruded planform with a rounded tip. sign = +1 right. */
function wingGeometry(sign, span, rootChord, tipChord, thickness) {
  const s = new THREE.Shape();
  s.moveTo(0, rootChord / 2);
  s.lineTo(sign * (span - 0.5), tipChord / 2 + 0.08);
  s.quadraticCurveTo(sign * (span + 0.12), 0, sign * (span - 0.5), -tipChord / 2 - 0.08);
  s.lineTo(0, -rootChord / 2);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -thickness, 0);
  return geo;
}

function buildAirframe(cubeTex) {
  const g = new THREE.Group();
  const paint = std({
    map: fuselageTexture(), roughness: 0.36, metalness: 0.06,
    envMap: cubeTex, envMapIntensity: 0.45,
  });
  const white = std({ color: 0xf4f6f7, roughness: 0.45, metalness: 0.05, envMap: cubeTex, envMapIntensity: 0.3 });
  const orange = std({ color: ORANGE, roughness: 0.42, metalness: 0.05, envMap: cubeTex, envMapIntensity: 0.3 });

  // Fuselage: lathe profile from tail tip (along -3.8) to spinner (+3.5),
  // turned so the axis lies along Z with the nose toward -Z.
  const profile = [
    [0.03, -3.8], [0.26, -3.35], [0.48, -2.5], [0.68, -1.4], [0.82, -0.3],
    [0.92, 0.6], [0.95, 1.4], [0.9, 2.2], [0.78, 2.8], [0.55, 3.25], [0.3, 3.52],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuselage = new THREE.Mesh(new THREE.LatheGeometry(profile, 30), paint);
  fuselage.geometry.rotateX(-Math.PI / 2);
  fuselage.position.y = 1.9;
  g.add(fuselage);

  // Glass canopy over the cabin.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 18),
    new THREE.MeshPhongMaterial({
      color: 0x2a4258, specular: 0xd8ecff, shininess: 90,
      transparent: true, opacity: 0.62, envMap: cubeTex, reflectivity: 0.85,
    }),
  );
  canopy.scale.set(0.8, 0.55, 1.35);
  canopy.position.set(0, 2.52, -1.35);
  g.add(canopy);

  // Wings: high wing, a touch of dihedral, orange tips.
  const wingY = 2.94;
  for (const sign of [1, -1]) {
    const wing = new THREE.Mesh(wingGeometry(sign, 5.2, 1.75, 1.2, 0.15), white);
    wing.position.set(0, wingY, 0.28);
    wing.rotation.z = sign * 0.055;
    g.add(wing);
    const tipShape = new THREE.Shape();
    tipShape.moveTo(sign * 3.95, 0.72);
    tipShape.lineTo(sign * 4.7, 0.62);
    tipShape.quadraticCurveTo(sign * 5.32, 0, sign * 4.7, -0.62);
    tipShape.lineTo(sign * 3.95, -0.78);
    tipShape.closePath();
    const tipGeo = new THREE.ExtrudeGeometry(tipShape, { depth: 0.15, bevelEnabled: false });
    tipGeo.rotateX(-Math.PI / 2);
    tipGeo.translate(0, -0.15, 0);
    const tip = new THREE.Mesh(tipGeo, orange);
    tip.position.set(0, wingY, 0.28);
    tip.rotation.z = sign * 0.055;
    g.add(tip);
  }

  // Tail feathers: a symmetric stabiliser and an orange fin.
  const stabShape = new THREE.Shape();
  stabShape.moveTo(-1.75, -0.36);
  stabShape.quadraticCurveTo(-1.92, 0, -1.75, 0.36);
  stabShape.lineTo(1.75, 0.36);
  stabShape.quadraticCurveTo(1.92, 0, 1.75, -0.36);
  stabShape.closePath();
  const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.1, bevelEnabled: false });
  stabGeo.rotateX(-Math.PI / 2);
  stabGeo.translate(0, -0.1, 0);
  const stab = new THREE.Mesh(stabGeo, white);
  stab.position.set(0, 2.18, 3.42);
  g.add(stab);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(1.55, 0.06);
  finShape.quadraticCurveTo(1.62, 0.85, 1.05, 1.12);
  finShape.quadraticCurveTo(0.45, 1.28, 0.06, 0.62);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.11, bevelEnabled: false });
  finGeo.translate(0, 0, -0.055);
  finGeo.rotateY(-Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, orange);
  fin.position.set(0, 2.05, 2.34);
  g.add(fin);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    std({ color: 0xff4444, emissive: 0xdd2222, emissiveIntensity: 1.6 }),
  );
  beacon.position.set(0, 3.28, 3.6);
  g.add(beacon);

  // Gear: three struts, three wheels with pale hubs.
  const strutMat = std({ color: 0x9aa4ae, roughness: 0.35, metalness: 0.7 });
  const tyreMat = std({ color: 0x1b1e22, roughness: 0.9 });
  const hubMat = std({ color: 0xd8dde2, roughness: 0.4, metalness: 0.4 });
  function wheel(x, z, topY) {
    const grp = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, topY - 0.36, 8), strutMat);
    strut.position.y = (topY + 0.36) / 2;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 18), tyreMat);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.y = 0.36;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 12), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.y = 0.36;
    grp.add(strut, tyre, hub);
    grp.position.set(x, 0, z);
    return grp;
  }
  g.add(wheel(-0.82, 0.15, 1.15), wheel(0.82, 0.15, 1.15), wheel(0, -2.35, 1.2));

  // Propeller: hub, spinner, two blades with orange tips, and the blur disc
  // that fades in as the revs rise.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 16), orange);
  spinner.geometry.rotateX(-Math.PI / 2);
  spinner.position.z = -0.18;
  prop.add(spinner);
  const blades = new THREE.Group();
  const bladeMat = std({ color: 0x2b2f36, roughness: 0.5, transparent: true });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.75, 0.045), bladeMat);
  const tipA = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.34, 0.05), orange);
  tipA.position.y = 1.2;
  const tipB = tipA.clone();
  tipB.position.y = -1.2;
  blades.add(blade, tipA, tipB);
  prop.add(blades);
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(1.48, 32),
    new THREE.MeshBasicMaterial({
      map: propBlurTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  blur.position.z = 0.02;
  prop.add(blur);
  prop.position.set(0, 1.9, -3.62);
  g.add(prop);

  // Navigation lights at the wingtips.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
    std({ color: 0xff5545, emissive: 0xee2211, emissiveIntensity: 2 }));
  navL.position.set(-5.25, 3.2, 0.28);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
    std({ color: 0x55ff77, emissive: 0x11cc44, emissiveIntensity: 2 }));
  navR.position.set(5.25, 3.2, 0.28);
  g.add(navL, navR);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  canopy.castShadow = false;
  blur.castShadow = false;
  return { group: g, prop, blades, bladeMat, blur, canopy };
}

function buildCockpit(gauges) {
  const g = new THREE.Group();
  const shell = std({ color: 0x171d26, roughness: 0.85, metalness: 0.15 });
  const panelMat = std({ color: 0x1a212c, roughness: 0.6, metalness: 0.25 });

  // The pilot sits high, eye at 2.58, so the cowling ahead falls away
  // below the sightline; the panel stands a metre off, its face toward
  // the pilot at z = -2.265 — gauges and lamps sit a hair in front of it.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.68, 0.07), panelMat);
  panel.position.set(0, 2.14, -2.3);
  g.add(panel);
  // The coaming wears a dark grained vinyl of its own, and sits a touch
  // lower and further back than the panel's top edge, so the aeroplane's
  // own cowling shows over it ahead of the windscreen.
  const coamingMat = std({ map: dashTexture(), roughness: 0.94, metalness: 0.05 });
  const coaming = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.42), coamingMat);
  coaming.position.set(0, 2.44, -2.17);
  coaming.rotation.x = 0.18;
  g.add(coaming);

  // The cowling deck: the fuselage lathe is a closed tube, so from the
  // pilot's seat its nose is all backfaces and culled — the pilot would
  // see sky where his own engine cowling should be. This pair of closed
  // lathe solids re-traces the fuselage profile from the windscreen
  // base to the spinner (white deck, orange nose band), in the cockpit
  // group so only the pilot ever sees it. They are closed solids, not
  // open shells: an open shell's mouth swallows the very sightlines
  // that should strike its top.
  const deckWhite = std({ color: 0xf4f6f7, roughness: 0.45, metalness: 0.05 });
  const deckOrange = std({ color: ORANGE, roughness: 0.42, metalness: 0.05 });
  function deckLathe(profile, mat) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 24);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 1.9, 0);
    g.add(m);
    return m;
  }
  deckLathe([
    [0.0, 2.58], [0.4, 2.62], [0.7, 2.66], [0.815, 2.7], [0.78, 2.8],
    [0.7, 3.0], [0.6, 3.15], [0.565, 3.2],
  ], deckWhite);
  deckLathe([
    [0.575, 3.18], [0.5, 3.35], [0.38, 3.48], [0.2, 3.56], [0.0, 3.6],
  ], deckOrange);

  // The six instruments, worn as live canvas textures.
  const gaugeAt = (tex, x, size = 0.25) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    m.position.set(x, 2.14, -2.258);
    g.add(m);
    return m;
  };
  gaugeAt(gauges.textures.attitude, -0.56);
  gaugeAt(gauges.textures.airspeed, -0.28);
  gaugeAt(gauges.textures.altimeter, 0);
  gaugeAt(gauges.textures.vsi, 0.28);
  gaugeAt(gauges.textures.power, 0.56);
  const compass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.064),
    new THREE.MeshBasicMaterial({ map: gauges.textures.compass, transparent: true }),
  );
  compass.position.set(0, 2.64, -2.12);
  compass.rotation.x = -0.5;
  g.add(compass);

  // Annunciator lamps along the panel's top edge.
  const lampGeo = new THREE.PlaneGeometry(0.13, 0.045);
  function lamp(x) {
    const m = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x2c4a34 }));
    m.position.set(x, 2.42, -2.258);
    g.add(m);
    return m;
  }
  const lamps = { gear: lamp(-0.42), fuel: lamp(-0.14), stall: lamp(0.14), rings: lamp(0.42) };

  // Windscreen pillars and the top frame.
  for (const sign of [1, -1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.15, 0.07), shell);
    pillar.position.set(sign * 0.74, 2.72, -2.1);
    pillar.rotation.x = 0.42;
    pillar.rotation.z = -sign * 0.16;
    g.add(pillar);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 1.15), shell);
    door.position.set(sign * 0.79, 2.0, -1.7);
    g.add(door);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 0.08), shell);
  header.position.set(0, 3.18, -2.3);
  header.rotation.x = 0.42;
  g.add(header);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 1.7), shell);
  floor.position.set(0, 1.5, -1.5);
  g.add(floor);
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.95), panelMat);
  console_.position.set(0, 1.72, -1.8);
  g.add(console_);

  // The yoke: a column and a wheel that rolls and slides with the stick.
  const yoke = new THREE.Group();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.42, 10), shell);
  column.rotation.x = 1.05;
  column.position.set(0, -0.14, 0.09);
  const wheelYoke = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.02, 10, 24), std({ color: 0x2c3644, roughness: 0.55 }));
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), wheelYoke.material);
  yoke.add(column, wheelYoke, spoke);
  yoke.position.set(-0.3, 1.98, -2.12);
  g.add(yoke);

  // The throttle quadrant on the console's right cheek, slung low: from
  // the pilot's eye the knob used to cross the VSI's face, so the whole
  // quadrant drops until the knob travels below the gauge row.
  const quadrant = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.34), panelMat);
  quadrant.position.set(0.18, 1.66, -2.05);
  g.add(quadrant);
  const lever = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), std({ color: 0x39434f, roughness: 0.4, metalness: 0.5 }));
  arm.position.y = 0.09;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), std({ color: ORANGE, roughness: 0.35 }));
  knob.position.y = 0.2;
  lever.add(arm, knob);
  lever.position.set(0.18, 1.72, -2.1);
  g.add(lever);

  // The pilot's eye: a camera riding in the group.
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 12000);
  camera.position.set(0, 2.58, -1.25);
  g.add(camera);

  return { group: g, camera, yoke, lever, lamps };
}

/**
 * Builds Puffin One and her cockpit. update() poses the propeller, yoke,
 * throttle and lamps from the flight state and repaints the gauges;
 * setView() shows or hides what the pilot should not see of his own plane.
 */
export function buildPlane3() {
  const cubeTex = gradientCubeTexture();
  const gauges = createGauges();
  const air = buildAirframe(cubeTex);
  const cockpit = buildCockpit(gauges);
  air.group.add(cockpit.group);
  let view = null; // unset, so the first setView() call applies in full
  return {
    group: air.group,
    cockpitCamera: cockpit.camera,
    gauges,
    update(f) {
      air.prop.rotation.z = f.propSpin;
      const revs = f.engineOut ? 0 : f.throttle;
      air.blur.material.opacity = Math.max(0, revs * 0.9 - 0.14);
      air.bladeMat.opacity = 1 - Math.max(0, revs * 1.3 - 0.25);
      cockpit.yoke.rotation.z = -f.roll * 0.75;
      cockpit.yoke.position.z = -2.12 + f.pitch * 0.07;
      cockpit.lever.rotation.x = 0.55 - f.throttle * 1.0;
      cockpit.lamps.gear.material.color.setHex(0x2fae5f);
      cockpit.lamps.fuel.material.color.setHex(f.fuel < 22 ? 0xc23a2e : 0x2fae5f);
      cockpit.lamps.stall.material.color.setHex(f.stalled && !f.onGround ? 0xc23a2e : 0x39434f);
      cockpit.lamps.rings.material.color.setHex(f.ringsPassed >= 8 ? 0x2fae5f : 0x39434f);
      gauges.update(f);
    },
    setView(next) {
      if (next === view) return;
      view = next;
      const inside = next === 'cockpit';
      air.canopy.visible = !inside;
      air.blades.visible = !inside;
      air.blur.visible = !inside;
      cockpit.group.visible = inside;
    },
  };
}
