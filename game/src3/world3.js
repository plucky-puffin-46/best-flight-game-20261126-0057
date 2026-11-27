// The archipelago in Three.js: a gradient sky with a real sun, a glittering
// sea, heightfield islands coloured by height and slope and grained with a
// procedural texture, instanced pines and oaks, houses with lit windows,
// the lighthouse, the painted runway, and the eight rings of the course.
// The ground is the same analytic heightAt the flight model collides with,
// sampled vertex by vertex, so what you see is exactly what you can hit.

import { PALETTE, RING_RADIUS, RINGS, RUNWAY, WORLD_HALF } from '../src/config.js';
import { heightAt, ISLANDS, scatterWorld, slopeAt } from '../src/terrain.js';
import { clamp, lerp } from '../src/math.js';
import {
  cloudSpriteTexture, glowTexture, houseWallTexture, runwayTexture,
  seaBumpTexture, terrainDetailTexture,
} from './textures.js';

const THREE = window.THREE;

/** Sun direction (from the scene toward the sun): high, warm, south-west. */
export const SUN_DIR = new THREE.Vector3(-0.52, 0.78, 0.34).normalize();

/**
 * Palette colours were authored as display (sRGB) values. Three's pipeline
 * works in linear space and encodes on output, so anything fed to a lit
 * material must be converted or it blows out pale. The sky shader writes
 * its colours raw to the framebuffer, so it alone takes them unconverted.
 */
function rgb(arr, raw = false) {
  const c = new THREE.Color(arr[0], arr[1], arr[2]);
  return raw ? c : c.convertSRGBToLinear();
}

