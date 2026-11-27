// The small vector and matrix kit the renderer and the flight model share.
// Conventions: right-handed, +Y up, the plane's nose is -Z in its own space,
// headings are radians measured from north (-Z world) turning clockwise
// (toward +X, east) seen from above. Matrices are column-major Float32Array
// of 16, the layout WebGL's uniformMatrix4fv takes directly.

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Wraps an angle into [0, 2*PI). */
export function wrapAngle(a) {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

export function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function sub(a, b) {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function length(v) {
  return Math.hypot(v.x, v.y, v.z);
}

export function distance(a, b) {
  return length(sub(a, b));
}

/** The identity matrix. */
export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

/** out = a * b (apply b first, then a). */
export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function mat4Translate(x, y, z) {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function mat4Scale(x, y, z) {
  const m = mat4Identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

export function mat4RotateX(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  const m = mat4Identity();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function mat4RotateY(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  const m = mat4Identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function mat4RotateZ(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  const m = mat4Identity();
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

/**
 * A rotation from heading, pitch and roll in flight order: yaw about world
 * Y, then pitch about the new X, then roll about the new Z — the order a
 * pilot feels. The signs follow the heading convention at the top of this
 * file: with heading measured clockwise from north, the yaw applied is
 * -heading and the roll is -roll, so the matrix's nose vector is exactly
 * (sin h · cos p, sin p, −cos h · cos p), the flight model's forward.
 */
export function mat4FromYawPitchRoll(heading, pitch, roll) {
  return mat4Multiply(
    mat4RotateY(-heading),
    mat4Multiply(mat4RotateX(pitch), mat4RotateZ(-roll)),
  );
}

/** View matrix looking from eye toward target with the given up vector. */
export function mat4LookAt(eye, target, up) {
  const zAxis = sub(eye, target);
  const zLen = length(zAxis) || 1;
  zAxis.x /= zLen; zAxis.y /= zLen; zAxis.z /= zLen;
  const xAxis = vec3(
    up.y * zAxis.z - up.z * zAxis.y,
    up.z * zAxis.x - up.x * zAxis.z,
    up.x * zAxis.y - up.y * zAxis.x,
  );
  const xLen = length(xAxis) || 1;
  xAxis.x /= xLen; xAxis.y /= xLen; xAxis.z /= xLen;
  const yAxis = vec3(
    zAxis.y * xAxis.z - zAxis.z * xAxis.y,
    zAxis.z * xAxis.x - zAxis.x * xAxis.z,
    zAxis.x * xAxis.y - zAxis.y * xAxis.x,
  );
  const m = new Float32Array(16);
  m[0] = xAxis.x; m[1] = yAxis.x; m[2] = zAxis.x;
  m[4] = xAxis.y; m[5] = yAxis.y; m[6] = zAxis.y;
  m[8] = xAxis.z; m[9] = yAxis.z; m[10] = zAxis.z;
  m[12] = -(xAxis.x * eye.x + xAxis.y * eye.y + xAxis.z * eye.z);
  m[13] = -(yAxis.x * eye.x + yAxis.y * eye.y + yAxis.z * eye.z);
  m[14] = -(zAxis.x * eye.x + zAxis.y * eye.y + zAxis.z * eye.z);
  m[15] = 1;
  return m;
}

/** Applies a matrix to a point (w = 1) and returns a fresh vec3. */
export function transformPoint(m, p) {
  const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
  const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
  const z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
  const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
  const inv = w !== 0 ? 1 / w : 1;
  return vec3(x * inv, y * inv, z * inv);
}

/** Applies only the rotation part of a matrix to a direction. */
export function transformDirection(m, p) {
  return vec3(
    m[0] * p.x + m[4] * p.y + m[8] * p.z,
    m[1] * p.x + m[5] * p.y + m[9] * p.z,
    m[2] * p.x + m[6] * p.y + m[10] * p.z,
  );
}
