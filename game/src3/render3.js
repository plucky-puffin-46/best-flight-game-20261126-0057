// The Three.js renderer for Puffin Air Rally: ACES tone mapping, soft
// shadows that follow the aeroplane, fog matched to the horizon, a chase
// camera that lags and leans into the bank, the pilot's own camera in the
// cockpit, ring-pass particle bursts and a touchdown shake. Same outward
// shape as the old hand-rolled renderer — draw(state), burst(pos),
// shake(amount) — so the game loop does not care which engine paints it.

import { RINGS } from '../src/config.js';
import { altitude } from '../src/flight.js';
import { clamp, lerp, vec3, wrapAngle } from '../src/math.js';
import { buildWorld3, SUN_DIR } from './world3.js';
import { buildPlane3 } from './plane3.js';
import { glowTexture } from './textures.js';

const THREE = window.THREE;
const HORIZON = new THREE.Color(0.78, 0.88, 0.98).convertSRGBToLinear();

function headingForward(heading, pitch) {
  const cp = Math.cos(pitch);
  return vec3(Math.sin(heading) * cp, Math.sin(pitch), -Math.cos(heading) * cp);
}

export function createRenderer(canvas, seed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 900, 7200);

  const hemi = new THREE.HemisphereLight(0xbfd9f5, 0x53614f, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 2400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const world = buildWorld3(scene, seed);
  const plane = buildPlane3();
  scene.add(plane.group);

  const chaseCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 15000);
  scene.add(chaseCam);
  // Sun glare: an additive sprite pinned to the sun each frame.
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,236,190,0.95)', 'rgba(255,236,190,0)'),
    transparent: true, depthWrite: false, depthTest: false, opacity: 0.85,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  glare.scale.setScalar(1500);
  glare.renderOrder = 5;
  scene.add(glare);

  // Ring-pass bursts: one Points pool, sparks with a short bright life.
  const MAX_SPARKS = 240;
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffa63e, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0;

  // Chase-camera state: smoothed heading and position so the view swings
  // behind the plane instead of snapping to it.
  let camHeading = 0;
  let camPos = vec3(0, 60, 600);
  let shakeT = 0;
  let lastView = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    chaseCam.aspect = w / h;
    chaseCam.updateProjectionMatrix();
    plane.cockpitCamera.aspect = w / h;
    plane.cockpitCamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function burst(pos) {
    for (let i = 0; i < 42; i += 1) {
      const j = sparkCursor;
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      sparkPos[j * 3] = pos.x;
      sparkPos[j * 3 + 1] = pos.y;
      sparkPos[j * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = 7 + Math.random() * 13;
      sparkVel[j * 3] = Math.cos(a) * Math.cos(b) * sp;
      sparkVel[j * 3 + 1] = Math.sin(b) * sp;
      sparkVel[j * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
      sparkLife[j] = 0.85;
    }
  }

  function stepSparks(dt) {
    let any = false;
    for (let j = 0; j < MAX_SPARKS; j += 1) {
      if (sparkLife[j] <= 0) continue;
      any = true;
      sparkLife[j] -= dt;
      sparkVel[j * 3 + 1] -= 5.5 * dt;
      sparkPos[j * 3] += sparkVel[j * 3] * dt;
      sparkPos[j * 3 + 1] += sparkVel[j * 3 + 1] * dt;
      sparkPos[j * 3 + 2] += sparkVel[j * 3 + 2] * dt;
      if (sparkLife[j] <= 0) sparkPos[j * 3 + 1] = -100;
    }
    if (any) sparkGeo.attributes.position.needsUpdate = true;
  }

  function posePlane(f) {
    // The flight state's pos.y rides PLANE.gearHeight above the ground;
    // the model's origin is the ground under the gear, so it sits lower.
    plane.group.position.set(f.pos.x, f.pos.y - 1.55, f.pos.z);
    plane.group.rotation.order = 'YXZ';
    plane.group.rotation.y = -f.heading;
    plane.group.rotation.x = f.pitch;
    plane.group.rotation.z = -f.roll;
  }

  function draw(state) {
    const { flight: f, view, dt, elapsed } = state;
    posePlane(f);
    plane.setView(view);
    plane.update(f);

    // Rings: the next one burns amber and breathes; flown ones go green.
    world.rings.forEach((r, i) => {
      if (i < f.ringsPassed) {
        r.mat.emissive.setHex(0x2aff7a);
        r.mat.emissiveIntensity = 0.5;
        r.glow.material.opacity = 0;
      } else if (i === f.ringsPassed) {
        r.mat.emissive.setHex(0xff8c1a);
        r.mat.emissiveIntensity = 1.5 + Math.sin(elapsed * 4.2) * 0.45;
        r.glow.material.opacity = 0.2 + Math.sin(elapsed * 4.2) * 0.06;
      } else {
        r.mat.emissive.setHex(0x18c8b8);
        r.mat.emissiveIntensity = 0.55;
        r.glow.material.opacity = 0;
      }
    });

    // Sea sparkle crawls; clouds drift east and wrap around the course.
    world.seaBump.offset.set((elapsed * 0.006) % 1, (elapsed * 0.0023) % 1);
    world.clouds.position.x = (elapsed * 1.6) % 2400;
    stepSparks(dt);

    // The shadow-casting sun follows the plane so shadows stay crisp.
    sun.position.set(
      f.pos.x + SUN_DIR.x * 1100,
      f.pos.y + SUN_DIR.y * 1100,
      f.pos.z + SUN_DIR.z * 1100,
    );
    sun.target.position.set(f.pos.x, f.pos.y, f.pos.z);

    let camera;
    if (view === 'cockpit') {
      camera = plane.cockpitCamera;
      glare.material.opacity = 0;
    } else if (state.cam) {
      // A staged camera, for the screenshot scenes only: a fixed offset
      // in the plane's own frame (right / back / up) looking at a point
      // ahead of the nose, so a scene can show the flank, the canopy and
      // the livery instead of the regulation view from dead astern.
      camera = chaseCam;
      const c = state.cam;
      const fx = Math.sin(f.heading);
      const fz = -Math.cos(f.heading);
      const rx = -fz;
      const rz = fx;
      camPos = vec3(
        f.pos.x + rx * c.right - fx * c.back,
        f.pos.y + c.up,
        f.pos.z + rz * c.right - fz * c.back,
      );
      chaseCam.position.copy(camPos);
      chaseCam.up.set(0, 1, 0);
      chaseCam.lookAt(
        f.pos.x + fx * c.ahead + rx * (c.lat || 0),
        f.pos.y + 1.2,
        f.pos.z + fz * c.ahead + rz * (c.lat || 0),
      );
      chaseCam.rotateZ(-f.roll * 0.35);
      glare.position.set(
        camPos.x + SUN_DIR.x * 6000,
        camPos.y + SUN_DIR.y * 6000,
        camPos.z + SUN_DIR.z * 6000,
      );
      glare.material.opacity = 0.8;
    } else {
      camera = chaseCam;
      // Swing the chase heading toward the plane's, with lag.
      const dh = ((f.heading - camHeading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      camHeading = wrapAngle(camHeading + dh * Math.min(1, dt * 3.2));
      if (lastView !== 'chase') {
        camHeading = f.heading;
        camPos = vec3(f.pos.x - Math.sin(f.heading) * 15, f.pos.y + 5.5, f.pos.z + Math.cos(f.heading) * 15);
      }
      const back = vec3(-Math.sin(camHeading), 0, Math.cos(camHeading));
      const want = vec3(
        f.pos.x + back.x * 15.5,
        f.pos.y + 5.2,
        f.pos.z + back.z * 15.5,
      );
      const k = Math.min(1, dt * 5.5);
      camPos = vec3(
        lerp(camPos.x, want.x, k),
        lerp(camPos.y, want.y, k),
        lerp(camPos.z, want.z, k),
      );
      if (shakeT > 0) {
        shakeT = Math.max(0, shakeT - dt * 1.4);
        const s = shakeT * shakeT * 0.55;
        camPos.x += (Math.random() - 0.5) * s;
        camPos.y += (Math.random() - 0.5) * s;
      }
      chaseCam.position.copy(camPos);
      chaseCam.up.set(0, 1, 0);
      const fwd = headingForward(f.heading, f.pitch);
      chaseCam.lookAt(
        f.pos.x + fwd.x * 26,
        f.pos.y + 1.2 + fwd.y * 26,
        f.pos.z + fwd.z * 26,
      );
      // Lean a third of the way into the bank, so turns feel flown.
      chaseCam.rotateZ(-f.roll * 0.35);
      // Pin the glare sprite to the sun, far past the plane.
      glare.position.set(
        camPos.x + SUN_DIR.x * 6000,
        camPos.y + SUN_DIR.y * 6000,
        camPos.z + SUN_DIR.z * 6000,
      );
      glare.material.opacity = 0.8;
    }
    lastView = view;
    renderer.render(scene, camera);
  }

  return {
    draw,
    burst,
    shake(amount) {
      shakeT = Math.max(shakeT, amount);
    },
    /** Live altitude readout for the loop's AGL cue (kept for parity). */
    altitudeOf: altitude,
    RINGS,
  };
}