/** Ground colour at a point: sand, grass, meadow patches, rock, snow. */
function groundColour(x, z, h, slope, out) {
  const sand = rgb(PALETTE.sand);
  const grass = rgb(PALETTE.grass);
  const meadow = rgb(PALETTE.meadow);
  const rock = rgb(PALETTE.rock);
  const snow = rgb(PALETTE.snow);
  if (h < 1.2) {
    out.copy(sand).lerp(rgb(PALETTE.seaShallow), clamp(-h / 14, 0, 0.55));
    return out;
  }
  // Patchwork meadows: broad soft cells of lighter grass.
  const patch = Math.sin(x * 0.006 + 2.1) * Math.sin(z * 0.0052 - 0.7);
  out.copy(grass).lerp(meadow, clamp(patch * 0.5 + 0.32, 0, 1));
  out.lerp(sand, clamp(1 - (h - 1.2) / 2.6, 0, 1));
  out.lerp(rock, clamp((slope - 0.34) / 0.3, 0, 1));
  // Snow is a height story first: Mount Puffin's dome reads slope ~1 over
  // its whole upper cone, so a slope gate starves the cap to nothing. Let
  // altitude rule and slope only thin the snow a little, so the summit
  // wears a clear white cap over the rock.
  out.lerp(snow, clamp((h - 185) / 45, 0, 1) * clamp(1.3 - slope * 0.55, 0, 1));
  return out;
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(8800, 32, 18);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: rgb(PALETTE.skyTop, true) },
      horizon: { value: rgb(PALETTE.skyHorizon, true) },
      sunDir: { value: SUN_DIR },
      sunTint: { value: new THREE.Color(1.0, 0.83, 0.58) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 sunDir;
      uniform vec3 sunTint;
      void main() {
        vec3 d = normalize(vDir);
        float t = pow(max(d.y, 0.0), 0.55);
        vec3 col = mix(horizon, top, t);
        if (d.y < 0.0) col = mix(horizon, horizon * 0.82, clamp(-d.y * 3.0, 0.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        col += sunTint * pow(s, 16.0) * 0.16;
        col += sunTint * smoothstep(0.99935, 0.99975, s) * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

function buildSea(scene) {
  const bump = seaBumpTexture();
  const geo = new THREE.CircleGeometry(9200, 72);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({
    color: rgb(PALETTE.sea),
    specular: new THREE.Color(0.5, 0.62, 0.75),
    shininess: 90,
    transparent: true,
    opacity: 0.92,
    bumpMap: bump,
    bumpScale: 0.9,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = 0;
  scene.add(sea);
  return { sea, bump };
}

function buildTerrain(scene) {
  const size = WORLD_HALF * 2;
  const seg = 232;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    groundColour(x, z, h, slopeAt(x, z), c);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: terrainDetailTexture(),
    roughness: 0.96,
    metalness: 0.0,
  });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  return terrain;
}

/** A triangular-prism roof, ridge along Z, sized to cap a house box. */
function prismGeometry(w, h, d) {
  const hw = w / 2;
  const hd = d / 2;
  const v = [
    // left slope, right slope, two gable triangles, underside skipped
    -hw, 0, -hd, 0, h, -hd, 0, h, hd, -hw, 0, -hd, 0, h, hd, -hw, 0, hd,
    hw, 0, hd, 0, h, hd, 0, h, -hd, hw, 0, hd, 0, h, -hd, hw, 0, -hd,
    -hw, 0, hd, 0, h, hd, hw, 0, hd,
    hw, 0, -hd, 0, h, -hd, -hw, 0, -hd,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  geo.computeVertexNormals();
  return geo;
}

const HOUSE_STYLES = [
  ['#e8e0cc', '#8a4b32'], ['#dfe7ea', '#5d707c'], ['#f0dcc0', '#96502e'],
  ['#e6d6d0', '#6e4a3a'], ['#dde8d2', '#54683f'],
];

function buildScatter(scene, seed) {
  const { trees, houses } = scatterWorld(seed);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.52, 3.2, 6);
  trunkGeo.translate(0, 1.6, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);

  const pineGeo = new THREE.ConeGeometry(3.1, 9.5, 8);
  pineGeo.translate(0, 7.6, 0);
  const pineMat = new THREE.MeshStandardMaterial({ color: rgb(PALETTE.forest), roughness: 1, flatShading: true });
  const pines = trees.filter((t) => t.kind === 0);
  const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);

  const oakGeo = new THREE.IcosahedronGeometry(3.7, 1);
  oakGeo.scale(1, 0.82, 1);
  oakGeo.translate(0, 6.4, 0);
  const oakMat = new THREE.MeshStandardMaterial({ color: 0x4d7d33, roughness: 1, flatShading: true });
  const oaks = trees.filter((t) => t.kind === 1);
  const oakMesh = new THREE.InstancedMesh(oakGeo, oakMat, oaks.length);

  trees.forEach((t, i) => {
    dummy.position.set(t.x, t.y - 0.3, t.z);
    dummy.rotation.set(t.lean, i * 2.39, t.lean * 0.7);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  pines.forEach((t, i) => {
    dummy.position.set(t.x, t.y - 0.3, t.z);
    dummy.rotation.set(t.lean, i * 1.71, t.lean * 0.7);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    pineMesh.setMatrixAt(i, dummy.matrix);
  });
  oaks.forEach((t, i) => {
    dummy.position.set(t.x, t.y - 0.3, t.z);
    dummy.rotation.set(0, i * 2.03, 0);
    dummy.scale.setScalar(t.s * 1.05);
    dummy.updateMatrix();
    oakMesh.setMatrixAt(i, dummy.matrix);
  });
  for (const mesh of [trunks, pineMesh, oakMesh]) {
    mesh.castShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4632, roughness: 0.9, flatShading: true });
  const wallMats = HOUSE_STYLES.map(([base, trim]) => new THREE.MeshStandardMaterial({
    map: houseWallTexture(base, trim), roughness: 0.95,
  }));
  houses.forEach((house, i) => {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(house.w, house.h, house.d), wallMats[i % wallMats.length]);
    walls.position.y = house.h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    const roof = new THREE.Mesh(prismGeometry(house.w + 1.2, house.h * 0.52, house.d + 1.2), roofMat);
    roof.position.y = house.h;
    roof.castShadow = true;
    g.add(walls, roof);
    g.position.set(house.x, house.y - 0.2, house.z);
    g.rotation.y = house.rot;
    group.add(g);
  });
  scene.add(group);
}

function buildLighthouse(scene) {
  const x = 180;
  const z = -1715;
  const y = heightAt(x, z);
  const group = new THREE.Group();
  const [canvas, ctx] = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    return [c, c.getContext('2d')];
  })();
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#c93a2e';
  ctx.fillRect(0, 22, 64, 26);
  ctx.fillRect(0, 76, 64, 26);
  const stripeTex = new THREE.CanvasTexture(canvas);
  stripeTex.encoding = THREE.sRGBEncoding;
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 3.1, 17, 14),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 }),
  );
  tower.position.y = 8.5;
  tower.castShadow = true;
  const gallery = new THREE.Mesh(
    new THREE.CylinderGeometry(3.0, 3.0, 0.8, 14),
    new THREE.MeshStandardMaterial({ color: 0x2c343c, roughness: 0.7 }),
  );
  gallery.position.y = 17.4;
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffc95e, emissiveIntensity: 2.2,
  });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 10), lampMat);
  lamp.position.y = 19.2;
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x2c343c, roughness: 0.7 }),
  );
  cap.position.y = 21.4;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,214,130,0.85)', 'rgba(255,214,130,0)'),
    transparent: true, depthWrite: false, opacity: 0.75,
  }));
  glow.scale.setScalar(26);
  glow.position.y = 19.2;
  group.add(tower, gallery, lamp, cap, glow);
  group.position.set(x, Math.max(y, 0.5), z);
  scene.add(group);
}

function buildRunway(scene) {
  const group = new THREE.Group();
  const y = RUNWAY.height;
  // Dirt apron under the asphalt.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length + 26, RUNWAY.width + 16),
    new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: 1 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(RUNWAY.centreX, y + 0.06, RUNWAY.centreZ);
  apron.receiveShadow = true;
  group.add(apron);
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width),
    new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.94 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.centreX, y + 0.14, RUNWAY.centreZ);
  strip.receiveShadow = true;
  group.add(strip);
  // Edge lights and the green approach bar, west end (landings run east).
  const lightGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffdf9e, emissiveIntensity: 1.6 });
  const spots = [];
  for (let x = -RUNWAY.length / 2; x <= RUNWAY.length / 2; x += 38) {
    spots.push([x, -RUNWAY.width / 2 - 2.2]);
    spots.push([x, RUNWAY.width / 2 + 2.2]);
  }
  const edge = new THREE.InstancedMesh(lightGeo, edgeMat, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([dx, dz], i) => {
    dummy.position.set(RUNWAY.centreX + dx, y + 0.5, RUNWAY.centreZ + dz);
    dummy.updateMatrix();
    edge.setMatrixAt(i, dummy.matrix);
  });
  edge.instanceMatrix.needsUpdate = true;
  group.add(edge);
  const barMat = new THREE.MeshStandardMaterial({ color: 0xbfffc9, emissive: 0x39e05a, emissiveIntensity: 1.8 });
  for (let i = 0; i < 5; i += 1) {
    const bulb = new THREE.Mesh(lightGeo, barMat);
    bulb.position.set(RUNWAY.centreX - RUNWAY.length / 2 - 14 - i * 15, y + 0.5, RUNWAY.centreZ);
    group.add(bulb);
  }
  scene.add(group);
}

function buildRings(scene) {
  const group = new THREE.Group();
  const glowTex = glowTexture('rgba(255,190,90,0.9)', 'rgba(255,190,90,0)');
  const rings = RINGS.map((ring, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x201408, emissive: 0xff8c1a, emissiveIntensity: 0.7, roughness: 0.4,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 0.85, 12, 44), mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    mesh.lookAt(ring.x + Math.sin(ring.heading), ring.y, ring.z - Math.cos(ring.heading));
    group.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, depthWrite: false, opacity: 0,
      blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(RING_RADIUS * 1.9);
    glow.position.copy(mesh.position);
    group.add(glow);
    return { mesh, mat, glow, index: i };
  });
  scene.add(group);
  return rings;
}

function buildClouds(scene) {
  const group = new THREE.Group();
  const tex = cloudSpriteTexture();
  const clusters = [];
  let n = 0;
  for (let c = 0; c < 15; c += 1) {
    const a = (c / 15) * Math.PI * 2 + (c % 3) * 0.35;
    const dist = 700 + (c * 397) % 1900;
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist - 200;
    const cy = 210 + (c * 67) % 190;
    const puffs = 3 + (c % 3);
    for (let p = 0; p < puffs; p += 1) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0.82,
      }));
      sp.position.set(cx + (p - puffs / 2) * 95 + (n % 5) * 14, cy + (p % 2) * 22, cz + ((p * 37) % 60) - 30);
      sp.scale.set(230 + (n % 4) * 55, 105 + (n % 3) * 26, 1);
      group.add(sp);
      n += 1;
    }
    clusters.push({ x: cx, z: cz });
  }
  // A few solid puffs low over the course, for parallax in the cockpit.
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x46586e, emissiveIntensity: 0.3 });
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const solidAt = [[300, 235, -700], [-650, 265, -250], [720, 205, 420], [-240, 290, -1250], [1050, 240, -1050]];
  for (const [x, y, z] of solidAt) {
    const cluster = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const m = new THREE.Mesh(puffGeo, puffMat);
      m.position.set((i - 1.5) * 26, (i % 2) * 7, ((i * 29) % 17) - 8);
      m.scale.set(30 - i * 3.5, 15 - i * 1.4, 22 - i * 2);
      cluster.add(m);
    }
    cluster.position.set(x, y, z);
    group.add(cluster);
  }
  scene.add(group);
  return group;
}

/**
 * Builds the whole visible world into the scene. Returns the animated
 * pieces the renderer drives: rings (with materials to pulse), the sea's
 * bump texture (scrolled for sparkle), and the cloud group (slow drift).
 */
export function buildWorld3(scene, seed) {
  buildSky(scene);
  const { bump } = buildSea(scene);
  buildTerrain(scene);
  buildScatter(scene, seed);
  buildLighthouse(scene);
  buildRunway(scene);
  const rings = buildRings(scene);
  const clouds = buildClouds(scene);
  return { rings, seaBump: bump, clouds };
}
